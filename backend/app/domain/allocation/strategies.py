"""Allocation strategies.

A strategy contributes exactly one thing: the order in which demand points are
considered when supply is scarce. It never decides volumes — the engine does
that, subject to supply, capacity, and demand limits. Keeping strategies to an
ordering concern is what makes their trade-offs comparable.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Protocol

from app.domain.allocation.state import DemandKind, DemandPoint

ZERO = Decimal("0")
ONE = Decimal("1")

# Lowest-priority rank in the domain (LOW); used to normalize criticality.
MAX_PRIORITY_RANK = 3


class StrategyName(str, Enum):
    """The four strategies AquaOps compares."""

    POPULATION_FIRST = "population_first"
    CRITICAL_INFRASTRUCTURE_FIRST = "critical_infrastructure_first"
    EFFICIENCY_FIRST = "efficiency_first"
    BALANCED = "balanced"


@dataclass(frozen=True)
class DemandContext:
    """Network-derived facts a strategy may weigh, computed by the engine."""

    best_efficiency: Decimal
    max_population: int
    max_demand_m3_per_day: Decimal

    def population_score(self, point: DemandPoint) -> Decimal:
        if self.max_population == 0:
            return ZERO
        return Decimal(point.population) / Decimal(self.max_population)

    def criticality_score(self, point: DemandPoint) -> Decimal:
        rank = max(0, min(point.priority_rank, MAX_PRIORITY_RANK))
        return Decimal(MAX_PRIORITY_RANK - rank) / Decimal(MAX_PRIORITY_RANK)

    def efficiency_score(self) -> Decimal:
        return self.best_efficiency


class AllocationStrategy(Protocol):
    """Orders demand points from most to least deserving of scarce supply."""

    name: StrategyName

    def ordering_key(
        self, point: DemandPoint, context: DemandContext
    ) -> tuple[object, ...]:
        """Ascending sort key: lower sorts earlier and is served first."""
        ...


def _tiebreak(point: DemandPoint) -> tuple[object, ...]:
    """Stable final tiebreaker so every strategy is fully deterministic."""
    return (point.code,)


@dataclass(frozen=True)
class PopulationFirst:
    """Serve the most people first, regardless of facility criticality."""

    name: StrategyName = StrategyName.POPULATION_FIRST

    def ordering_key(
        self, point: DemandPoint, context: DemandContext
    ) -> tuple[object, ...]:
        return (-point.population, -point.demand_m3_per_day, *_tiebreak(point))


@dataclass(frozen=True)
class CriticalInfrastructureFirst:
    """Serve by priority tier, with critical facilities ahead of zones."""

    name: StrategyName = StrategyName.CRITICAL_INFRASTRUCTURE_FIRST

    def ordering_key(
        self, point: DemandPoint, context: DemandContext
    ) -> tuple[object, ...]:
        facility_first = 0 if point.kind is DemandKind.FACILITY else 1
        return (
            point.priority_rank,
            facility_first,
            -point.population,
            *_tiebreak(point),
        )


@dataclass(frozen=True)
class EfficiencyFirst:
    """Serve whatever delivers the most water per unit withdrawn."""

    name: StrategyName = StrategyName.EFFICIENCY_FIRST

    def ordering_key(
        self, point: DemandPoint, context: DemandContext
    ) -> tuple[object, ...]:
        return (
            -context.best_efficiency,
            -point.demand_m3_per_day,
            *_tiebreak(point),
        )


@dataclass(frozen=True)
class Balanced:
    """Weigh criticality, population, and delivery efficiency together.

    Weights are explicit rather than implied so the trade-off being struck is
    inspectable and adjustable; they are normalized before scoring.
    """

    criticality_weight: Decimal = Decimal("0.4")
    population_weight: Decimal = Decimal("0.4")
    efficiency_weight: Decimal = Decimal("0.2")
    name: StrategyName = StrategyName.BALANCED

    def __post_init__(self) -> None:
        for label, weight in (
            ("criticality_weight", self.criticality_weight),
            ("population_weight", self.population_weight),
            ("efficiency_weight", self.efficiency_weight),
        ):
            if weight < ZERO:
                raise ValueError(f"{label} must be non-negative")
        if self.total_weight == ZERO:
            raise ValueError("at least one Balanced weight must be positive")

    @property
    def total_weight(self) -> Decimal:
        return (
            self.criticality_weight
            + self.population_weight
            + self.efficiency_weight
        )

    def score(self, point: DemandPoint, context: DemandContext) -> Decimal:
        """Composite desirability in [0, 1]; higher is served earlier."""
        weighted = (
            self.criticality_weight * context.criticality_score(point)
            + self.population_weight * context.population_score(point)
            + self.efficiency_weight * context.efficiency_score()
        )
        return weighted / self.total_weight

    def ordering_key(
        self, point: DemandPoint, context: DemandContext
    ) -> tuple[object, ...]:
        return (-self.score(point, context), *_tiebreak(point))


def default_strategies() -> dict[StrategyName, AllocationStrategy]:
    """All four strategies with their default parameters."""
    return {
        StrategyName.POPULATION_FIRST: PopulationFirst(),
        StrategyName.CRITICAL_INFRASTRUCTURE_FIRST: CriticalInfrastructureFirst(),
        StrategyName.EFFICIENCY_FIRST: EfficiencyFirst(),
        StrategyName.BALANCED: Balanced(),
    }


def get_strategy(name: StrategyName | str) -> AllocationStrategy:
    """Look up a strategy by name, accepting the enum or its string value."""
    key = StrategyName(name)
    return default_strategies()[key]
