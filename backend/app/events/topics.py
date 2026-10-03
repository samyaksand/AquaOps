"""Kafka topic names.

One topic per category of outcome, mirroring the three broadcast-worthy
WebSocket event types (`allocation`, `scenario_applied`, `scenario_allocation`)
so the mapping between a REST/WebSocket action and its event trail stays
obvious.
"""

from __future__ import annotations

import enum


class Topic(str, enum.Enum):
    """Kafka topics this service produces to and consumes from."""

    ALLOCATION_COMPUTED = "aquaops.allocation.computed"
    SCENARIO_APPLIED = "aquaops.scenario.applied"
    SCENARIO_ALLOCATION_COMPUTED = "aquaops.scenario_allocation.computed"


ALL_TOPICS: tuple[Topic, ...] = tuple(Topic)
