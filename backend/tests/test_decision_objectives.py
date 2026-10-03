"""Objective score computation from real allocation results."""

from __future__ import annotations

from decimal import Decimal

from app.domain.allocation import StrategyName, allocate
from app.domain.decision.objectives import score_objectives

D = Decimal


def test_ample_supply_scores_near_perfect_on_every_objective(ample_network):
    result = allocate(ample_network, StrategyName.BALANCED)
    scores = score_objectives(result)

    assert scores.critical_coverage == D("1")
    assert scores.population_served == D("1")
    assert scores.unmet_demand_score == D("1")
    assert scores.equity == D("1")
    # Logistics efficiency reflects real transit losses, not demand coverage,
    # so it is not necessarily 1 even with ample supply.
    assert D("0") < scores.logistics_efficiency <= D("1")


def test_scarce_supply_yields_partial_unmet_demand_score(scarce_network):
    result = allocate(scarce_network, StrategyName.BALANCED)
    scores = score_objectives(result)

    assert D("0") < scores.unmet_demand_score < D("1")


def test_severe_shortage_still_prioritizes_critical_coverage(severe_network):
    result = allocate(severe_network, StrategyName.CRITICAL_INFRASTRUCTURE_FIRST)
    scores = score_objectives(result)

    # The hospital's minimum (100) fits within supply (150); critical
    # coverage should be fully met even though others are not.
    assert scores.critical_coverage == D("1")
    assert scores.unmet_demand_score < D("1")


def test_every_objective_is_bounded_in_unit_interval(scarce_network, severe_network, ample_network):
    for network in (scarce_network, severe_network, ample_network):
        for strategy in StrategyName:
            result = allocate(network, strategy)
            scores = score_objectives(result)
            for name, value in scores.as_dict().items():
                assert D("0") <= value <= D("1"), f"{name}={value} out of bounds"


def test_uneven_satisfaction_scores_lower_equity_than_even_satisfaction(scarce_network, ample_network):
    uneven = score_objectives(allocate(scarce_network, StrategyName.POPULATION_FIRST))
    even = score_objectives(allocate(ample_network, StrategyName.POPULATION_FIRST))

    # Ample supply satisfies every point equally (fully); scarce supply with
    # population-biased ordering leaves some points under-served while
    # others are not — equity should register that spread.
    assert even.equity >= uneven.equity


def test_objective_scores_are_deterministic(scarce_network):
    first = score_objectives(allocate(scarce_network, StrategyName.BALANCED))
    second = score_objectives(allocate(scarce_network, StrategyName.BALANCED))
    assert first == second
