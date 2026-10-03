"""Kafka event payloads.

Each event wraps the same output schemas the REST and WebSocket layers
already serve, so a consumer sees exactly what a client would have received
directly — the event trail is a notification of an outcome, not a second
representation of it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Literal, Union
from uuid import uuid4

from pydantic import BaseModel, Field

from app.schemas.allocation import AllocationResultOut
from app.schemas.network import NetworkStateOut
from app.schemas.scenario import ScenarioSummaryOut


def _now() -> datetime:
    return datetime.now(timezone.utc)


class AllocationComputedEvent(BaseModel):
    """A direct `/allocate` (or `allocate` WS command) outcome."""

    type: Literal["allocation_computed"] = "allocation_computed"
    allocation: AllocationResultOut


class ScenarioAppliedEvent(BaseModel):
    """A scenario preview outcome, with no allocation run yet."""

    type: Literal["scenario_applied"] = "scenario_applied"
    scenario: ScenarioSummaryOut
    network: NetworkStateOut


class ScenarioAllocationComputedEvent(BaseModel):
    """A scenario applied and then allocated in one step."""

    type: Literal["scenario_allocation_computed"] = "scenario_allocation_computed"
    scenario: ScenarioSummaryOut
    network: NetworkStateOut
    allocation: AllocationResultOut


EventPayload = Annotated[
    Union[
        AllocationComputedEvent,
        ScenarioAppliedEvent,
        ScenarioAllocationComputedEvent,
    ],
    Field(discriminator="type"),
]


class EventEnvelope(BaseModel):
    """Transport wrapper: identifies and times an event independent of its
    payload shape, so consumers can log/trace without parsing the payload."""

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    produced_at: datetime = Field(default_factory=_now)
    payload: EventPayload
