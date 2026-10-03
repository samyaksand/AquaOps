"""Scenario changes: declarative, validated descriptions of a disruption.

Each change validates its own parameters on construction and knows how to
rewrite the one entity it targets. None of them mutates anything — a change
returns a replacement entity and the scenario engine assembles a new
:class:`NetworkState` from the results.

Changes are *simulated*: they describe a hypothetical network, never an
instruction to damage a running system.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, replace
from decimal import Decimal
from typing import Protocol

from app.domain.allocation.state import (
    DemandKind,
    DemandPoint,
    Link,
    OperationalState,
    SupplySource,
    TankerUnit,
    TransitNode,
)

ZERO = Decimal("0")
ONE = Decimal("1")


class EntityKind(str, enum.Enum):
    """Which collection of a network state a change applies to."""

    SOURCE = "source"
    TRANSIT = "transit"
    DEMAND = "demand"
    LINK = "link"
    TANKER = "tanker"


class ScenarioChange(Protocol):
    """A single validated modification to one entity of a network state."""

    target_code: str

    @property
    def entity_kind(self) -> EntityKind:
        """Which collection the target is expected to be found in."""
        ...

    def describe(self) -> str:
        """Short human-readable statement of what this change does."""
        ...


def _validate_fraction(label: str, value: Decimal) -> None:
    if not (ZERO <= value <= ONE):
        raise ValueError(f"{label} must be in [0, 1], got {value}")


def _validate_factor(label: str, value: Decimal) -> None:
    if value < ZERO:
        raise ValueError(f"{label} must be non-negative, got {value}")


def _validate_code(value: str) -> None:
    if not value or not value.strip():
        raise ValueError("target_code must be a non-empty string")


# -- supply -------------------------------------------------------------------


@dataclass(frozen=True)
class ReduceReservoirSupply:
    """Cut a reservoir's releasable daily supply by a fraction.

    ``fraction=0.3`` models a 30% loss of available supply, e.g. drought
    drawdown or an intake restriction.
    """

    target_code: str
    fraction: Decimal

    def __post_init__(self) -> None:
        _validate_code(self.target_code)
        _validate_fraction("fraction", self.fraction)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.SOURCE

    def describe(self) -> str:
        return f"reduce reservoir {self.target_code} supply by {self.fraction}"

    def apply_to(self, source: SupplySource) -> SupplySource:
        remaining = source.available_m3_per_day * (ONE - self.fraction)
        return replace(source, available_m3_per_day=remaining)


# -- treatment ----------------------------------------------------------------


@dataclass(frozen=True)
class ReduceTreatmentCapacity:
    """Cut a treatment plant's daily throughput capacity by a fraction."""

    target_code: str
    fraction: Decimal

    def __post_init__(self) -> None:
        _validate_code(self.target_code)
        _validate_fraction("fraction", self.fraction)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.TRANSIT

    def describe(self) -> str:
        return f"reduce plant {self.target_code} capacity by {self.fraction}"

    def apply_to(self, transit: TransitNode) -> TransitNode:
        remaining = transit.capacity_m3_per_day * (ONE - self.fraction)
        return replace(transit, capacity_m3_per_day=remaining)


# -- pipelines ----------------------------------------------------------------


@dataclass(frozen=True)
class ReducePipelineCapacity:
    """Cut a pipeline's daily carrying capacity by a fraction."""

    target_code: str
    fraction: Decimal

    def __post_init__(self) -> None:
        _validate_code(self.target_code)
        _validate_fraction("fraction", self.fraction)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.LINK

    def describe(self) -> str:
        return f"reduce pipeline {self.target_code} capacity by {self.fraction}"

    def apply_to(self, link: Link) -> Link:
        remaining = link.capacity_m3_per_day * (ONE - self.fraction)
        return replace(link, capacity_m3_per_day=remaining)


@dataclass(frozen=True)
class SetPipelineUnavailable:
    """Take a pipeline fully out of service for the duration of the scenario."""

    target_code: str

    def __post_init__(self) -> None:
        _validate_code(self.target_code)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.LINK

    def describe(self) -> str:
        return f"take pipeline {self.target_code} out of service"

    def apply_to(self, link: Link) -> Link:
        return replace(link, state=OperationalState.UNAVAILABLE)


# -- demand -------------------------------------------------------------------


@dataclass(frozen=True)
class _ScaleDemand:
    """Scales a demand point by a multiplier.

    ``factor=1.25`` is a 25% increase, ``factor=0.8`` a 20% decrease. When a
    decrease would push demand below the point's minimum, the minimum is
    lowered to match: a lifeline volume larger than total demand is not a
    meaningful state.
    """

    target_code: str
    factor: Decimal

    def __post_init__(self) -> None:
        _validate_code(self.target_code)
        _validate_factor("factor", self.factor)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.DEMAND

    @property
    def expected_demand_kind(self) -> DemandKind:
        raise NotImplementedError

    def apply_to(self, point: DemandPoint) -> DemandPoint:
        scaled = point.demand_m3_per_day * self.factor
        minimum = min(point.minimum_demand_m3_per_day, scaled)
        return replace(
            point,
            demand_m3_per_day=scaled,
            minimum_demand_m3_per_day=minimum,
        )


@dataclass(frozen=True)
class ChangeZoneDemand(_ScaleDemand):
    """Scale a demand zone's daily demand, e.g. a heatwave or an evacuation."""

    @property
    def expected_demand_kind(self) -> DemandKind:
        return DemandKind.ZONE

    def describe(self) -> str:
        return f"scale zone {self.target_code} demand by {self.factor}"


@dataclass(frozen=True)
class ChangeFacilityDemand(_ScaleDemand):
    """Scale a critical facility's daily demand, e.g. a hospital surge."""

    @property
    def expected_demand_kind(self) -> DemandKind:
        return DemandKind.FACILITY

    def describe(self) -> str:
        return f"scale facility {self.target_code} demand by {self.factor}"


# -- logistics ----------------------------------------------------------------


@dataclass(frozen=True)
class SetTankerUnavailable:
    """Remove a tanker from the available fleet."""

    target_code: str

    def __post_init__(self) -> None:
        _validate_code(self.target_code)

    @property
    def entity_kind(self) -> EntityKind:
        return EntityKind.TANKER

    def describe(self) -> str:
        return f"take tanker {self.target_code} out of service"

    def apply_to(self, tanker: TankerUnit) -> TankerUnit:
        return replace(tanker, state=OperationalState.UNAVAILABLE)
