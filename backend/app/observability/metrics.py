"""Prometheus metrics for AquaOps-specific behavior.

HTTP request count/latency and process CPU/memory are mounted at `/metrics`
in `app/main.py` via `prometheus_fastapi_instrumentator`, which covers
generic ASGI/process metrics automatically. The metrics defined here are the
ones that instrumentation cannot know about: how long an allocation actually
took to compute, how many WebSocket clients are connected, and the volume of
Kafka/Redis activity. Recorded from the API/WebSocket call sites, never from
the domain engines.
"""

from __future__ import annotations

import time
from contextlib import contextmanager

from prometheus_client import Counter, Gauge, Histogram

# -- allocation --------------------------------------------------------------

ALLOCATION_DURATION = Histogram(
    "aquaops_allocation_duration_seconds",
    "Time to compute one allocation result, by strategy and trigger path.",
    ["strategy", "source"],  # source: http | websocket
)


@contextmanager
def time_allocation(strategy: str, source: str):
    """Times one allocation computation and records it on `ALLOCATION_DURATION`.

    Wraps only the engine call itself (not request parsing or serialization),
    so the metric reflects actual compute cost.
    """
    start = time.perf_counter()
    try:
        yield
    finally:
        ALLOCATION_DURATION.labels(strategy=strategy, source=source).observe(
            time.perf_counter() - start
        )

# -- websocket -----------------------------------------------------------------

WS_CONNECTIONS = Gauge(
    "aquaops_websocket_connections",
    "Currently connected WebSocket clients.",
)

WS_EVENTS = Counter(
    "aquaops_websocket_events_total",
    "WebSocket events sent, by type and delivery path.",
    ["event_type", "path"],  # path: direct | redis_relay
)

# -- Kafka / Redis activity ---------------------------------------------------

KAFKA_EVENTS_PUBLISHED = Counter(
    "aquaops_kafka_events_published_total",
    "Events published to Kafka, by topic and outcome.",
    ["topic", "outcome"],  # outcome: sent | failed | disabled
)

KAFKA_EVENTS_CONSUMED = Counter(
    "aquaops_kafka_events_consumed_total",
    "Events consumed from Kafka by the worker, by topic.",
    ["topic"],
)

REDIS_OPERATIONS = Counter(
    "aquaops_redis_operations_total",
    "Redis operations, by kind and outcome.",
    ["operation", "outcome"],  # operation: get | set | publish
)
