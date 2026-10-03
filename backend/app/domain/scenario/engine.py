"""The AquaOps scenario engine.

Takes a :class:`NetworkState` and a :class:`Scenario` and returns a **new**
network state with the scenario's changes applied. The input state is never
mutated, so a baseline can be compared against any number of scenarios.

The scenario engine does not allocate. It only produces the hypothetical
network that the allocation engine is then run against, which keeps "what if
the network looked like this" cleanly separated from "who gets water".
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.allocation.state import (
    DemandPoint,
    Link,
    NetworkState,
    SupplySource,
    TankerUnit,
    TransitNode,
)
from app.domain.scenario.changes import (
    EntityKind,
    ScenarioChange,
    _ScaleDemand,
)


class ScenarioError(ValueError):
    """Raised when a scenario cannot be applied to the given network state."""


@dataclass(frozen=True)
class Scenario:
    """A named set of simulated changes applied in declaration order.

    Order matters only when two changes target the same entity, in which case
    they compose — two successive 50% capacity cuts leave 25%.
    """

    name: str
    changes: tuple[ScenarioChange, ...] = field(default_factory=tuple)
    description: str = ""

    def __post_init__(self) -> None:
        if not self.name or not self.name.strip():
            raise ScenarioError("scenario name must be a non-empty string")

    def describe(self) -> tuple[str, ...]:
        return tuple(change.describe() for change in self.changes)


def apply_scenario(state: NetworkState, scenario: Scenario) -> NetworkState:
    """Return a new network state with ``scenario`` applied.

    ``state`` is left untouched. Raises :class:`ScenarioError` if any change
    targets an entity that does not exist, or one of the wrong kind.
    """
    sources: dict[str, SupplySource] = {s.code: s for s in state.sources}
    transits: dict[str, TransitNode] = {t.code: t for t in state.transits}
    demands: dict[str, DemandPoint] = {d.code: d for d in state.demands}
    links: dict[str, Link] = {item.code: item for item in state.links}
    tankers: dict[str, TankerUnit] = {t.code: t for t in state.tankers}

    for change in scenario.changes:
        kind = change.entity_kind
        code = change.target_code

        if kind is EntityKind.SOURCE:
            _require(sources, code, "reservoir", scenario)
            sources[code] = change.apply_to(sources[code])
        elif kind is EntityKind.TRANSIT:
            _require(transits, code, "treatment plant", scenario)
            transits[code] = change.apply_to(transits[code])
        elif kind is EntityKind.LINK:
            _require(links, code, "pipeline", scenario)
            links[code] = change.apply_to(links[code])
        elif kind is EntityKind.TANKER:
            _require(tankers, code, "tanker", scenario)
            tankers[code] = change.apply_to(tankers[code])
        elif kind is EntityKind.DEMAND:
            _require(demands, code, "demand point", scenario)
            point = demands[code]
            if isinstance(change, _ScaleDemand):
                expected = change.expected_demand_kind
                if point.kind is not expected:
                    raise ScenarioError(
                        f"scenario {scenario.name!r}: {code!r} is a "
                        f"{point.kind.value}, not a {expected.value}"
                    )
            demands[code] = change.apply_to(point)
        else:
            raise ScenarioError(
                f"scenario {scenario.name!r}: unsupported entity kind {kind!r}"
            )

    # Rebuild in the original declaration order so results stay deterministic
    # and comparable against the baseline.
    return NetworkState(
        sources=tuple(sources[s.code] for s in state.sources),
        transits=tuple(transits[t.code] for t in state.transits),
        demands=tuple(demands[d.code] for d in state.demands),
        links=tuple(links[item.code] for item in state.links),
        tankers=tuple(tankers[t.code] for t in state.tankers),
    )


def apply_scenarios(
    state: NetworkState, scenarios: list[Scenario]
) -> tuple[NetworkState, ...]:
    """Apply several scenarios independently to the same baseline state."""
    return tuple(apply_scenario(state, scenario) for scenario in scenarios)


def _require(
    collection: dict[str, object],
    code: str,
    label: str,
    scenario: Scenario,
) -> None:
    if code not in collection:
        known = ", ".join(sorted(collection)) or "none"
        raise ScenarioError(
            f"scenario {scenario.name!r}: no {label} with code {code!r} "
            f"(known: {known})"
        )


__all__ = [
    "Scenario",
    "ScenarioError",
    "apply_scenario",
    "apply_scenarios",
]
