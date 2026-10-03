"""Convenience helpers for publishing outcome events from the API layer.

Routes and WebSocket handlers call these after they already have a result to
return/broadcast. Publishing is fire-and-forget: it never delays or can fail
the response the caller is already sending.
"""

from __future__ import annotations

import asyncio

from app.core.logging import get_logger
from app.events.producer import get_event_producer
from app.events.schemas import (
    AllocationComputedEvent,
    EventEnvelope,
    ScenarioAllocationComputedEvent,
)
from app.events.schemas import ScenarioAppliedEvent as ScenarioAppliedEventPayload
from app.events.topics import Topic
from app.schemas.allocation import AllocationResultOut
from app.schemas.network import NetworkStateOut
from app.schemas.scenario import ScenarioSummaryOut

logger = get_logger(__name__)


def publish_allocation_computed(allocation: AllocationResultOut) -> None:
    _fire(
        Topic.ALLOCATION_COMPUTED,
        EventEnvelope(payload=AllocationComputedEvent(allocation=allocation)),
    )


def publish_scenario_applied(
    scenario: ScenarioSummaryOut, network: NetworkStateOut
) -> None:
    _fire(
        Topic.SCENARIO_APPLIED,
        EventEnvelope(
            payload=ScenarioAppliedEventPayload(scenario=scenario, network=network)
        ),
    )


def publish_scenario_allocation_computed(
    scenario: ScenarioSummaryOut,
    network: NetworkStateOut,
    allocation: AllocationResultOut,
) -> None:
    _fire(
        Topic.SCENARIO_ALLOCATION_COMPUTED,
        EventEnvelope(
            payload=ScenarioAllocationComputedEvent(
                scenario=scenario, network=network, allocation=allocation
            )
        ),
    )


#: Keeps fire-and-forget tasks referenced until they finish, so they are not
#: garbage-collected mid-flight — and lets the loop's own closing/"unclosed
#: producer" warnings stay confined to genuinely abandoned work rather than
#: being triggered by a reference we dropped ourselves.
_pending_publishes: set[asyncio.Task] = set()


def _fire(topic: Topic, envelope: EventEnvelope) -> None:
    """Schedule the publish without waiting for it.

    A request/command has already produced its response by the time this is
    called; publishing happens in the background so a slow or unreachable
    broker never adds latency to the caller.
    """

    async def _send() -> None:
        try:
            await get_event_producer().publish(topic, envelope)
        except Exception:
            logger.warning("unexpected error publishing to %s", topic.value, exc_info=True)

    task = asyncio.ensure_future(_send())
    _pending_publishes.add(task)
    task.add_done_callback(_pending_publishes.discard)
