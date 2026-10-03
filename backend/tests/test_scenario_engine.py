"""Scenario engine: each change type, validation, immutability, composition."""

from __future__ import annotations

import copy
from decimal import Decimal

import pytest

from app.domain.allocation import (
    DemandKind,
    NetworkState,
    OperationalState,
    StrategyName,
    SupplySource,
    TankerUnit,
    TransitNode,
    allocate,
)
from app.domain.scenario import (
    ChangeFacilityDemand,
    ChangeZoneDemand,
    ReducePipelineCapacity,
    ReduceReservoirSupply,
    ReduceTreatmentCapacity,
    Scenario,
    ScenarioError,
    SetPipelineUnavailable,
    SetTankerUnavailable,
    apply_scenario,
    apply_scenarios,
)

from .conftest import build_network, link, zone

D = Decimal
TOLERANCE = D("0.000001")


def _one(change) -> Scenario:
    return Scenario(name="test", changes=(change,))


def _source(state: NetworkState, code: str) -> SupplySource:
    return next(s for s in state.sources if s.code == code)


def _transit(state: NetworkState, code: str) -> TransitNode:
    return next(t for t in state.transits if t.code == code)


def _demand(state: NetworkState, code: str):
    return next(d for d in state.demands if d.code == code)


def _link(state: NetworkState, code: str):
    return next(item for item in state.links if item.code == code)


def _tanker(state: NetworkState, code: str) -> TankerUnit:
    return next(t for t in state.tankers if t.code == code)


# -- individual change types --------------------------------------------------


def test_reduce_reservoir_supply(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReduceReservoirSupply("R1", D("0.25")))
    )
    assert _source(result, "R1").available_m3_per_day == D("750")
    assert _source(scarce_network, "R1").available_m3_per_day == D("1000")


def test_reduce_reservoir_supply_to_zero(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReduceReservoirSupply("R1", D("1")))
    )
    assert _source(result, "R1").available_m3_per_day == D("0")
    # A network with no supply allocates nothing but stays valid.
    allocation = allocate(result, StrategyName.BALANCED)
    assert allocation.total_supplied_m3_per_day == D("0")


def test_reduce_treatment_capacity(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReduceTreatmentCapacity("P1", D("0.6")))
    )
    assert _transit(result, "P1").capacity_m3_per_day == D("4000")
    assert _transit(scarce_network, "P1").capacity_m3_per_day == D("10000")


def test_reduce_treatment_capacity_binds_allocation():
    """A plant cut below demand becomes the limiting constraint."""
    state = NetworkState(
        sources=(SupplySource("R1", "R1", D("10000")),),
        transits=(TransitNode("P1", "P1", D("1000"), D("1")),),
        demands=(zone("Z1", demand="1000", minimum="0", population=10),),
        links=(
            link("L1", "R1", "P1", capacity="10000"),
            link("L2", "P1", "Z1", capacity="10000"),
        ),
    )
    assert allocate(state, StrategyName.BALANCED).by_code(
        "Z1"
    ).supplied_m3_per_day == D("1000")

    reduced = apply_scenario(
        state, _one(ReduceTreatmentCapacity("P1", D("0.4")))
    )
    assert allocate(reduced, StrategyName.BALANCED).by_code(
        "Z1"
    ).supplied_m3_per_day == D("600")


def test_reduce_pipeline_capacity(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReducePipelineCapacity("L-P1-SMALL", D("0.5")))
    )
    assert _link(result, "L-P1-SMALL").capacity_m3_per_day == D("1000")
    assert _link(scarce_network, "L-P1-SMALL").capacity_m3_per_day == D("2000")


def test_reduce_pipeline_capacity_limits_delivery(scarce_network):
    """Choking Z-SMALL's lossless main caps what it can receive."""
    scenario = Scenario(
        name="choke",
        changes=(ReducePipelineCapacity("L-P1-SMALL", D("0.95")),),
    )
    result = apply_scenario(scarce_network, scenario)
    allocation = allocate(result, StrategyName.EFFICIENCY_FIRST)
    # Capacity falls to 100 on a lossless route, so delivery caps at 100.
    assert allocation.by_code("Z-SMALL").supplied_m3_per_day == D("100")


def test_set_pipeline_unavailable(scarce_network):
    result = apply_scenario(
        scarce_network, _one(SetPipelineUnavailable("L-P1-HOSP"))
    )
    assert _link(result, "L-P1-HOSP").state is OperationalState.UNAVAILABLE
    assert _link(scarce_network, "L-P1-HOSP").state is OperationalState.ONLINE


def test_unavailable_pipeline_strands_its_demand(scarce_network):
    result = apply_scenario(
        scarce_network, _one(SetPipelineUnavailable("L-P1-HOSP"))
    )
    allocation = allocate(result, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST)
    assert allocation.by_code("F-HOSP").supplied_m3_per_day == D("0")
    assert allocation.critical_facility_coverage == D("0")
    assert "F-HOSP" in allocation.minimum_demand_shortfalls


def test_increase_zone_demand(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ChangeZoneDemand("Z-BIG", D("1.5")))
    )
    assert _demand(result, "Z-BIG").demand_m3_per_day == D("750")
    assert _demand(result, "Z-BIG").minimum_demand_m3_per_day == D("100")
    assert _demand(scarce_network, "Z-BIG").demand_m3_per_day == D("500")


def test_decrease_zone_demand(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ChangeZoneDemand("Z-BIG", D("0.4")))
    )
    assert _demand(result, "Z-BIG").demand_m3_per_day == D("200")


def test_decrease_demand_below_minimum_lowers_the_minimum(scarce_network):
    """A lifeline volume above total demand is not a meaningful state."""
    result = apply_scenario(
        scarce_network, _one(ChangeZoneDemand("Z-BIG", D("0.1")))
    )
    point = _demand(result, "Z-BIG")
    assert point.demand_m3_per_day == D("50")
    assert point.minimum_demand_m3_per_day == D("50")


def test_increase_facility_demand(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ChangeFacilityDemand("F-HOSP", D("2")))
    )
    assert _demand(result, "F-HOSP").demand_m3_per_day == D("600")


def test_decrease_facility_demand(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ChangeFacilityDemand("F-HOSP", D("0.5")))
    )
    assert _demand(result, "F-HOSP").demand_m3_per_day == D("150")


def test_demand_increase_raises_unmet_demand(scarce_network):
    baseline = allocate(scarce_network, StrategyName.BALANCED)
    surged = apply_scenario(
        scarce_network, _one(ChangeZoneDemand("Z-BIG", D("2")))
    )
    after = allocate(surged, StrategyName.BALANCED)
    assert after.total_unmet_m3_per_day > baseline.total_unmet_m3_per_day


def test_set_tanker_unavailable(scarce_network):
    result = apply_scenario(scarce_network, _one(SetTankerUnavailable("T-1")))
    assert _tanker(result, "T-1").state is OperationalState.UNAVAILABLE
    assert _tanker(result, "T-1").usable_capacity(D("0.5")) == D("0")
    assert _tanker(result, "T-2").state is OperationalState.ONLINE
    assert _tanker(scarce_network, "T-1").state is OperationalState.ONLINE


def test_tanker_capacity_reflects_trips_per_day(scarce_network):
    assert _tanker(scarce_network, "T-1").usable_capacity(D("0.5")) == D("60")


# -- validation ---------------------------------------------------------------


@pytest.mark.parametrize(
    "change",
    [
        ReduceReservoirSupply("GHOST", D("0.5")),
        ReduceTreatmentCapacity("GHOST", D("0.5")),
        ReducePipelineCapacity("GHOST", D("0.5")),
        SetPipelineUnavailable("GHOST"),
        SetTankerUnavailable("GHOST"),
        ChangeZoneDemand("GHOST", D("1.5")),
        ChangeFacilityDemand("GHOST", D("1.5")),
    ],
)
def test_unknown_target_is_rejected(scarce_network, change):
    with pytest.raises(ScenarioError, match="GHOST"):
        apply_scenario(scarce_network, _one(change))


def test_zone_change_aimed_at_a_facility_is_rejected(scarce_network):
    with pytest.raises(ScenarioError, match="is a facility, not a zone"):
        apply_scenario(
            scarce_network, _one(ChangeZoneDemand("F-HOSP", D("1.5")))
        )


def test_facility_change_aimed_at_a_zone_is_rejected(scarce_network):
    with pytest.raises(ScenarioError, match="is a zone, not a facility"):
        apply_scenario(
            scarce_network, _one(ChangeFacilityDemand("Z-BIG", D("1.5")))
        )


def test_reservoir_change_aimed_at_a_pipeline_is_rejected(scarce_network):
    with pytest.raises(ScenarioError, match="no reservoir with code"):
        apply_scenario(
            scarce_network, _one(ReduceReservoirSupply("L-P1-BIG", D("0.5")))
        )


@pytest.mark.parametrize("fraction", ["-0.1", "1.1", "2"])
@pytest.mark.parametrize(
    "factory",
    [ReduceReservoirSupply, ReduceTreatmentCapacity, ReducePipelineCapacity],
)
def test_out_of_range_fraction_is_rejected(factory, fraction):
    with pytest.raises(ValueError, match=r"fraction must be in \[0, 1\]"):
        factory("X", D(fraction))


@pytest.mark.parametrize("factory", [ChangeZoneDemand, ChangeFacilityDemand])
def test_negative_demand_factor_is_rejected(factory):
    with pytest.raises(ValueError, match="factor must be non-negative"):
        factory("X", D("-0.5"))


@pytest.mark.parametrize("factory", [ChangeZoneDemand, ChangeFacilityDemand])
def test_zero_demand_factor_is_allowed(scarce_network, factory):
    """Demand falling to zero is a legitimate scenario, not an error."""
    code = "Z-BIG" if factory is ChangeZoneDemand else "F-HOSP"
    result = apply_scenario(scarce_network, _one(factory(code, D("0"))))
    assert _demand(result, code).demand_m3_per_day == D("0")
    assert _demand(result, code).minimum_demand_m3_per_day == D("0")


@pytest.mark.parametrize("code", ["", "   "])
def test_empty_target_code_is_rejected(code):
    with pytest.raises(ValueError, match="target_code must be"):
        SetPipelineUnavailable(code)


@pytest.mark.parametrize("name", ["", "   "])
def test_empty_scenario_name_is_rejected(name):
    with pytest.raises(ScenarioError, match="name must be"):
        Scenario(name=name)


# -- immutability -------------------------------------------------------------


def test_original_state_is_never_mutated(scarce_network):
    before = copy.deepcopy(scarce_network)
    scenario = Scenario(
        name="everything",
        changes=(
            ReduceReservoirSupply("R1", D("0.5")),
            ReduceTreatmentCapacity("P1", D("0.5")),
            ReducePipelineCapacity("L-P1-BIG", D("0.5")),
            SetPipelineUnavailable("L-P1-HOSP"),
            ChangeZoneDemand("Z-BIG", D("2")),
            ChangeFacilityDemand("F-HOSP", D("0.5")),
            SetTankerUnavailable("T-1"),
        ),
    )
    apply_scenario(scarce_network, scenario)
    assert scarce_network == before


def test_result_is_a_distinct_object(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReduceReservoirSupply("R1", D("0.5")))
    )
    assert result is not scarce_network
    assert result != scarce_network


def test_untouched_entities_are_carried_over_unchanged(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReduceReservoirSupply("R1", D("0.5")))
    )
    assert result.transits == scarce_network.transits
    assert result.demands == scarce_network.demands
    assert result.links == scarce_network.links
    assert result.tankers == scarce_network.tankers


def test_baseline_allocation_is_unaffected_by_a_scenario(scarce_network):
    baseline = allocate(scarce_network, StrategyName.BALANCED)
    apply_scenario(scarce_network, _one(ReduceReservoirSupply("R1", D("0.9"))))
    assert allocate(scarce_network, StrategyName.BALANCED) == baseline


def test_empty_scenario_is_a_faithful_copy(scarce_network):
    result = apply_scenario(scarce_network, Scenario(name="noop"))
    assert result == scarce_network
    assert result is not scarce_network


# -- composition and determinism ---------------------------------------------


def test_multiple_changes_apply_together(scarce_network):
    scenario = Scenario(
        name="drought-and-break",
        description="Reservoir drawdown with a failed hospital main",
        changes=(
            ReduceReservoirSupply("R1", D("0.4")),
            SetPipelineUnavailable("L-P1-HOSP"),
            ChangeZoneDemand("Z-BIG", D("1.2")),
            SetTankerUnavailable("T-2"),
        ),
    )
    result = apply_scenario(scarce_network, scenario)

    assert _source(result, "R1").available_m3_per_day == D("600")
    assert _link(result, "L-P1-HOSP").state is OperationalState.UNAVAILABLE
    assert _demand(result, "Z-BIG").demand_m3_per_day == D("600")
    assert _tanker(result, "T-2").state is OperationalState.UNAVAILABLE
    assert _tanker(result, "T-1").state is OperationalState.ONLINE


def test_repeated_changes_on_one_entity_compose(scarce_network):
    scenario = Scenario(
        name="two-cuts",
        changes=(
            ReducePipelineCapacity("L-P1-BIG", D("0.5")),
            ReducePipelineCapacity("L-P1-BIG", D("0.5")),
        ),
    )
    result = apply_scenario(scarce_network, scenario)
    assert _link(result, "L-P1-BIG").capacity_m3_per_day == D("500")


def test_scenario_is_deterministic(scarce_network):
    scenario = Scenario(
        name="combo",
        changes=(
            ReduceReservoirSupply("R1", D("0.3")),
            ChangeFacilityDemand("F-HOSP", D("1.4")),
            SetPipelineUnavailable("L-P1-SMALL"),
        ),
    )
    first = apply_scenario(scarce_network, scenario)
    for _ in range(4):
        assert apply_scenario(scarce_network, scenario) == first


def test_entity_order_is_preserved(scarce_network):
    result = apply_scenario(
        scarce_network, _one(ReducePipelineCapacity("L-P1-BIG", D("0.5")))
    )
    assert [item.code for item in result.links] == [
        item.code for item in scarce_network.links
    ]
    assert [d.code for d in result.demands] == [
        d.code for d in scarce_network.demands
    ]


def test_scenario_output_is_a_valid_allocation_input(scarce_network):
    scenario = Scenario(
        name="stress",
        changes=(
            ReduceReservoirSupply("R1", D("0.5")),
            ChangeZoneDemand("Z-SMALL", D("1.5")),
        ),
    )
    result = apply_scenario(scarce_network, scenario)
    for strategy in StrategyName:
        allocation = allocate(result, strategy)
        assert allocation.total_withdrawn_m3_per_day <= D("500") + TOLERANCE
        for item in allocation.allocations:
            assert 0 <= item.supplied_m3_per_day <= item.demand_m3_per_day


def test_apply_scenarios_shares_one_baseline(scarce_network):
    scenarios = [
        Scenario(name="a", changes=(ReduceReservoirSupply("R1", D("0.5")),)),
        Scenario(name="b", changes=(SetPipelineUnavailable("L-P1-HOSP"),)),
    ]
    first, second = apply_scenarios(scarce_network, scenarios)

    # Each scenario derives from the untouched baseline, not from each other.
    assert _source(first, "R1").available_m3_per_day == D("500")
    assert _link(first, "L-P1-HOSP").state is OperationalState.ONLINE
    assert _source(second, "R1").available_m3_per_day == D("1000")
    assert _link(second, "L-P1-HOSP").state is OperationalState.UNAVAILABLE
    assert scarce_network == build_network("1000")


def test_scenario_describes_its_changes():
    scenario = Scenario(
        name="drought",
        changes=(
            ReduceReservoirSupply("R1", D("0.4")),
            SetTankerUnavailable("T-1"),
        ),
    )
    described = scenario.describe()
    assert len(described) == 2
    assert "R1" in described[0]
    assert "T-1" in described[1]


def test_scenario_makes_a_strategy_trade_off_visible(scarce_network):
    """A failed hospital main should change the comparison between strategies."""
    scenario = Scenario(
        name="hospital-main-failure",
        changes=(SetPipelineUnavailable("L-P1-HOSP"),),
    )
    disrupted = apply_scenario(scarce_network, scenario)

    baseline = allocate(scarce_network, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST)
    after = allocate(disrupted, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST)

    assert baseline.critical_facility_coverage == D("1")
    assert after.critical_facility_coverage == D("0")
    # Water that can no longer reach the hospital is available to the zones.
    assert after.by_code("Z-SMALL").supplied_m3_per_day > (
        baseline.by_code("Z-SMALL").supplied_m3_per_day
    )
