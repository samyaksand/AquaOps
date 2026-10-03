"""Translates WebSocket commands into service calls and outbound events.

This module performs no computation of its own. It parses a frame, delegates
to ``app.services.allocation_service``, and decides whether the answer is
private to the sender or interesting to every connected client.
"""

from __future__ import annotations

import json

from pydantic import ValidationError

from app.core.logging import get_logger
from app.domain.scenario import ScenarioError
from app.realtime.manager import ConnectionManager
from app.schemas.allocation import AllocationResultOut
from app.schemas.network import NetworkStateOut
from app.schemas.realtime import (
    AllocateCommand,
    AllocationEvent,
    ApplyScenarioCommand,
    ErrorEvent,
    GetNetworkCommand,
    NetworkEvent,
    PingCommand,
    PongEvent,
    ScenarioAllocateCommand,
    ScenarioAllocationEvent,
    ScenarioAppliedEvent,
    client_command_adapter,
)
from app.schemas.scenario import ScenarioSummaryOut
from app.services.allocation_service import (
    allocate_network,
    allocate_scenario,
    apply_scenario_to_network,
)

logger = get_logger(__name__)

# Scenario and allocation outcomes are shared decision context, so they go to
# every connected client. Acknowledgements and errors stay with the sender.
BROADCAST_TYPES = frozenset(
    {"allocation", "scenario_applied", "scenario_allocation"}
)


async def handle_frame(
    raw: str,
    client_id: str,
    provider,
    manager: ConnectionManager,
) -> None:
    """Parse one inbound frame and emit the resulting event(s)."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        await manager.send(
            client_id,
            ErrorEvent(code="invalid_json", detail="Frame is not valid JSON."),
        )
        return

    if not isinstance(payload, dict):
        await manager.send(
            client_id,
            ErrorEvent(
                code="invalid_message",
                detail="Frame must be a JSON object with a 'type' field.",
            ),
        )
        return

    try:
        command = client_command_adapter.validate_python(payload)
    except ValidationError as exc:
        await manager.send(
            client_id,
            ErrorEvent(code="invalid_message", detail=_summarize(exc)),
        )
        return

    try:
        event = await _dispatch(command, provider)
    except ScenarioError as exc:
        await manager.send(
            client_id, ErrorEvent(code="scenario_error", detail=str(exc))
        )
        return
    except ValueError as exc:
        await manager.send(
            client_id, ErrorEvent(code="invalid_request", detail=str(exc))
        )
        return

    if event.type in BROADCAST_TYPES:
        await manager.broadcast(event)
    else:
        await manager.send(client_id, event)


async def _dispatch(command, provider):
    """Run one validated command and build its outbound event."""
    if isinstance(command, PingCommand):
        return PongEvent()

    if isinstance(command, GetNetworkCommand):
        state = await provider()
        return NetworkEvent(network=NetworkStateOut.from_domain(state))

    if isinstance(command, AllocateCommand):
        state = await provider()
        result = allocate_network(state, command.strategy)
        return AllocationEvent(
            allocation=AllocationResultOut.from_domain(result)
        )

    if isinstance(command, ApplyScenarioCommand):
        state = await provider()
        scenario = command.scenario.to_domain()
        disrupted = apply_scenario_to_network(state, scenario)
        return ScenarioAppliedEvent(
            scenario=ScenarioSummaryOut.from_domain(scenario),
            network=NetworkStateOut.from_domain(disrupted),
        )

    if isinstance(command, ScenarioAllocateCommand):
        state = await provider()
        scenario = command.scenario.to_domain()
        disrupted, result = allocate_scenario(
            state, scenario, command.strategy
        )
        return ScenarioAllocationEvent(
            scenario=ScenarioSummaryOut.from_domain(scenario),
            network=NetworkStateOut.from_domain(disrupted),
            allocation=AllocationResultOut.from_domain(result),
        )

    raise ValueError(f"unhandled command type: {type(command).__name__}")


def _summarize(exc: ValidationError) -> str:
    """Flatten a validation error into one readable line."""
    parts = []
    for error in exc.errors():
        location = ".".join(str(item) for item in error["loc"]) or "body"
        parts.append(f"{location}: {error['msg']}")
    return "; ".join(parts)
