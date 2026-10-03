"""Structured output of an allocation run."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.domain.allocation.state import DemandKind

ZERO = Decimal("0")


@dataclass(frozen=True)
class DemandAllocation:
    """What a single demand point actually received."""

    code: str
    name: str
    kind: DemandKind
    priority_rank: int
    population: int
    demand_m3_per_day: Decimal
    minimum_demand_m3_per_day: Decimal
    supplied_m3_per_day: Decimal
    withdrawn_m3_per_day: Decimal
    routes: tuple[RouteFlow, ...] = field(default_factory=tuple)

    @property
    def unmet_m3_per_day(self) -> Decimal:
        return self.demand_m3_per_day - self.supplied_m3_per_day

    @property
    def satisfaction_ratio(self) -> Decimal:
        """Fraction of full demand met, in [0, 1]. Zero-demand points count as met."""
        if self.demand_m3_per_day == ZERO:
            return Decimal("1")
        return self.supplied_m3_per_day / self.demand_m3_per_day

    @property
    def meets_minimum(self) -> bool:
        return self.supplied_m3_per_day >= self.minimum_demand_m3_per_day

    @property
    def fully_supplied(self) -> bool:
        return self.supplied_m3_per_day >= self.demand_m3_per_day

    @property
    def transit_loss_m3_per_day(self) -> Decimal:
        return self.withdrawn_m3_per_day - self.supplied_m3_per_day


@dataclass(frozen=True)
class RouteFlow:
    """Delivered volume along one concrete source-to-demand path."""

    source_code: str
    node_codes: tuple[str, ...]
    delivered_m3_per_day: Decimal
    withdrawn_m3_per_day: Decimal
    efficiency: Decimal


@dataclass(frozen=True)
class AllocationResult:
    """Full, computed outcome of one allocation run under one strategy."""

    strategy: str
    allocations: tuple[DemandAllocation, ...]
    total_supply_available_m3_per_day: Decimal
    source_withdrawals: tuple[tuple[str, Decimal], ...] = field(
        default_factory=tuple
    )

    # -- aggregate volumes -------------------------------------------------
    @property
    def total_demand_m3_per_day(self) -> Decimal:
        return sum((a.demand_m3_per_day for a in self.allocations), ZERO)

    @property
    def total_supplied_m3_per_day(self) -> Decimal:
        return sum((a.supplied_m3_per_day for a in self.allocations), ZERO)

    @property
    def total_unmet_m3_per_day(self) -> Decimal:
        return sum((a.unmet_m3_per_day for a in self.allocations), ZERO)

    @property
    def total_withdrawn_m3_per_day(self) -> Decimal:
        return sum((a.withdrawn_m3_per_day for a in self.allocations), ZERO)

    @property
    def total_transit_loss_m3_per_day(self) -> Decimal:
        return self.total_withdrawn_m3_per_day - self.total_supplied_m3_per_day

    @property
    def demand_coverage_ratio(self) -> Decimal:
        if self.total_demand_m3_per_day == ZERO:
            return Decimal("1")
        return self.total_supplied_m3_per_day / self.total_demand_m3_per_day

    # -- population ---------------------------------------------------------
    # Population metrics are scoped to demand zones, which are where people
    # actually live. A facility's population is the population that *depends*
    # on it and already lives in some zone, so counting both would double-count.
    @property
    def zone_allocations(self) -> tuple[DemandAllocation, ...]:
        return tuple(a for a in self.allocations if a.kind is DemandKind.ZONE)

    @property
    def total_population(self) -> int:
        return sum(a.population for a in self.zone_allocations)

    @property
    def population_served(self) -> int:
        """Resident population in zones that received at least their minimum."""
        return sum(a.population for a in self.zone_allocations if a.meets_minimum)

    @property
    def population_fully_served(self) -> int:
        return sum(a.population for a in self.zone_allocations if a.fully_supplied)

    @property
    def population_weighted_satisfaction(self) -> Decimal:
        """Zone demand-satisfaction averaged over residents, in [0, 1]."""
        total = self.total_population
        if total == 0:
            return Decimal("1")
        weighted = sum(
            (a.satisfaction_ratio * a.population for a in self.zone_allocations),
            ZERO,
        )
        return weighted / Decimal(total)

    # -- critical facilities -----------------------------------------------
    @property
    def critical_facility_allocations(self) -> tuple[DemandAllocation, ...]:
        return tuple(a for a in self.allocations if a.kind is DemandKind.FACILITY)

    @property
    def critical_facility_coverage(self) -> Decimal:
        """Fraction of critical facilities meeting their minimum demand."""
        facilities = self.critical_facility_allocations
        if not facilities:
            return Decimal("1")
        met = sum(1 for a in facilities if a.meets_minimum)
        return Decimal(met) / Decimal(len(facilities))

    @property
    def critical_facility_full_coverage(self) -> Decimal:
        facilities = self.critical_facility_allocations
        if not facilities:
            return Decimal("1")
        met = sum(1 for a in facilities if a.fully_supplied)
        return Decimal(met) / Decimal(len(facilities))

    # -- efficiency / logistics --------------------------------------------
    @property
    def delivery_efficiency(self) -> Decimal:
        """Delivered volume per unit withdrawn, in (0, 1]. 1.0 means lossless."""
        withdrawn = self.total_withdrawn_m3_per_day
        if withdrawn == ZERO:
            return Decimal("1")
        return self.total_supplied_m3_per_day / withdrawn

    @property
    def supply_utilization(self) -> Decimal:
        """Fraction of available supply actually withdrawn."""
        if self.total_supply_available_m3_per_day == ZERO:
            return ZERO
        return (
            self.total_withdrawn_m3_per_day / self.total_supply_available_m3_per_day
        )

    @property
    def minimum_demand_shortfalls(self) -> tuple[str, ...]:
        """Codes of demand points left below their minimum demand."""
        return tuple(a.code for a in self.allocations if not a.meets_minimum)

    def by_code(self, code: str) -> DemandAllocation:
        for allocation in self.allocations:
            if allocation.code == code:
                return allocation
        raise KeyError(code)

    def summary(self) -> dict[str, object]:
        """Flat, serialization-friendly view of the headline metrics."""
        return {
            "strategy": self.strategy,
            "total_demand_m3_per_day": self.total_demand_m3_per_day,
            "total_supplied_m3_per_day": self.total_supplied_m3_per_day,
            "total_unmet_m3_per_day": self.total_unmet_m3_per_day,
            "total_withdrawn_m3_per_day": self.total_withdrawn_m3_per_day,
            "total_transit_loss_m3_per_day": self.total_transit_loss_m3_per_day,
            "demand_coverage_ratio": self.demand_coverage_ratio,
            "population_served": self.population_served,
            "population_fully_served": self.population_fully_served,
            "population_weighted_satisfaction": (
                self.population_weighted_satisfaction
            ),
            "critical_facility_coverage": self.critical_facility_coverage,
            "critical_facility_full_coverage": self.critical_facility_full_coverage,
            "delivery_efficiency": self.delivery_efficiency,
            "supply_utilization": self.supply_utilization,
            "minimum_demand_shortfalls": self.minimum_demand_shortfalls,
        }
