"""The five objectives Decision Analysis scores every candidate on.

Every objective is normalized to [0, 1] with a consistent direction — higher
is always better — so objectives can be compared and dominance-checked
uniformly. All five are computed from an already-produced
:class:`AllocationResult`; nothing here re-implements or second-guesses the
allocation engine's routing or capacity logic.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.domain.allocation.results import AllocationResult

ZERO = Decimal("0")
ONE = Decimal("1")


@dataclass(frozen=True)
class ObjectiveScores:
    """The five normalized objective values for one allocation result.

    ``unmet_demand_score`` is already inverted (1 = nothing unmet), so every
    field here reads the same way: higher is strictly better.
    """

    critical_coverage: Decimal
    population_served: Decimal
    unmet_demand_score: Decimal
    logistics_efficiency: Decimal
    equity: Decimal

    def as_dict(self) -> dict[str, Decimal]:
        return {
            "critical_coverage": self.critical_coverage,
            "population_served": self.population_served,
            "unmet_demand_score": self.unmet_demand_score,
            "logistics_efficiency": self.logistics_efficiency,
            "equity": self.equity,
        }

    @property
    def names(self) -> tuple[str, ...]:
        return tuple(self.as_dict())

    def value(self, name: str) -> Decimal:
        return self.as_dict()[name]


def score_objectives(result: AllocationResult) -> ObjectiveScores:
    """Compute all five objectives for one computed allocation result."""
    return ObjectiveScores(
        critical_coverage=result.critical_facility_coverage,
        population_served=_population_served_ratio(result),
        unmet_demand_score=_unmet_demand_score(result),
        logistics_efficiency=result.delivery_efficiency,
        equity=_equity_score(result),
    )


def _population_served_ratio(result: AllocationResult) -> Decimal:
    """Fraction of total zone population meeting its minimum demand.

    Distinct from ``population_weighted_satisfaction`` (which averages
    partial satisfaction): this objective asks how many residents have at
    least a lifeline supply, which is the more legible "coverage" framing
    for a decision-maker comparing candidates.
    """
    total = result.total_population
    if total == 0:
        return ONE
    return Decimal(result.population_served) / Decimal(total)


def _unmet_demand_score(result: AllocationResult) -> Decimal:
    """1 minus the fraction of total demand left unmet; 1 = fully served."""
    if result.total_demand_m3_per_day == ZERO:
        return ONE
    ratio = result.total_unmet_m3_per_day / result.total_demand_m3_per_day
    return _clamp(ONE - ratio)


def _equity_score(result: AllocationResult) -> Decimal:
    """How evenly satisfaction is spread across demand points.

    Defined as 1 minus the population-weighted mean absolute deviation of
    each point's satisfaction ratio from the population-weighted mean — a
    scenario where every zone and facility gets the same fractional share of
    its demand scores high; one where some are fully served while others go
    without scores low, even if total volume delivered is identical. Zones
    and facilities are weighted equally by population so a large zone's
    shortfall cannot be masked by many small, fully-served ones (and
    zero-population facilities still count, weighted at a nominal 1).
    """
    weighted = [
        (a.satisfaction_ratio, Decimal(max(a.population, 1)))
        for a in result.allocations
    ]
    total_weight = sum((w for _, w in weighted), ZERO)
    if total_weight == ZERO:
        return ONE

    mean = sum((r * w for r, w in weighted), ZERO) / total_weight
    deviation = sum((abs(r - mean) * w for r, w in weighted), ZERO) / total_weight
    return _clamp(ONE - deviation)


def _clamp(value: Decimal) -> Decimal:
    if value < ZERO:
        return ZERO
    if value > ONE:
        return ONE
    return value


__all__ = ["ObjectiveScores", "score_objectives"]
