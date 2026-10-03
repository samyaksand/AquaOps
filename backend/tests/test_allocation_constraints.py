"""Constraint enforcement: supply, demand, pipeline and plant capacity.

Capacity usage is recomputed here from the returned route flows, independently
of the engine's own bookkeeping, so a bug in the engine's residual tracking
cannot make these assertions pass.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.allocation import (
    AllocationEngine,
    DemandKind,
    DemandPoint,
    EngineConfig,
    Link,
    NetworkState,
    OperationalState,
    StrategyName,
    SupplySource,
    TransitNode,
    allocate,
)
from app.domain.allocation.results import AllocationResult

from .conftest import build_network, facility, link, zone

D = Decimal
TOLERANCE = D("0.000001")
ALL_STRATEGIES = list(StrategyName)


def _usage(
    state: NetworkState, result: AllocationResult, derate: Decimal
) -> tuple[dict[str, Decimal], dict[str, Decimal], dict[str, Decimal]]:
    """Recompute per-element throughput from the reported route flows."""
    links = {item.code: item for item in state.links}
    by_endpoints = {(item.source_code, item.target_code): item for item in state.links}
    transits = {item.code: item for item in state.transits}

    source_usage: dict[str, Decimal] = {s.code: D(0) for s in state.sources}
    link_usage: dict[str, Decimal] = {code: D(0) for code in links}
    transit_usage: dict[str, Decimal] = {code: D(0) for code in transits}

    for allocation in result.allocations:
        for route in allocation.routes:
            nodes = route.node_codes
            delivered = route.delivered_m3_per_day
            downstream = D(1)

            for index in range(len(nodes) - 2, -1, -1):
                edge = by_endpoints[(nodes[index], nodes[index + 1])]
                downstream *= edge.throughput_ratio
                link_usage[edge.code] += delivered / downstream

                if index > 0:
                    node_code = nodes[index]
                    transit = transits.get(node_code)
                    if transit is not None:
                        downstream *= transit.recovery_ratio
                        transit_usage[node_code] += delivered / downstream

            source_usage[nodes[0]] += delivered / downstream

    return source_usage, link_usage, transit_usage


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_allocations_never_exceed_demand(scarce_network, strategy):
    result = allocate(scarce_network, strategy)
    for allocation in result.allocations:
        assert allocation.supplied_m3_per_day >= 0
        assert allocation.supplied_m3_per_day <= allocation.demand_m3_per_day
        assert allocation.unmet_m3_per_day >= 0
        assert D(0) <= allocation.satisfaction_ratio <= D(1)


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_withdrawals_never_exceed_available_supply(scarce_network, strategy):
    result = allocate(scarce_network, strategy)
    available = result.total_supply_available_m3_per_day
    assert result.total_withdrawn_m3_per_day <= available + TOLERANCE

    source_usage, _, _ = _usage(scarce_network, result, D("0.5"))
    for source in scarce_network.sources:
        assert source_usage[source.code] <= source.available_m3_per_day + TOLERANCE


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_pipeline_and_plant_capacity_respected(scarce_network, strategy):
    config = EngineConfig()
    result = AllocationEngine(config).allocate(scarce_network, strategy)
    _, link_usage, transit_usage = _usage(
        scarce_network, result, config.derate_factor
    )

    for item in scarce_network.links:
        limit = item.usable_capacity(config.derate_factor)
        assert link_usage[item.code] <= limit + TOLERANCE, item.code

    for item in scarce_network.transits:
        limit = item.usable_capacity(config.derate_factor)
        assert transit_usage[item.code] <= limit + TOLERANCE, item.code


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_transit_losses_are_accounted_for(scarce_network, strategy):
    """Delivering through a lossy pipeline must cost more than it delivers."""
    result = allocate(scarce_network, strategy)
    big = result.by_code("Z-BIG")
    if big.supplied_m3_per_day > 0:
        # Z-BIG is reachable only via a 10% loss pipeline.
        assert big.withdrawn_m3_per_day > big.supplied_m3_per_day
        ratio = big.supplied_m3_per_day / big.withdrawn_m3_per_day
        assert abs(ratio - D("0.9")) < TOLERANCE

    small = result.by_code("Z-SMALL")
    if small.supplied_m3_per_day > 0:
        # Z-SMALL's route is lossless.
        assert abs(
            small.withdrawn_m3_per_day - small.supplied_m3_per_day
        ) < TOLERANCE


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_ample_supply_satisfies_all_demand(ample_network, strategy):
    result = allocate(ample_network, strategy)
    assert result.total_unmet_m3_per_day == D(0)
    assert result.demand_coverage_ratio == D(1)
    assert result.critical_facility_coverage == D(1)
    assert result.minimum_demand_shortfalls == ()
    for allocation in result.allocations:
        assert allocation.fully_supplied


def test_plant_capacity_caps_total_delivery():
    """A plant smaller than demand becomes the binding constraint."""
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("10000")),),
        transits=(TransitNode("P1", "P1", D("250"), D("1")),),
        demands=(zone("Z1", demand="1000", minimum="0", population=10),),
        links=(
            link("L1", "R1", "P1", capacity="10000"),
            link("L2", "P1", "Z1", capacity="10000"),
        ),
    )
    result = allocate(state, StrategyName.BALANCED)
    assert result.by_code("Z1").supplied_m3_per_day == D("250")
    assert result.by_code("Z1").unmet_m3_per_day == D("750")


def test_plant_recovery_ratio_reduces_deliverable_volume():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(TransitNode("P1", "P1", D("1000"), D("0.8")),),
        demands=(zone("Z1", demand="1000", minimum="0", population=10),),
        links=(
            link("L1", "R1", "P1", capacity="1000"),
            link("L2", "P1", "Z1", capacity="1000"),
        ),
    )
    result = allocate(state, StrategyName.BALANCED)
    allocation = result.by_code("Z1")
    # 1000 withdrawn * 0.8 recovery = 800 delivered.
    assert allocation.supplied_m3_per_day == D("800")
    assert allocation.withdrawn_m3_per_day == D("1000")
    assert result.delivery_efficiency == D("0.8")


def test_offline_pipeline_makes_demand_unreachable():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(),
        demands=(zone("Z1", demand="100", minimum="50", population=10),),
        links=(
            link(
                "L1",
                "R1",
                "Z1",
                capacity="1000",
                state=OperationalState.UNAVAILABLE,
            ),
        ),
    )
    result = allocate(state, StrategyName.BALANCED)
    assert result.by_code("Z1").supplied_m3_per_day == D(0)
    assert result.by_code("Z1").unmet_m3_per_day == D("100")
    assert result.minimum_demand_shortfalls == ("Z1",)
    assert result.delivery_efficiency == D(1)


def test_offline_reservoir_contributes_no_supply():
    state = NetworkState(
        sources=(
            SupplySource(
                "R-DEAD", "R-DEAD", D("5000"), OperationalState.UNAVAILABLE
            ),
            SupplySource("R-LIVE", "R-LIVE", D("40")),
        ),
        transits=(),
        demands=(zone("Z1", demand="100", minimum="0", population=10),),
        links=(
            link("L-DEAD", "R-DEAD", "Z1", capacity="1000"),
            link("L-LIVE", "R-LIVE", "Z1", capacity="1000"),
        ),
    )
    result = allocate(state, StrategyName.BALANCED)
    assert result.total_supply_available_m3_per_day == D("40")
    assert result.by_code("Z1").supplied_m3_per_day == D("40")
    withdrawals = dict(result.source_withdrawals)
    assert withdrawals["R-DEAD"] == D(0)
    assert withdrawals["R-LIVE"] == D("40")


def test_degraded_asset_is_derated_by_configured_factor():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(),
        demands=(zone("Z1", demand="1000", minimum="0", population=10),),
        links=(
            link(
                "L1",
                "R1",
                "Z1",
                capacity="400",
                state=OperationalState.DERATED,
            ),
        ),
    )
    half = AllocationEngine(EngineConfig(derate_factor=D("0.5")))
    assert half.allocate(state, StrategyName.BALANCED).by_code(
        "Z1"
    ).supplied_m3_per_day == D("200")

    quarter = AllocationEngine(EngineConfig(derate_factor=D("0.25")))
    assert quarter.allocate(state, StrategyName.BALANCED).by_code(
        "Z1"
    ).supplied_m3_per_day == D("100")


def test_unreachable_demand_is_reported_as_fully_unmet():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(),
        demands=(
            zone("Z-WIRED", demand="100", minimum="0", population=10),
            zone("Z-ISLAND", demand="100", minimum="25", population=10),
        ),
        links=(link("L1", "R1", "Z-WIRED", capacity="1000"),),
    )
    result = allocate(state, StrategyName.BALANCED)
    assert result.by_code("Z-WIRED").supplied_m3_per_day == D("100")
    assert result.by_code("Z-ISLAND").supplied_m3_per_day == D(0)
    assert result.minimum_demand_shortfalls == ("Z-ISLAND",)


def test_minimums_are_served_before_any_surplus():
    """The hospital's lifeline volume precedes the big zone's surplus."""
    state = build_network("250")
    result = allocate(state, StrategyName.POPULATION_FIRST)

    # Minimums: Z-BIG 100 (cost 111.11), Z-SMALL 100 (cost 100),
    # F-HOSP 100 (cost 105.26) -> 316.37 needed, only 250 available.
    # Population First therefore orders the lifeline pass: Z-BIG, F-HOSP, Z-SMALL.
    assert result.by_code("Z-BIG").supplied_m3_per_day == D("100")
    assert result.by_code("F-HOSP").supplied_m3_per_day == D("100")
    assert result.by_code("Z-SMALL").supplied_m3_per_day < D("100")


def test_disabling_minimum_pass_changes_outcome():
    state = build_network("250")
    with_minimums = AllocationEngine(
        EngineConfig(guarantee_minimums_first=True)
    ).allocate(state, StrategyName.POPULATION_FIRST)
    without = AllocationEngine(
        EngineConfig(guarantee_minimums_first=False)
    ).allocate(state, StrategyName.POPULATION_FIRST)

    # Without the lifeline pass the largest zone absorbs supply first.
    assert without.by_code("Z-BIG").supplied_m3_per_day > D("100")
    assert without.by_code("F-HOSP").supplied_m3_per_day < D("100")
    assert with_minimums.by_code("F-HOSP").supplied_m3_per_day == D("100")


def test_zero_demand_point_is_treated_as_satisfied():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("100")),),
        transits=(),
        demands=(
            DemandPoint(
                code="Z-EMPTY",
                name="Z-EMPTY",
                kind=DemandKind.ZONE,
                demand_m3_per_day=D(0),
                population=0,
            ),
        ),
        links=(link("L1", "R1", "Z-EMPTY", capacity="100"),),
    )
    result = allocate(state, StrategyName.BALANCED)
    allocation = result.by_code("Z-EMPTY")
    assert allocation.supplied_m3_per_day == D(0)
    assert allocation.satisfaction_ratio == D(1)
    assert allocation.meets_minimum
    assert result.demand_coverage_ratio == D(1)


def test_totals_are_internally_consistent(scarce_network):
    for strategy in ALL_STRATEGIES:
        result = allocate(scarce_network, strategy)
        supplied = sum(
            (a.supplied_m3_per_day for a in result.allocations), D(0)
        )
        unmet = sum((a.unmet_m3_per_day for a in result.allocations), D(0))
        assert result.total_supplied_m3_per_day == supplied
        assert result.total_unmet_m3_per_day == unmet
        assert supplied + unmet == result.total_demand_m3_per_day
        assert (
            result.total_transit_loss_m3_per_day
            == result.total_withdrawn_m3_per_day - supplied
        )
        assert sum(
            (amount for _, amount in result.source_withdrawals), D(0)
        ) == pytest.approx(result.total_withdrawn_m3_per_day)


def test_multi_hop_route_through_demand_zone_is_usable():
    """A facility fed off a zone's mains is reachable and costs both losses."""
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(),
        demands=(
            zone("Z1", demand="0", minimum="0", population=100),
            facility("F1", demand="100", minimum="0", population=500),
        ),
        links=(
            link("L1", "R1", "Z1", capacity="1000", loss="0.1"),
            link("L2", "Z1", "F1", capacity="1000", loss="0.2"),
        ),
    )
    result = allocate(state, StrategyName.BALANCED)
    allocation = result.by_code("F1")
    assert allocation.supplied_m3_per_day == D("100")
    # Efficiency 0.9 * 0.8 = 0.72 -> withdrawal 100 / 0.72.
    expected = D("100") / (D("0.9") * D("0.8"))
    assert abs(allocation.withdrawn_m3_per_day - expected) < TOLERANCE


def test_route_length_cap_blocks_long_paths():
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("1000")),),
        transits=(),
        demands=(
            zone("A", demand="0", minimum="0", population=1),
            zone("B", demand="0", minimum="0", population=1),
            zone("C", demand="100", minimum="0", population=1),
        ),
        links=(
            link("L1", "R1", "A", capacity="1000"),
            link("L2", "A", "B", capacity="1000"),
            link("L3", "B", "C", capacity="1000"),
        ),
    )
    reachable = AllocationEngine(EngineConfig(max_route_links=3)).allocate(
        state, StrategyName.BALANCED
    )
    assert reachable.by_code("C").supplied_m3_per_day == D("100")

    capped = AllocationEngine(EngineConfig(max_route_links=2)).allocate(
        state, StrategyName.BALANCED
    )
    assert capped.by_code("C").supplied_m3_per_day == D(0)
