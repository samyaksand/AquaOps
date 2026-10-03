"""Scenario endpoints."""

from fastapi import APIRouter

from app.api.deps import CurrentNetwork
from app.schemas.allocation import (
    AllocationResultOut,
    ScenarioAllocateRequest,
    ScenarioAllocationOut,
)
from app.schemas.network import NetworkStateOut
from app.schemas.scenario import ScenarioIn, ScenarioSummaryOut
from app.services.allocation_service import (
    allocate_scenario,
    apply_scenario_to_network,
)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.post(
    "/apply",
    response_model=NetworkStateOut,
    summary="Apply a scenario to the current network",
)
async def apply(scenario: ScenarioIn, state: CurrentNetwork) -> NetworkStateOut:
    """Return the hypothetical network a scenario produces.

    The stored network is never modified.
    """
    disrupted = apply_scenario_to_network(state, scenario.to_domain())
    return NetworkStateOut.from_domain(disrupted)


@router.post(
    "/allocate",
    response_model=ScenarioAllocationOut,
    summary="Apply a scenario, then allocate",
)
async def apply_and_allocate(
    request: ScenarioAllocateRequest, state: CurrentNetwork
) -> ScenarioAllocationOut:
    """Apply a scenario and allocate the network it produces."""
    scenario = request.scenario.to_domain()
    disrupted, result = allocate_scenario(state, scenario, request.strategy)
    return ScenarioAllocationOut(
        scenario=ScenarioSummaryOut.from_domain(scenario),
        network=NetworkStateOut.from_domain(disrupted),
        allocation=AllocationResultOut.from_domain(result),
    )
