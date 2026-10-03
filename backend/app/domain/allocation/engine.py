"""The AquaOps allocation engine.

Given a :class:`NetworkState` and a strategy, the engine computes how much
water each demand point actually receives. It is pure: no I/O, no clock, no
randomness, so the same inputs always produce the same result.

Model
-----
Water is withdrawn at reservoirs and routed to demand points over directed
pipelines, optionally passing through treatment plants. Every pipeline loses a
fraction of what is injected and every plant has a volumetric recovery ratio,
so delivering one cubic metre at a demand point costs more than one cubic metre
at the source. The engine tracks that cost explicitly.

Allocation proceeds in two passes over the strategy's ordering: first every
demand point is brought up to its *minimum* demand, then the remainder is
distributed up to full demand. The minimum-first pass means a strategy
reorders who gets surplus without starving anyone whose lifeline volume the
network can still physically reach.

Within a demand point, routes are used cheapest-first (highest end-to-end
efficiency), which is what makes the efficiency metric meaningful rather than
an artifact of path discovery order.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from app.domain.allocation.results import (
    AllocationResult,
    DemandAllocation,
    RouteFlow,
)
from app.domain.allocation.state import (
    DemandPoint,
    Link,
    NetworkState,
    SupplySource,
    TransitNode,
)
from app.domain.allocation.strategies import (
    AllocationStrategy,
    DemandContext,
    StrategyName,
    get_strategy,
)

ZERO = Decimal("0")
ONE = Decimal("1")


@dataclass(frozen=True)
class EngineConfig:
    """Tunable, explicit engine parameters.

    ``derate_factor`` is the fraction of rated capacity a *degraded* asset is
    assumed to still provide. It is a modelling assumption, surfaced here
    rather than buried in the algorithm.
    """

    derate_factor: Decimal = Decimal("0.5")
    max_route_links: int = 6
    max_routes_per_demand: int = 32
    guarantee_minimums_first: bool = True

    def __post_init__(self) -> None:
        if not (ZERO <= self.derate_factor <= ONE):
            raise ValueError("derate_factor must be in [0, 1]")
        if self.max_route_links < 1:
            raise ValueError("max_route_links must be at least 1")
        if self.max_routes_per_demand < 1:
            raise ValueError("max_routes_per_demand must be at least 1")


@dataclass(frozen=True)
class _RouteElement:
    """One capacity-bearing element of a route, with its downstream efficiency.

    ``downstream_efficiency`` converts a volume delivered at the demand point
    into the volume that must pass through this element, which is what lets a
    single ``min`` express every capacity constraint along the route.
    """

    kind: str  # "source" | "link" | "transit"
    code: str
    downstream_efficiency: Decimal


@dataclass(frozen=True)
class _Route:
    """A concrete simple path from one source to one demand point."""

    source_code: str
    demand_code: str
    node_codes: tuple[str, ...]
    elements: tuple[_RouteElement, ...]
    efficiency: Decimal


class AllocationEngine:
    """Computes allocations over a network state."""

    def __init__(self, config: EngineConfig | None = None) -> None:
        self.config = config or EngineConfig()

    # -- public API ---------------------------------------------------------

    def allocate(
        self,
        state: NetworkState,
        strategy: AllocationStrategy | StrategyName | str,
    ) -> AllocationResult:
        """Run one allocation and return its computed result."""
        resolved = (
            strategy
            if hasattr(strategy, "ordering_key")
            else get_strategy(strategy)  # type: ignore[arg-type]
        )

        sources = {s.code: s for s in state.sources}
        transits = {t.code: t for t in state.transits}

        routes = self._discover_routes(state)
        contexts = self._build_contexts(state, routes)

        residual_source = {
            code: self._clamp(s.usable_supply(self.config.derate_factor))
            for code, s in sources.items()
        }
        residual_transit = {
            code: self._clamp(t.usable_capacity(self.config.derate_factor))
            for code, t in transits.items()
        }
        residual_link = {
            link.code: self._clamp(link.usable_capacity(self.config.derate_factor))
            for link in state.links
        }

        delivered: dict[str, Decimal] = {d.code: ZERO for d in state.demands}
        withdrawn: dict[str, Decimal] = {d.code: ZERO for d in state.demands}
        route_flows: dict[str, list[RouteFlow]] = {d.code: [] for d in state.demands}
        source_withdrawn: dict[str, Decimal] = {code: ZERO for code in sources}

        order = self._ordered_demands(state.demands, resolved, contexts)

        targets: list[tuple[DemandPoint, Decimal]] = []
        if self.config.guarantee_minimums_first:
            targets.extend(
                (point, point.minimum_demand_m3_per_day) for point in order
            )
        targets.extend((point, point.demand_m3_per_day) for point in order)

        for point, ceiling in targets:
            shortfall = ceiling - delivered[point.code]
            if shortfall <= ZERO:
                continue
            self._serve(
                point=point,
                want=shortfall,
                routes=routes.get(point.code, ()),
                residual_source=residual_source,
                residual_transit=residual_transit,
                residual_link=residual_link,
                delivered=delivered,
                withdrawn=withdrawn,
                route_flows=route_flows,
                source_withdrawn=source_withdrawn,
            )

        allocations = tuple(
            DemandAllocation(
                code=point.code,
                name=point.name,
                kind=point.kind,
                priority_rank=point.priority_rank,
                population=point.population,
                demand_m3_per_day=point.demand_m3_per_day,
                minimum_demand_m3_per_day=point.minimum_demand_m3_per_day,
                supplied_m3_per_day=delivered[point.code],
                withdrawn_m3_per_day=withdrawn[point.code],
                routes=tuple(route_flows[point.code]),
            )
            for point in state.demands
        )

        total_available = sum(
            (
                s.usable_supply(self.config.derate_factor)
                for s in state.sources
            ),
            ZERO,
        )

        return AllocationResult(
            strategy=resolved.name.value,
            allocations=allocations,
            total_supply_available_m3_per_day=total_available,
            source_withdrawals=tuple(sorted(source_withdrawn.items())),
        )

    def compare(
        self,
        state: NetworkState,
        strategies: list[AllocationStrategy | StrategyName | str],
    ) -> tuple[AllocationResult, ...]:
        """Run several strategies over the same state for trade-off comparison."""
        return tuple(self.allocate(state, strategy) for strategy in strategies)

    # -- allocation ---------------------------------------------------------

    def _serve(
        self,
        *,
        point: DemandPoint,
        want: Decimal,
        routes: tuple[_Route, ...],
        residual_source: dict[str, Decimal],
        residual_transit: dict[str, Decimal],
        residual_link: dict[str, Decimal],
        delivered: dict[str, Decimal],
        withdrawn: dict[str, Decimal],
        route_flows: dict[str, list[RouteFlow]],
        source_withdrawn: dict[str, Decimal],
    ) -> None:
        """Push up to ``want`` to one demand point over its cheapest routes."""
        remaining = want

        for route in routes:
            if remaining <= ZERO:
                break

            headroom = self._route_headroom(
                route, residual_source, residual_transit, residual_link
            )
            amount = min(remaining, headroom)
            if amount <= ZERO:
                continue

            for element in route.elements:
                usage = amount / element.downstream_efficiency
                if element.kind == "source":
                    residual_source[element.code] = self._clamp(
                        residual_source[element.code] - usage
                    )
                elif element.kind == "link":
                    residual_link[element.code] = self._clamp(
                        residual_link[element.code] - usage
                    )
                else:
                    residual_transit[element.code] = self._clamp(
                        residual_transit[element.code] - usage
                    )

            cost = amount / route.efficiency
            delivered[point.code] += amount
            withdrawn[point.code] += cost
            source_withdrawn[route.source_code] += cost
            route_flows[point.code].append(
                RouteFlow(
                    source_code=route.source_code,
                    node_codes=route.node_codes,
                    delivered_m3_per_day=amount,
                    withdrawn_m3_per_day=cost,
                    efficiency=route.efficiency,
                )
            )
            remaining -= amount

    def _route_headroom(
        self,
        route: _Route,
        residual_source: dict[str, Decimal],
        residual_transit: dict[str, Decimal],
        residual_link: dict[str, Decimal],
    ) -> Decimal:
        """Largest volume deliverable on this route given current residuals."""
        headroom: Decimal | None = None
        for element in route.elements:
            if element.kind == "source":
                residual = residual_source[element.code]
            elif element.kind == "link":
                residual = residual_link[element.code]
            else:
                residual = residual_transit[element.code]

            limit = residual * element.downstream_efficiency
            if headroom is None or limit < headroom:
                headroom = limit
        return self._clamp(headroom if headroom is not None else ZERO)

    # -- ordering -----------------------------------------------------------

    def _ordered_demands(
        self,
        demands: tuple[DemandPoint, ...],
        strategy: AllocationStrategy,
        contexts: dict[str, DemandContext],
    ) -> tuple[DemandPoint, ...]:
        return tuple(
            sorted(
                demands,
                key=lambda point: strategy.ordering_key(point, contexts[point.code]),
            )
        )

    def _build_contexts(
        self, state: NetworkState, routes: dict[str, tuple[_Route, ...]]
    ) -> dict[str, DemandContext]:
        max_population = max((d.population for d in state.demands), default=0)
        max_demand = max(
            (d.demand_m3_per_day for d in state.demands), default=ZERO
        )
        contexts: dict[str, DemandContext] = {}
        for point in state.demands:
            point_routes = routes.get(point.code, ())
            best = max((r.efficiency for r in point_routes), default=ZERO)
            contexts[point.code] = DemandContext(
                best_efficiency=best,
                max_population=max_population,
                max_demand_m3_per_day=max_demand,
            )
        return contexts

    # -- route discovery ----------------------------------------------------

    def _discover_routes(
        self, state: NetworkState
    ) -> dict[str, tuple[_Route, ...]]:
        """Enumerate usable simple paths from each source to each demand point."""
        sources = {s.code: s for s in state.sources}
        transits = {t.code: t for t in state.transits}
        demand_codes = {d.code for d in state.demands}

        usable_links = [
            link
            for link in state.links
            if link.usable_capacity(self.config.derate_factor) > ZERO
        ]
        adjacency: dict[str, list[Link]] = {}
        for link in sorted(usable_links, key=lambda item: item.code):
            adjacency.setdefault(link.source_code, []).append(link)

        found: dict[str, list[_Route]] = {code: [] for code in demand_codes}

        for source_code in sorted(sources):
            if sources[source_code].usable_supply(self.config.derate_factor) <= ZERO:
                continue
            self._walk(
                source_code=source_code,
                current_code=source_code,
                adjacency=adjacency,
                transits=transits,
                demand_codes=demand_codes,
                visited=(source_code,),
                links_taken=(),
                found=found,
            )

        return {
            code: tuple(
                sorted(
                    paths,
                    key=lambda route: (-route.efficiency, route.node_codes),
                )[: self.config.max_routes_per_demand]
            )
            for code, paths in found.items()
        }

    def _walk(
        self,
        *,
        source_code: str,
        current_code: str,
        adjacency: dict[str, list[Link]],
        transits: dict[str, TransitNode],
        demand_codes: set[str],
        visited: tuple[str, ...],
        links_taken: tuple[Link, ...],
        found: dict[str, list[_Route]],
    ) -> None:
        if len(links_taken) >= self.config.max_route_links:
            return

        for link in adjacency.get(current_code, ()):
            next_code = link.target_code
            if next_code in visited:
                continue

            path_links = (*links_taken, link)
            path_nodes = (*visited, next_code)

            if next_code in demand_codes:
                found[next_code].append(
                    self._build_route(
                        source_code=source_code,
                        demand_code=next_code,
                        node_codes=path_nodes,
                        links=path_links,
                        transits=transits,
                    )
                )

            self._walk(
                source_code=source_code,
                current_code=next_code,
                adjacency=adjacency,
                transits=transits,
                demand_codes=demand_codes,
                visited=path_nodes,
                links_taken=path_links,
                found=found,
            )

    def _build_route(
        self,
        *,
        source_code: str,
        demand_code: str,
        node_codes: tuple[str, ...],
        links: tuple[Link, ...],
        transits: dict[str, TransitNode],
    ) -> _Route:
        """Attach each element's downstream efficiency, walking backwards."""
        # Intermediate nodes sit between consecutive links; the source and the
        # demand point themselves apply no conversion.
        intermediate = node_codes[1:-1]

        elements: list[_RouteElement] = []
        downstream = ONE

        for index in range(len(links) - 1, -1, -1):
            link = links[index]
            downstream *= link.throughput_ratio
            elements.append(_RouteElement("link", link.code, downstream))

            if index > 0:
                node_code = intermediate[index - 1]
                transit = transits.get(node_code)
                if transit is not None:
                    downstream *= transit.recovery_ratio
                    elements.append(
                        _RouteElement("transit", node_code, downstream)
                    )

        elements.append(_RouteElement("source", source_code, downstream))
        elements.reverse()

        return _Route(
            source_code=source_code,
            demand_code=demand_code,
            node_codes=node_codes,
            elements=tuple(elements),
            efficiency=downstream,
        )

    # -- helpers ------------------------------------------------------------

    @staticmethod
    def _clamp(value: Decimal) -> Decimal:
        """Guard against negative residuals from trailing-digit rounding."""
        return value if value > ZERO else ZERO


def allocate(
    state: NetworkState,
    strategy: AllocationStrategy | StrategyName | str,
    config: EngineConfig | None = None,
) -> AllocationResult:
    """Convenience wrapper for a one-off allocation."""
    return AllocationEngine(config).allocate(state, strategy)


def compare_strategies(
    state: NetworkState,
    config: EngineConfig | None = None,
) -> tuple[AllocationResult, ...]:
    """Run all four strategies over one state, in declaration order."""
    return AllocationEngine(config).compare(state, list(StrategyName))
