"""Strategy behaviour: each one must express a different, computed trade-off."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.allocation import (
    AllocationEngine,
    Balanced,
    CriticalInfrastructureFirst,
    DemandContext,
    EfficiencyFirst,
    PopulationFirst,
    StrategyName,
    allocate,
    compare_strategies,
    default_strategies,
    get_strategy,
)

from .conftest import build_network

D = Decimal
TOLERANCE = D("0.000001")
ALL_STRATEGIES = list(StrategyName)


def _order(state, strategy) -> list[str]:
    """The order a strategy would consider demand points in."""
    engine = AllocationEngine()
    routes = engine._discover_routes(state)
    contexts = engine._build_contexts(state, routes)
    return [
        point.code
        for point in engine._ordered_demands(state.demands, strategy, contexts)
    ]


# -- registry ---------------------------------------------------------------


def test_all_four_strategies_are_registered():
    strategies = default_strategies()
    assert set(strategies) == {
        StrategyName.POPULATION_FIRST,
        StrategyName.CRITICAL_INFRASTRUCTURE_FIRST,
        StrategyName.EFFICIENCY_FIRST,
        StrategyName.BALANCED,
    }


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_strategy_is_resolvable_by_name_and_value(strategy):
    assert get_strategy(strategy).name is strategy
    assert get_strategy(strategy.value).name is strategy


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_result_records_the_strategy_used(scarce_network, strategy):
    assert allocate(scarce_network, strategy).strategy == strategy.value


# -- ordering ---------------------------------------------------------------


def test_population_first_orders_by_population(scarce_network):
    assert _order(scarce_network, PopulationFirst()) == [
        "Z-BIG",
        "F-HOSP",
        "Z-SMALL",
    ]


def test_critical_infrastructure_first_orders_by_priority(scarce_network):
    assert _order(scarce_network, CriticalInfrastructureFirst()) == [
        "F-HOSP",
        "Z-BIG",
        "Z-SMALL",
    ]


def test_efficiency_first_orders_by_route_efficiency(scarce_network):
    assert _order(scarce_network, EfficiencyFirst()) == [
        "Z-SMALL",
        "F-HOSP",
        "Z-BIG",
    ]


def test_balanced_blends_its_inputs(scarce_network):
    """Shifting the weights must shift the ordering toward that component."""
    population_heavy = Balanced(
        criticality_weight=D("0"),
        population_weight=D("1"),
        efficiency_weight=D("0"),
    )
    criticality_heavy = Balanced(
        criticality_weight=D("1"),
        population_weight=D("0"),
        efficiency_weight=D("0"),
    )
    efficiency_heavy = Balanced(
        criticality_weight=D("0"),
        population_weight=D("0"),
        efficiency_weight=D("1"),
    )

    assert _order(scarce_network, population_heavy) == _order(
        scarce_network, PopulationFirst()
    )
    assert _order(scarce_network, criticality_heavy)[0] == "F-HOSP"
    assert _order(scarce_network, efficiency_heavy) == _order(
        scarce_network, EfficiencyFirst()
    )


def test_balanced_scores_are_bounded_and_computed(scarce_network):
    strategy = Balanced()
    context = DemandContext(
        best_efficiency=D("0.9"), max_population=100_000, max_demand_m3_per_day=D("500")
    )
    for point in scarce_network.demands:
        score = strategy.score(point, context)
        assert D(0) <= score <= D(1)

    hospital = next(p for p in scarce_network.demands if p.code == "F-HOSP")
    small = next(p for p in scarce_network.demands if p.code == "Z-SMALL")
    # The hospital is both more critical and more populous than Z-SMALL.
    assert strategy.score(hospital, context) > strategy.score(small, context)


def test_balanced_rejects_degenerate_weights():
    with pytest.raises(ValueError):
        Balanced(
            criticality_weight=D("0"),
            population_weight=D("0"),
            efficiency_weight=D("0"),
        )
    with pytest.raises(ValueError):
        Balanced(criticality_weight=D("-1"))


# -- outcomes under scarcity -------------------------------------------------


def test_population_first_protects_the_largest_zone(severe_network):
    """With supply below total minimums, people win and the hospital does not."""
    result = allocate(severe_network, StrategyName.POPULATION_FIRST)
    assert result.by_code("Z-BIG").supplied_m3_per_day == D("100")
    assert result.by_code("Z-BIG").meets_minimum
    assert not result.by_code("F-HOSP").meets_minimum
    assert result.population_served == 100_000
    assert result.critical_facility_coverage == D(0)


def test_critical_infrastructure_first_protects_the_hospital(severe_network):
    """The mirror image: full facility coverage, zones left short."""
    result = allocate(severe_network, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST)
    assert result.by_code("F-HOSP").supplied_m3_per_day == D("100")
    assert result.by_code("F-HOSP").meets_minimum
    assert not result.by_code("Z-BIG").meets_minimum
    assert result.critical_facility_coverage == D(1)
    assert result.population_served == 0


def test_the_two_priorities_genuinely_conflict(severe_network):
    """The trade-off must be visible, not incidental."""
    population = allocate(severe_network, StrategyName.POPULATION_FIRST)
    critical = allocate(
        severe_network, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST
    )

    assert population.population_served > critical.population_served
    assert critical.critical_facility_coverage > (
        population.critical_facility_coverage
    )


def test_efficiency_first_wastes_the_least_water(scarce_network):
    efficient = allocate(scarce_network, StrategyName.EFFICIENCY_FIRST)
    for other in (
        StrategyName.POPULATION_FIRST,
        StrategyName.CRITICAL_INFRASTRUCTURE_FIRST,
        StrategyName.BALANCED,
    ):
        assert efficient.delivery_efficiency >= allocate(
            scarce_network, other
        ).delivery_efficiency

    # It also delivers the most water overall from the same supply.
    assert efficient.total_supplied_m3_per_day >= allocate(
        scarce_network, StrategyName.POPULATION_FIRST
    ).total_supplied_m3_per_day


def test_efficiency_first_favours_the_lossless_route(scarce_network):
    result = allocate(scarce_network, StrategyName.EFFICIENCY_FIRST)
    # Z-SMALL sits on the only lossless route, so it is filled completely
    # while the lossy Z-BIG route absorbs whatever is left.
    assert result.by_code("Z-SMALL").fully_supplied
    assert not result.by_code("Z-BIG").fully_supplied


def test_strategies_produce_differing_outcomes(scarce_network):
    """Different priorities must yield different computed allocations."""
    profiles = {
        result.strategy: tuple(
            (a.code, a.supplied_m3_per_day) for a in result.allocations
        )
        for result in compare_strategies(scarce_network)
    }
    assert len(set(profiles.values())) > 1


def test_compare_returns_one_result_per_strategy(scarce_network):
    results = compare_strategies(scarce_network)
    assert len(results) == 4
    assert [r.strategy for r in results] == [s.value for s in ALL_STRATEGIES]


# -- metrics -----------------------------------------------------------------


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_reported_metrics_are_within_range(scarce_network, strategy):
    result = allocate(scarce_network, strategy)
    assert D(0) <= result.demand_coverage_ratio <= D(1)
    assert D(0) <= result.critical_facility_coverage <= D(1)
    assert D(0) <= result.critical_facility_full_coverage <= D(1)
    assert D(0) < result.delivery_efficiency <= D(1)
    assert D(0) <= result.supply_utilization <= D(1)
    assert D(0) <= result.population_weighted_satisfaction <= D(1)
    assert 0 <= result.population_served <= result.total_population


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_summary_exposes_every_required_metric(scarce_network, strategy):
    summary = allocate(scarce_network, strategy).summary()
    for key in (
        "strategy",
        "total_supplied_m3_per_day",
        "total_unmet_m3_per_day",
        "population_served",
        "critical_facility_coverage",
        "delivery_efficiency",
    ):
        assert key in summary
    assert summary["strategy"] == strategy.value


def test_population_metrics_exclude_facilities(scarce_network):
    """Facility service populations must not double-count zone residents."""
    result = allocate(scarce_network, StrategyName.BALANCED)
    # Zones only: 100000 + 1000. The hospital's 50000 already live in a zone.
    assert result.total_population == 101_000


def test_scarce_supply_is_fully_utilised(scarce_network):
    for strategy in ALL_STRATEGIES:
        result = allocate(scarce_network, strategy)
        assert abs(result.supply_utilization - D(1)) < TOLERANCE


# -- determinism -------------------------------------------------------------


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_repeated_runs_are_identical(scarce_network, strategy):
    first = allocate(scarce_network, strategy)
    for _ in range(4):
        assert allocate(scarce_network, strategy) == first


@pytest.mark.parametrize("strategy", ALL_STRATEGIES)
def test_result_is_independent_of_demand_declaration_order(strategy):
    state = build_network("1000")
    shuffled = type(state)(
        sources=state.sources,
        transits=state.transits,
        demands=tuple(reversed(state.demands)),
        links=tuple(reversed(state.links)),
    )
    baseline = {
        a.code: a.supplied_m3_per_day
        for a in allocate(state, strategy).allocations
    }
    reordered = {
        a.code: a.supplied_m3_per_day
        for a in allocate(shuffled, strategy).allocations
    }
    assert baseline == reordered
