"""Input validation: invalid network states must be rejected, not allocated."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.allocation import (
    DemandKind,
    DemandPoint,
    EngineConfig,
    Link,
    NetworkState,
    OperationalState,
    SupplySource,
    TransitNode,
)

from .conftest import link, zone

D = Decimal


def test_minimum_demand_above_demand_is_rejected():
    with pytest.raises(ValueError, match="minimum demand exceeds demand"):
        DemandPoint(
            code="Z1",
            name="Z1",
            kind=DemandKind.ZONE,
            demand_m3_per_day=D("100"),
            minimum_demand_m3_per_day=D("200"),
        )


def test_negative_demand_is_rejected():
    with pytest.raises(ValueError, match="demand must be non-negative"):
        DemandPoint(
            code="Z1",
            name="Z1",
            kind=DemandKind.ZONE,
            demand_m3_per_day=D("-1"),
        )


def test_negative_population_is_rejected():
    with pytest.raises(ValueError, match="population must be non-negative"):
        DemandPoint(
            code="Z1",
            name="Z1",
            kind=DemandKind.ZONE,
            demand_m3_per_day=D("10"),
            population=-5,
        )


def test_self_looping_link_is_rejected():
    with pytest.raises(ValueError, match="self-loop"):
        Link(
            code="L1",
            source_code="N1",
            target_code="N1",
            capacity_m3_per_day=D("100"),
        )


@pytest.mark.parametrize("loss", ["-0.1", "1", "1.5"])
def test_out_of_range_loss_ratio_is_rejected(loss):
    with pytest.raises(ValueError, match="loss ratio"):
        Link(
            code="L1",
            source_code="A",
            target_code="B",
            capacity_m3_per_day=D("100"),
            loss_ratio=D(loss),
        )


def test_link_to_unknown_node_is_rejected():
    with pytest.raises(ValueError, match="unknown node"):
        NetworkState(
            sources=(SupplySource("R1", "R1", D("100")),),
            demands=(zone("Z1", demand="10", minimum="0", population=1),),
            links=(link("L1", "R1", "GHOST", capacity="100"),),
        )


def test_duplicate_node_codes_are_rejected():
    with pytest.raises(ValueError, match="duplicate node code"):
        NetworkState(
            sources=(SupplySource("X", "X", D("100")),),
            transits=(TransitNode("X", "X", D("100")),),
        )


def test_duplicate_link_codes_are_rejected():
    with pytest.raises(ValueError, match="duplicate link code"):
        NetworkState(
            sources=(SupplySource("R1", "R1", D("100")),),
            demands=(
                zone("Z1", demand="10", minimum="0", population=1),
                zone("Z2", demand="10", minimum="0", population=1),
            ),
            links=(
                link("SAME", "R1", "Z1", capacity="100"),
                link("SAME", "R1", "Z2", capacity="100"),
            ),
        )


def test_operational_state_scales_capacity():
    online = Link("L", "A", "B", D("100"))
    derated = Link("L", "A", "B", D("100"), state=OperationalState.DERATED)
    offline = Link("L", "A", "B", D("100"), state=OperationalState.UNAVAILABLE)

    assert online.usable_capacity(D("0.5")) == D("100")
    assert derated.usable_capacity(D("0.5")) == D("50")
    assert offline.usable_capacity(D("0.5")) == D("0")


def test_empty_network_allocates_nothing():
    from app.domain.allocation import StrategyName, allocate

    result = allocate(NetworkState(), StrategyName.BALANCED)
    assert result.allocations == ()
    assert result.total_supplied_m3_per_day == D(0)
    assert result.total_unmet_m3_per_day == D(0)
    assert result.demand_coverage_ratio == D(1)
    assert result.critical_facility_coverage == D(1)
    assert result.population_weighted_satisfaction == D(1)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"derate_factor": D("-0.1")},
        {"derate_factor": D("1.1")},
        {"max_route_links": 0},
        {"max_routes_per_demand": 0},
    ],
)
def test_invalid_engine_config_is_rejected(kwargs):
    with pytest.raises(ValueError):
        EngineConfig(**kwargs)


def test_total_demand_is_computed_from_members(scarce_network):
    assert scarce_network.total_demand_m3_per_day == D("1300")
