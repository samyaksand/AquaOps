"""Network state response schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from app.domain.allocation.state import (
    DemandKind,
    NetworkState,
    OperationalState,
)


class _Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class SupplySourceOut(_Out):
    """A reservoir able to release water into the network."""

    code: str
    name: str
    available_m3_per_day: float
    state: OperationalState


class TransitNodeOut(_Out):
    """A treatment plant with a throughput cap and a recovery ratio."""

    code: str
    name: str
    capacity_m3_per_day: float
    recovery_ratio: float
    state: OperationalState


class DemandPointOut(_Out):
    """A demand zone or critical facility competing for water."""

    code: str
    name: str
    kind: DemandKind
    demand_m3_per_day: float
    minimum_demand_m3_per_day: float
    priority_rank: int
    population: int
    reserve_m3: float


class LinkOut(_Out):
    """A directed, capacitated pipeline."""

    code: str
    source_code: str
    target_code: str
    capacity_m3_per_day: float
    loss_ratio: float
    state: OperationalState


class TankerOut(_Out):
    """A mobile carrier in the tanker fleet."""

    code: str
    name: str
    capacity_m3: float
    trips_per_day: int
    state: OperationalState


class NetworkStateOut(_Out):
    """A complete network snapshot."""

    sources: list[SupplySourceOut]
    transits: list[TransitNodeOut]
    demands: list[DemandPointOut]
    links: list[LinkOut]
    tankers: list[TankerOut]

    @classmethod
    def from_domain(cls, state: NetworkState) -> NetworkStateOut:
        return cls.model_validate(state)
