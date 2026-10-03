"""Kafka consumer abstraction.

Used by the worker process (`app/worker.py`), never by the API process — the
API only produces. A consumer here is a plain async iterator over parsed
envelopes so the worker's own logic stays free of Kafka's client API.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from aiokafka import AIOKafkaConsumer

from app.core.config import get_settings
from app.core.logging import get_logger
from app.events.schemas import EventEnvelope
from app.events.topics import Topic

logger = get_logger(__name__)


class EventConsumer:
    """Wraps an `AIOKafkaConsumer` subscribed to a fixed set of topics."""

    def __init__(self, topics: tuple[Topic, ...], group_id: str) -> None:
        settings = get_settings()
        self._consumer = AIOKafkaConsumer(
            *[topic.value for topic in topics],
            bootstrap_servers=settings.kafka_bootstrap_servers,
            group_id=group_id,
            value_deserializer=lambda value: value.decode("utf-8"),
            auto_offset_reset="latest",
        )

    async def start(self) -> None:
        await self._consumer.start()

    async def stop(self) -> None:
        await self._consumer.stop()

    async def events(self) -> AsyncIterator[EventEnvelope]:
        """Yield parsed envelopes, skipping any message that fails to parse."""
        async for message in self._consumer:
            try:
                yield EventEnvelope.model_validate_json(message.value)
            except Exception:
                logger.warning(
                    "dropping unparseable message on topic %s", message.topic,
                    exc_info=True,
                )
