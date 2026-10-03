"""Kafka event transport: topics, schemas, producer and consumer.

This package carries *notifications* about outcomes the domain engines have
already computed (an allocation ran, a scenario was applied) — it never
computes anything itself and is never required for a request to succeed.
Kafka, Redis and the domain/API layers stay decoupled: a request still
answers directly even if the broker is unreachable.
"""

from app.events.schemas import (
    AllocationComputedEvent,
    EventEnvelope,
    ScenarioAllocationComputedEvent,
    ScenarioAppliedEvent,
)
from app.events.topics import Topic

__all__ = [
    "AllocationComputedEvent",
    "EventEnvelope",
    "ScenarioAllocationComputedEvent",
    "ScenarioAppliedEvent",
    "Topic",
]
