"""Shared async Redis connection."""

from __future__ import annotations

import asyncio

from redis.asyncio import Redis

from app.core.config import get_settings

_client: Redis | None = None
_loop: asyncio.AbstractEventLoop | None = None


def get_redis() -> Redis:
    """Return the process-wide Redis client, created lazily.

    `redis.asyncio.Redis` pools connections internally, so one client is
    normally shared for the process lifetime rather than opened per call.
    The pool is bound to the loop it was created on, though, so a caller
    running on a fresh loop (a synchronous test client, most notably) gets a
    fresh client instead of reusing one tied to a loop that is gone.
    """
    global _client, _loop
    current_loop = asyncio.get_running_loop()
    if _client is not None and _loop is not current_loop:
        _client = None
    if _client is None:
        settings = get_settings()
        _client = Redis.from_url(settings.redis_url, decode_responses=True)
        _loop = current_loop
    return _client


async def close_redis() -> None:
    global _client, _loop
    if _client is None:
        return
    if _loop is asyncio.get_running_loop():
        await _client.aclose()
    _client = None
    _loop = None
