"""Scenario request schemas.

Changes are a discriminated union on ``type``, so an unknown or malformed
change is rejected by request validation before it reaches the domain.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

from app.domain.scenario import (
    ChangeFacilityDemand,
    ChangeZoneDemand,
    ReducePipelineCapacity,
    ReduceReservoirSupply,
    ReduceTreatmentCapacity,
    Scenario,
    ScenarioChange,
    SetPipelineUnavailable,
    SetTankerUnavailable,
)

FRACTION = Field(
    description="Proportion removed, 0 keeps everything and 1 removes all.",
    ge=0,
    le=1,
)
FACTOR = Field(
    description="Demand multiplier; 1.25 is a 25% increase, 0.8 a 20% decrease.",
    ge=0,
)
TARGET = Field(description="Code of the entity this change applies to.", min_length=1)


class ReduceReservoirSupplyIn(BaseModel):
    """Cut a reservoir's releasable daily supply."""

    type: Literal["reduce_reservoir_supply"]
    target_code: str = TARGET
    fraction: Decimal = FRACTION

    def to_domain(self) -> ScenarioChange:
        return ReduceReservoirSupply(self.target_code, self.fraction)


class ReduceTreatmentCapacityIn(BaseModel):
    """Cut a treatment plant's daily throughput capacity."""

    type: Literal["reduce_treatment_capacity"]
    target_code: str = TARGET
    fraction: Decimal = FRACTION

    def to_domain(self) -> ScenarioChange:
        return ReduceTreatmentCapacity(self.target_code, self.fraction)


class ReducePipelineCapacityIn(BaseModel):
    """Cut a pipeline's daily carrying capacity."""

    type: Literal["reduce_pipeline_capacity"]
    target_code: str = TARGET
    fraction: Decimal = FRACTION

    def to_domain(self) -> ScenarioChange:
        return ReducePipelineCapacity(self.target_code, self.fraction)


class SetPipelineUnavailableIn(BaseModel):
    """Take a pipeline out of service."""

    type: Literal["set_pipeline_unavailable"]
    target_code: str = TARGET

    def to_domain(self) -> ScenarioChange:
        return SetPipelineUnavailable(self.target_code)


class ChangeZoneDemandIn(BaseModel):
    """Scale a demand zone's daily demand."""

    type: Literal["change_zone_demand"]
    target_code: str = TARGET
    factor: Decimal = FACTOR

    def to_domain(self) -> ScenarioChange:
        return ChangeZoneDemand(self.target_code, self.factor)


class ChangeFacilityDemandIn(BaseModel):
    """Scale a critical facility's daily demand."""

    type: Literal["change_facility_demand"]
    target_code: str = TARGET
    factor: Decimal = FACTOR

    def to_domain(self) -> ScenarioChange:
        return ChangeFacilityDemand(self.target_code, self.factor)


class SetTankerUnavailableIn(BaseModel):
    """Remove a tanker from the available fleet."""

    type: Literal["set_tanker_unavailable"]
    target_code: str = TARGET

    def to_domain(self) -> ScenarioChange:
        return SetTankerUnavailable(self.target_code)


ScenarioChangeIn = Annotated[
    Union[
        ReduceReservoirSupplyIn,
        ReduceTreatmentCapacityIn,
        ReducePipelineCapacityIn,
        SetPipelineUnavailableIn,
        ChangeZoneDemandIn,
        ChangeFacilityDemandIn,
        SetTankerUnavailableIn,
    ],
    Field(discriminator="type"),
]


class ScenarioIn(BaseModel):
    """A named set of simulated changes to apply to the current network."""

    name: str = Field(min_length=1, description="Identifier for this scenario.")
    description: str = ""
    changes: list[ScenarioChangeIn] = Field(default_factory=list)

    def to_domain(self) -> Scenario:
        return Scenario(
            name=self.name,
            description=self.description,
            changes=tuple(change.to_domain() for change in self.changes),
        )


class ScenarioSummaryOut(BaseModel):
    """Echo of the applied scenario, so a response is self-describing."""

    name: str
    description: str
    changes: list[str]

    @classmethod
    def from_domain(cls, scenario: Scenario) -> ScenarioSummaryOut:
        return cls(
            name=scenario.name,
            description=scenario.description,
            changes=list(scenario.describe()),
        )
