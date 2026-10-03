"""Tracks connected WebSocket clients and fans messages out to them."""

from __future__ import annotations

import asyncio
import json

from fastapi import WebSocket
from pydantic import BaseModel
from redis.exceptions import RedisError

from app.cache.redis_client import get_redis
from app.cache.state_cache import PUBSUB_CHANNEL
from app.core.logging import get_logger
from app.observability import WS_CONNECTIONS, WS_EVENTS

logger = get_logger(__name__)


class ConnectionManager:
    """Registry of live WebSocket clients.

    A single lock guards the registry so concurrent connects, disconnects, and
    broadcasts cannot interleave into an inconsistent view. Sends that fail are
    treated as disconnections: a client that cannot be written to is gone, and
    one dead client must never block delivery to the others.
    """

    def __init__(self) -> None:
        self._clients: dict[str, WebSocket] = {}
        self._lock = asyncio.Lock()
        self._sequence = 0

    @property
    def client_count(self) -> int:
        return len(self._clients)

    @property
    def client_ids(self) -> tuple[str, ...]:
        return tuple(self._clients)

    async def connect(self, websocket: WebSocket) -> str:
        """Accept a connection and register it under a new client id."""
        await websocket.accept()
        async with self._lock:
            self._sequence += 1
            client_id = f"client-{self._sequence}"
            self._clients[client_id] = websocket
        WS_CONNECTIONS.set(self.client_count)
        logger.info("websocket %s connected (%d live)", client_id, self.client_count)
        return client_id

    async def disconnect(self, client_id: str) -> None:
        """Deregister a client. Safe to call more than once."""
        async with self._lock:
            existed = self._clients.pop(client_id, None) is not None
        if existed:
            WS_CONNECTIONS.set(self.client_count)
            logger.info(
                "websocket %s disconnected (%d live)", client_id, self.client_count
            )

    async def send(self, client_id: str, message: BaseModel) -> bool:
        """Send to one client. Returns False if the client was unreachable."""
        async with self._lock:
            websocket = self._clients.get(client_id)
        if websocket is None:
            return False
        try:
            await websocket.send_json(message.model_dump(mode="json"))
        except Exception:
            logger.warning("websocket %s send failed; dropping", client_id)
            await self.disconnect(client_id)
            return False
        return True

    async def broadcast(self, message: BaseModel) -> int:
        """Send to every live client. Returns the number of clients reached."""
        async with self._lock:
            targets = list(self._clients.items())

        payload = message.model_dump(mode="json")
        stale: list[str] = []
        delivered = 0

        for client_id, websocket in targets:
            try:
                await websocket.send_json(payload)
                delivered += 1
            except Exception:
                logger.warning("websocket %s broadcast failed; dropping", client_id)
                stale.append(client_id)

        for client_id in stale:
            await self.disconnect(client_id)

        return delivered

    async def broadcast_raw(self, payload: dict) -> int:
        """Send an already-serialized payload to every live client.

        Used for messages relayed from Redis pub/sub, which arrive as JSON
        from another process rather than as a local `BaseModel`.
        """
        async with self._lock:
            targets = list(self._clients.items())

        stale: list[str] = []
        delivered = 0
        for client_id, websocket in targets:
            try:
                await websocket.send_json(payload)
                delivered += 1
            except Exception:
                logger.warning("websocket %s broadcast failed; dropping", client_id)
                stale.append(client_id)

        for client_id in stale:
            await self.disconnect(client_id)

        return delivered

    async def listen_to_redis(self) -> None:
        """Subscribe to the shared pub/sub channel and relay to local clients.

        Runs for the process lifetime as a background task. Events published
        by this same process's own request handlers are relayed back too —
        harmless, since a client applying the same allocation twice is a
        no-op — which keeps the fanout path uniform instead of needing a
        special case for "my own event came back to me".
        """
        try:
            redis = get_redis()
            pubsub = redis.pubsub()
            await pubsub.subscribe(PUBSUB_CHANNEL)
        except RedisError:
            logger.warning(
                "could not subscribe to redis pub/sub; realtime fanout from "
                "other processes/the worker is disabled for this process",
                exc_info=True,
            )
            return

        logger.info("subscribed to redis channel %s", PUBSUB_CHANNEL)
        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                except (TypeError, ValueError):
                    logger.warning("dropping malformed pub/sub message")
                    continue
                event = _envelope_to_client_event(payload)
                await self.broadcast_raw(event)
                WS_EVENTS.labels(
                    event_type=event.get("type", "unknown"), path="redis_relay"
                ).inc()
        except RedisError:
            logger.warning("redis pub/sub listener failed", exc_info=True)
        finally:
            await pubsub.unsubscribe(PUBSUB_CHANNEL)
            await pubsub.aclose()


def _envelope_to_client_event(envelope: dict) -> dict:
    """Unwrap a Kafka `EventEnvelope` into the bare client-facing event.

    Client code (HTTP responses, direct WebSocket broadcasts) already speaks
    the bare `{"type": ..., ...}` shape; relayed events are normalized to the
    same shape so the frontend has one message format regardless of path.
    """
    payload = envelope.get("payload", envelope)
    return payload


_manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Return the process-wide connection registry."""
    return _manager
