"""Current-state cache: the most recent allocation/scenario outcome.

Keyed globally because AquaOps serves one shared Rivertown network — there is
no per-user or per-session partitioning yet. Reads and writes are
best-effort: a cache miss or a Redis fault means a client falls back to
computing fresh via the REST or WebSocket API, never a hard failure.
"""

from __future__ import annotations

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.cache.redis_client import get_redis
from app.core.logging import get_logger

logger = get_logger(__name__)

LATEST_ALLOCATION_KEY = "aquaops:state:latest_allocation"
LATEST_SCENARIO_KEY = "aquaops:state:latest_scenario_allocation"
PUBSUB_CHANNEL = "aquaops:events"

# Cached state is a snapshot of a point-in-time computation; it should not
# outlive a reasonable operator session if nothing refreshes it.
_TTL_SECONDS = 60 * 60


class StateCache:
    """Thin wrapper over Redis for the current-state cache and fanout."""

    def __init__(self, client: Redis) -> None:
        self._client = client

    async def set_latest_allocation(self, payload: str) -> None:
        await self._safe_set(LATEST_ALLOCATION_KEY, payload)

    async def get_latest_allocation(self) -> str | None:
        return await self._safe_get(LATEST_ALLOCATION_KEY)

    async def set_latest_scenario_allocation(self, payload: str) -> None:
        await self._safe_set(LATEST_SCENARIO_KEY, payload)

    async def get_latest_scenario_allocation(self) -> str | None:
        return await self._safe_get(LATEST_SCENARIO_KEY)

    async def publish(self, message: str) -> None:
        """Fan a message out to every subscribed API process. Best-effort."""
        try:
            await self._client.publish(PUBSUB_CHANNEL, message)
        except RedisError:
            logger.warning("redis publish failed", exc_info=True)

    async def _safe_set(self, key: str, payload: str) -> None:
        try:
            await self._client.set(key, payload, ex=_TTL_SECONDS)
        except RedisError:
            logger.warning("redis set failed for %s", key, exc_info=True)

    async def _safe_get(self, key: str) -> str | None:
        try:
            return await self._client.get(key)
        except RedisError:
            logger.warning("redis get failed for %s", key, exc_info=True)
            return None


def get_state_cache() -> StateCache:
    return StateCache(get_redis())
