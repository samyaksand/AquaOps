"""Orchestrates the scenario and allocation engines for the API layer.

Every function here is synchronous and pure: it takes a network state, calls
the domain engines, and returns their results. Loading the state is the
caller's concern, which keeps persistence out of this module.
"""

from __future__ import annotations

from app.domain.allocation import AllocationEngine, EngineConfig
from app.domain.allocation.results import AllocationResult
from app.domain.allocation.state import NetworkState
from app.domain.allocation.strategies import AllocationStrategy, StrategyName
from app.domain.scenario import Scenario, apply_scenario


def allocate_network(
    state: NetworkState,
    strategy: AllocationStrategy | StrategyName | str,
    config: EngineConfig | None = None,
) -> AllocationResult:
    """Run the allocation engine over ``state`` under one strategy."""
    return AllocationEngine(config).allocate(state, strategy)


def apply_scenario_to_network(
    state: NetworkState, scenario: Scenario
) -> NetworkState:
    """Return the hypothetical network a scenario produces.

    ``state`` is not modified; the scenario engine builds a new snapshot.
    """
    return apply_scenario(state, scenario)


def allocate_scenario(
    state: NetworkState,
    scenario: Scenario,
    strategy: AllocationStrategy | StrategyName | str,
    config: EngineConfig | None = None,
) -> tuple[NetworkState, AllocationResult]:
    """Apply a scenario, then allocate the network it produces.

    Returns both halves so a caller can show what changed alongside what it
    cost. The baseline ``state`` is left untouched.
    """
    disrupted = apply_scenario_to_network(state, scenario)
    return disrupted, allocate_network(disrupted, strategy, config)
