"""Scenario domain: a baseline network state in, a hypothetical one out.

The scenario engine never allocates and never mutates its input. Feed its
output to the allocation engine to see what a disruption would cost.
"""

from app.domain.scenario.changes import (
    ChangeFacilityDemand,
    ChangeZoneDemand,
    EntityKind,
    ReducePipelineCapacity,
    ReduceReservoirSupply,
    ReduceTreatmentCapacity,
    ScenarioChange,
    SetPipelineUnavailable,
    SetTankerUnavailable,
)
from app.domain.scenario.engine import (
    Scenario,
    ScenarioError,
    apply_scenario,
    apply_scenarios,
)

__all__ = [
    "ChangeFacilityDemand",
    "ChangeZoneDemand",
    "EntityKind",
    "ReducePipelineCapacity",
    "ReduceReservoirSupply",
    "ReduceTreatmentCapacity",
    "Scenario",
    "ScenarioChange",
    "ScenarioError",
    "SetPipelineUnavailable",
    "SetTankerUnavailable",
    "apply_scenario",
    "apply_scenarios",
]
