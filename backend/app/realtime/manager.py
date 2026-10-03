"""Tracks connected WebSocket clients and fans messages out to them."""

from __future__ import annotations

import asyncio

from fastapi import WebSocket
from pydantic import BaseModel

from app.core.logging import get_logger

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
        logger.info("websocket %s connected (%d live)", client_id, self.client_count)
        return client_id

    async def disconnect(self, client_id: str) -> None:
        """Deregister a client. Safe to call more than once."""
        async with self._lock:
            existed = self._clients.pop(client_id, None) is not None
        if existed:
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


_manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Return the process-wide connection registry."""
    return _manager
