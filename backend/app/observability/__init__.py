"""Observability: Prometheus metrics and OpenTelemetry tracing.

Kept as its own package, parallel to `events/` and `cache/`, since it is
cross-cutting infrastructure rather than part of any one layer. Metrics are
defined here and recorded from the API/WebSocket call sites that already
build a response — the same places that publish Kafka events — so the
domain and service layers stay free of observability imports.
"""

from app.observability.metrics import (
    ALLOCATION_DURATION,
    KAFKA_EVENTS_CONSUMED,
    KAFKA_EVENTS_PUBLISHED,
    REDIS_OPERATIONS,
    WS_CONNECTIONS,
    WS_EVENTS,
    time_allocation,
)
from app.observability.tracing import configure_tracing

__all__ = [
    "ALLOCATION_DURATION",
    "KAFKA_EVENTS_CONSUMED",
    "KAFKA_EVENTS_PUBLISHED",
    "REDIS_OPERATIONS",
    "WS_CONNECTIONS",
    "WS_EVENTS",
    "configure_tracing",
    "time_allocation",
]
