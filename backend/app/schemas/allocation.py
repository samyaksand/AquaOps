"""Allocation request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.allocation.results import AllocationResult, DemandAllocation
from app.domain.allocation.state import DemandKind
from app.domain.allocation.strategies import StrategyName
from app.schemas.network import NetworkStateOut
from app.schemas.scenario import ScenarioIn, ScenarioSummaryOut


class AllocateRequest(BaseModel):
    """Which strategy to allocate the current network under."""

    strategy: StrategyName = Field(
        default=StrategyName.BALANCED,
        description="Allocation strategy to apply.",
    )


class ScenarioAllocateRequest(BaseModel):
    """Apply a scenario, then allocate the resulting network."""

    scenario: ScenarioIn
    strategy: StrategyName = Field(default=StrategyName.BALANCED)


class RouteFlowOut(BaseModel):
    """Volume delivered along one concrete source-to-demand path."""

    model_config = ConfigDict(from_attributes=True)

    source_code: str
    node_codes: list[str]
    delivered_m3_per_day: float
    withdrawn_m3_per_day: float
    efficiency: float


class DemandAllocationOut(BaseModel):
    """What one demand point received, and what it cost to deliver."""

    code: str
    name: str
    kind: DemandKind
    priority_rank: int
    population: int
    demand_m3_per_day: float
    minimum_demand_m3_per_day: float
    supplied_m3_per_day: float
    unmet_m3_per_day: float
    withdrawn_m3_per_day: float
    transit_loss_m3_per_day: float
    satisfaction_ratio: float
    meets_minimum: bool
    fully_supplied: bool
    routes: list[RouteFlowOut]

    @classmethod
    def from_domain(cls, allocation: DemandAllocation) -> DemandAllocationOut:
        return cls(
            code=allocation.code,
            name=allocation.name,
            kind=allocation.kind,
            priority_rank=allocation.priority_rank,
            population=allocation.population,
            demand_m3_per_day=float(allocation.demand_m3_per_day),
            minimum_demand_m3_per_day=float(
                allocation.minimum_demand_m3_per_day
            ),
            supplied_m3_per_day=float(allocation.supplied_m3_per_day),
            unmet_m3_per_day=float(allocation.unmet_m3_per_day),
            withdrawn_m3_per_day=float(allocation.withdrawn_m3_per_day),
            transit_loss_m3_per_day=float(allocation.transit_loss_m3_per_day),
            satisfaction_ratio=float(allocation.satisfaction_ratio),
            meets_minimum=allocation.meets_minimum,
            fully_supplied=allocation.fully_supplied,
            routes=[
                RouteFlowOut(
                    source_code=route.source_code,
                    node_codes=list(route.node_codes),
                    delivered_m3_per_day=float(route.delivered_m3_per_day),
                    withdrawn_m3_per_day=float(route.withdrawn_m3_per_day),
                    efficiency=float(route.efficiency),
                )
                for route in allocation.routes
            ],
        )


class SourceWithdrawalOut(BaseModel):
    """How much was drawn from one reservoir."""

    source_code: str
    withdrawn_m3_per_day: float


class AllocationMetricsOut(BaseModel):
    """Headline metrics for comparing one allocation against another."""

    total_demand_m3_per_day: float
    total_supplied_m3_per_day: float
    total_unmet_m3_per_day: float
    total_withdrawn_m3_per_day: float
    total_transit_loss_m3_per_day: float
    total_supply_available_m3_per_day: float
    demand_coverage_ratio: float
    total_population: int
    population_served: int
    population_fully_served: int
    population_weighted_satisfaction: float
    critical_facility_coverage: float
    critical_facility_full_coverage: float
    delivery_efficiency: float
    supply_utilization: float
    minimum_demand_shortfalls: list[str]

    @classmethod
    def from_domain(cls, result: AllocationResult) -> AllocationMetricsOut:
        return cls(
            total_demand_m3_per_day=float(result.total_demand_m3_per_day),
            total_supplied_m3_per_day=float(result.total_supplied_m3_per_day),
            total_unmet_m3_per_day=float(result.total_unmet_m3_per_day),
            total_withdrawn_m3_per_day=float(
                result.total_withdrawn_m3_per_day
            ),
            total_transit_loss_m3_per_day=float(
                result.total_transit_loss_m3_per_day
            ),
            total_supply_available_m3_per_day=float(
                result.total_supply_available_m3_per_day
            ),
            demand_coverage_ratio=float(result.demand_coverage_ratio),
            total_population=result.total_population,
            population_served=result.population_served,
            population_fully_served=result.population_fully_served,
            population_weighted_satisfaction=float(
                result.population_weighted_satisfaction
            ),
            critical_facility_coverage=float(
                result.critical_facility_coverage
            ),
            critical_facility_full_coverage=float(
                result.critical_facility_full_coverage
            ),
            delivery_efficiency=float(result.delivery_efficiency),
            supply_utilization=float(result.supply_utilization),
            minimum_demand_shortfalls=list(result.minimum_demand_shortfalls),
        )


class AllocationResultOut(BaseModel):
    """A complete, computed allocation outcome."""

    strategy: str
    metrics: AllocationMetricsOut
    allocations: list[DemandAllocationOut]
    source_withdrawals: list[SourceWithdrawalOut]

    @classmethod
    def from_domain(cls, result: AllocationResult) -> AllocationResultOut:
        return cls(
            strategy=result.strategy,
            metrics=AllocationMetricsOut.from_domain(result),
            allocations=[
                DemandAllocationOut.from_domain(item)
                for item in result.allocations
            ],
            source_withdrawals=[
                SourceWithdrawalOut(
                    source_code=code, withdrawn_m3_per_day=float(amount)
                )
                for code, amount in result.source_withdrawals
            ],
        )


class ScenarioAllocationOut(BaseModel):
    """The scenario applied, the network it produced, and the allocation."""

    scenario: ScenarioSummaryOut
    network: NetworkStateOut
    allocation: AllocationResultOut
