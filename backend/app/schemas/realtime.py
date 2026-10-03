"""Typed WebSocket message schemas.

Both directions are explicit, discriminated on ``type``, so an unrecognised or
malformed frame is rejected by validation rather than reaching a handler.
Inbound commands reuse the same scenario and strategy schemas as the HTTP API.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, TypeAdapter

from app.domain.allocation.strategies import StrategyName
from app.schemas.allocation import AllocationResultOut
from app.schemas.network import NetworkStateOut
from app.schemas.scenario import ScenarioIn, ScenarioSummaryOut

# -- client -> server ---------------------------------------------------------


class PingCommand(BaseModel):
    """Liveness check; answered directly to the sender."""

    type: Literal["ping"]


class GetNetworkCommand(BaseModel):
    """Request the current network state."""

    type: Literal["get_network"]


class AllocateCommand(BaseModel):
    """Allocate the current network under a strategy."""

    type: Literal["allocate"]
    strategy: StrategyName = StrategyName.BALANCED


class ApplyScenarioCommand(BaseModel):
    """Apply a scenario and return the network it produces."""

    type: Literal["apply_scenario"]
    scenario: ScenarioIn


class ScenarioAllocateCommand(BaseModel):
    """Apply a scenario, then allocate the network it produces."""

    type: Literal["scenario_allocate"]
    scenario: ScenarioIn
    strategy: StrategyName = StrategyName.BALANCED


ClientCommand = Annotated[
    Union[
        PingCommand,
        GetNetworkCommand,
        AllocateCommand,
        ApplyScenarioCommand,
        ScenarioAllocateCommand,
    ],
    Field(discriminator="type"),
]

client_command_adapter: TypeAdapter[ClientCommand] = TypeAdapter(ClientCommand)


# -- server -> client ---------------------------------------------------------


class ConnectedEvent(BaseModel):
    """Sent once on connect, identifying the client."""

    type: Literal["connected"] = "connected"
    client_id: str
    client_count: int


class PongEvent(BaseModel):
    type: Literal["pong"] = "pong"


class NetworkEvent(BaseModel):
    """The current network state."""

    type: Literal["network"] = "network"
    network: NetworkStateOut


class AllocationEvent(BaseModel):
    """A computed allocation over the current network."""

    type: Literal["allocation"] = "allocation"
    allocation: AllocationResultOut


class ScenarioAppliedEvent(BaseModel):
    """The hypothetical network a scenario produced."""

    type: Literal["scenario_applied"] = "scenario_applied"
    scenario: ScenarioSummaryOut
    network: NetworkStateOut


class ScenarioAllocationEvent(BaseModel):
    """A scenario and the allocation computed over its network."""

    type: Literal["scenario_allocation"] = "scenario_allocation"
    scenario: ScenarioSummaryOut
    network: NetworkStateOut
    allocation: AllocationResultOut


class ErrorEvent(BaseModel):
    """A rejected command. Sent only to the originating client."""

    type: Literal["error"] = "error"
    code: str
    detail: str


ServerEvent = Union[
    ConnectedEvent,
    PongEvent,
    NetworkEvent,
    AllocationEvent,
    ScenarioAppliedEvent,
    ScenarioAllocationEvent,
    ErrorEvent,
]
