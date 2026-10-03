"""Integration tests for the Kafka event transport and Redis state cache.

These exercise the real local Docker services (`infrastructure/docker`), not
mocks: the point is to prove messages actually cross the wire. Each test
skips itself if the corresponding service is unreachable, so the suite still
runs green in an environment without Docker — it never fails for lack of
infrastructure, only for an actual regression once the infrastructure is up.
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from redis.exceptions import RedisError

from app.cache.redis_client import close_redis, get_redis
from app.cache.state_cache import PUBSUB_CHANNEL, StateCache
from app.events.consumer import EventConsumer
from app.events.producer import EventProducer
from app.events.schemas import AllocationComputedEvent, EventEnvelope
from app.events.topics import Topic
from app.schemas.allocation import AllocationMetricsOut, AllocationResultOut


def _sample_allocation() -> AllocationResultOut:
    metrics = AllocationMetricsOut(
        total_demand_m3_per_day=1,
        total_supplied_m3_per_day=1,
        total_unmet_m3_per_day=0,
        total_withdrawn_m3_per_day=1,
        total_transit_loss_m3_per_day=0,
        total_supply_available_m3_per_day=1,
        demand_coverage_ratio=1,
        total_population=0,
        population_served=0,
        population_fully_served=0,
        population_weighted_satisfaction=1,
        critical_facility_coverage=1,
        critical_facility_full_coverage=1,
        delivery_efficiency=1,
        supply_utilization=1,
        minimum_demand_shortfalls=[],
    )
    return AllocationResultOut(
        strategy="balanced", metrics=metrics, allocations=[], source_withdrawals=[]
    )


@pytest.fixture
async def redis_client():
    try:
        client = get_redis()
        await client.ping()
    except RedisError:
        pytest.skip("Redis is not reachable at the configured URL")
    yield client
    await close_redis()


# -- Redis state cache ---------------------------------------------------------


async def test_cache_roundtrips_latest_allocation(redis_client):
    cache = StateCache(redis_client)
    payload = f'{{"marker": "{uuid.uuid4()}"}}'

    await cache.set_latest_allocation(payload)
    assert await cache.get_latest_allocation() == payload


async def test_cache_get_is_none_for_missing_key(redis_client):
    cache = StateCache(redis_client)
    await redis_client.delete("aquaops:state:latest_allocation")
    assert await cache.get_latest_allocation() is None


async def test_cache_publish_reaches_a_subscriber(redis_client):
    cache = StateCache(redis_client)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe(PUBSUB_CHANNEL)
    try:
        marker = str(uuid.uuid4())

        async def publish_soon() -> None:
            await asyncio.sleep(0.2)
            await cache.publish(marker)

        task = asyncio.ensure_future(publish_soon())
        try:
            async for message in pubsub.listen():
                if message["type"] == "message":
                    assert message["data"] == marker
                    break
        finally:
            await task
    finally:
        await pubsub.unsubscribe(PUBSUB_CHANNEL)
        await pubsub.aclose()


# -- Kafka producer/consumer ---------------------------------------------------


@pytest.fixture
async def kafka_producer():
    producer = EventProducer()
    envelope = EventEnvelope(
        payload=AllocationComputedEvent(allocation=_sample_allocation())
    )
    # Probe reachability with a real publish attempt rather than assuming;
    # `publish` already swallows broker faults and reports them as `False`.
    reachable = await producer.publish(Topic.ALLOCATION_COMPUTED, envelope)
    if not reachable:
        await producer.close()
        pytest.skip("Kafka is not reachable at the configured bootstrap servers")
    yield producer
    await producer.close()


async def test_producer_reports_success_when_broker_is_reachable(kafka_producer):
    envelope = EventEnvelope(
        payload=AllocationComputedEvent(allocation=_sample_allocation())
    )
    assert await kafka_producer.publish(Topic.ALLOCATION_COMPUTED, envelope) is True


async def test_consumer_receives_a_published_event(kafka_producer):
    group_id = f"test-{uuid.uuid4()}"
    consumer = EventConsumer((Topic.ALLOCATION_COMPUTED,), group_id=group_id)
    await consumer.start()
    try:
        events = consumer.events()

        # Give the consumer group time to join and get a partition assignment
        # before publishing, since `auto_offset_reset="latest"` only sees
        # messages produced after the join.
        await asyncio.sleep(3)

        envelope = EventEnvelope(
            payload=AllocationComputedEvent(allocation=_sample_allocation())
        )
        sent = await kafka_producer.publish(Topic.ALLOCATION_COMPUTED, envelope)
        assert sent is True

        received = await asyncio.wait_for(events.__anext__(), timeout=15)
        assert received.event_id == envelope.event_id
        assert received.payload.type == "allocation_computed"
    finally:
        await consumer.stop()


async def test_producer_disabled_short_circuits(monkeypatch):
    """With Kafka disabled, publishing must report failure without erroring."""
    from app.core import config

    config.get_settings.cache_clear()
    monkeypatch.setenv("KAFKA_ENABLED", "false")
    config.get_settings.cache_clear()
    try:
        producer = EventProducer()
        envelope = EventEnvelope(
            payload=AllocationComputedEvent(allocation=_sample_allocation())
        )
        assert await producer.publish(Topic.ALLOCATION_COMPUTED, envelope) is False
        await producer.close()
    finally:
        config.get_settings.cache_clear()
