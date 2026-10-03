"""Standalone event worker.

Consumes allocation/scenario events from Kafka, updates the Redis
current-state cache, and republishes each event on Redis pub/sub so every
API process's WebSocket layer can broadcast it to its own connected clients
— including clients connected to a process that did not compute the result.

Run as its own process: `python -m app.worker`. It never calls the domain
engines itself; it only relays outcomes that a REST or WebSocket request
already computed and published.
"""

from __future__ import annotations

import asyncio

from app.cache.redis_client import close_redis
from app.cache.state_cache import get_state_cache
from app.core.logging import configure_logging, get_logger
from app.events.consumer import EventConsumer
from app.events.topics import Topic

logger = get_logger(__name__)

CONSUMED_TOPICS = (
    Topic.ALLOCATION_COMPUTED,
    Topic.SCENARIO_APPLIED,
    Topic.SCENARIO_ALLOCATION_COMPUTED,
)


async def run() -> None:
    configure_logging()
    consumer = EventConsumer(CONSUMED_TOPICS, group_id="aquaops-state-worker")
    cache = get_state_cache()

    await consumer.start()
    logger.info("event worker started, consuming %s", [t.value for t in CONSUMED_TOPICS])
    try:
        async for envelope in consumer.events():
            await _handle(envelope, cache)
    finally:
        await consumer.stop()
        await close_redis()


async def _handle(envelope, cache) -> None:
    payload = envelope.payload
    raw = envelope.model_dump_json()

    if payload.type == "allocation_computed":
        await cache.set_latest_allocation(raw)
    elif payload.type in ("scenario_applied", "scenario_allocation_computed"):
        await cache.set_latest_scenario_allocation(raw)

    await cache.publish(raw)
    logger.info("relayed %s (event_id=%s)", payload.type, envelope.event_id)


def main() -> None:
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
