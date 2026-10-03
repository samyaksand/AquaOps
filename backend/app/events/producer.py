"""Kafka producer abstraction.

Publishing is best-effort: a request that triggered a computation has already
answered its caller by the time it publishes, so a broker fault here is
logged and swallowed rather than raised. Event transport augments the
existing direct response/broadcast path; it never gates it.
"""

from __future__ import annotations

import asyncio

from aiokafka import AIOKafkaProducer
from aiokafka.errors import KafkaError

from app.core.config import get_settings
from app.core.logging import get_logger
from app.events.schemas import EventEnvelope
from app.events.topics import Topic
from app.observability import KAFKA_EVENTS_PUBLISHED

logger = get_logger(__name__)


class EventProducer:
    """Lazily-connected, best-effort Kafka producer.

    One instance is shared for the process lifetime, but the underlying
    `AIOKafkaProducer` is bound to the asyncio loop it was started on. A
    synchronous test client (or any caller) can run each call on a fresh
    loop, so the client is recreated whenever the running loop changes
    rather than reused across loops, which `aiokafka` cannot do.
    """

    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()
        self._settings = get_settings()

    async def _get_producer(self) -> AIOKafkaProducer | None:
        if not self._settings.kafka_enabled:
            return None

        current_loop = asyncio.get_running_loop()
        if self._producer is not None and self._loop is not current_loop:
            # A previous loop is gone (e.g. a prior test's TestClient loop);
            # the old producer cannot be stopped on it, so just drop it.
            self._producer = None

        if self._producer is not None:
            return self._producer

        async with self._lock:
            if self._producer is not None:
                return self._producer
            producer = AIOKafkaProducer(
                bootstrap_servers=self._settings.kafka_bootstrap_servers,
                value_serializer=lambda value: value.encode("utf-8"),
            )
            try:
                await producer.start()
            except KafkaError:
                logger.warning(
                    "kafka producer could not connect to %s; "
                    "publishing is disabled for this process",
                    self._settings.kafka_bootstrap_servers,
                )
                return None
            self._producer = producer
            self._loop = current_loop
            return self._producer

    async def publish(self, topic: Topic, envelope: EventEnvelope) -> bool:
        """Publish one event. Returns whether it was actually sent."""
        producer = await self._get_producer()
        if producer is None:
            outcome = "disabled" if not self._settings.kafka_enabled else "failed"
            KAFKA_EVENTS_PUBLISHED.labels(topic=topic.value, outcome=outcome).inc()
            return False
        try:
            await producer.send_and_wait(
                topic.value, envelope.model_dump_json()
            )
        except KafkaError:
            logger.warning("failed to publish to topic %s", topic.value, exc_info=True)
            KAFKA_EVENTS_PUBLISHED.labels(topic=topic.value, outcome="failed").inc()
            return False
        KAFKA_EVENTS_PUBLISHED.labels(topic=topic.value, outcome="sent").inc()
        return True

    async def close(self) -> None:
        if self._producer is None:
            return
        if self._loop is not asyncio.get_running_loop():
            # Bound to a loop that is no longer running; nothing to stop.
            self._producer = None
            self._loop = None
            return
        await self._producer.stop()
        self._producer = None
        self._loop = None


_producer = EventProducer()


def get_event_producer() -> EventProducer:
    """Return the process-wide event producer."""
    return _producer
