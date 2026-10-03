"""Pareto dominance and filtering: identical, dominated, and non-dominated sets."""

from __future__ import annotations

from decimal import Decimal

from app.domain.decision.objectives import ObjectiveScores
from app.domain.decision.pareto import dominates, pareto_filter

D = Decimal


def scores(
    critical=D("0.5"),
    population=D("0.5"),
    unmet=D("0.5"),
    efficiency=D("0.5"),
    equity=D("0.5"),
) -> ObjectiveScores:
    return ObjectiveScores(
        critical_coverage=critical,
        population_served=population,
        unmet_demand_score=unmet,
        logistics_efficiency=efficiency,
        equity=equity,
    )


# -- dominates() ----------------------------------------------------------------


def test_strictly_better_on_all_objectives_dominates():
    better = scores(D("0.8"), D("0.8"), D("0.8"), D("0.8"), D("0.8"))
    worse = scores(D("0.5"), D("0.5"), D("0.5"), D("0.5"), D("0.5"))
    assert dominates(better, worse)
    assert not dominates(worse, better)


def test_better_on_one_worse_on_another_does_not_dominate():
    a = scores(critical=D("0.9"), population=D("0.3"))
    b = scores(critical=D("0.3"), population=D("0.9"))
    assert not dominates(a, b)
    assert not dominates(b, a)


def test_identical_scores_do_not_dominate_each_other():
    a = scores()
    b = scores()
    assert not dominates(a, b)
    assert not dominates(b, a)


def test_equal_except_one_strictly_better_dominates():
    a = scores(critical=D("0.6"))
    b = scores(critical=D("0.5"))
    assert dominates(a, b)
    assert not dominates(b, a)


def test_within_epsilon_counts_as_tied_not_dominating():
    a = scores(critical=D("0.50001"))
    b = scores(critical=D("0.5"))
    assert not dominates(a, b)


# -- pareto_filter() --------------------------------------------------------


def test_all_identical_candidates_are_all_on_the_frontier():
    candidates = ["a", "b", "c"]
    objective_map = {c: scores() for c in candidates}
    result = pareto_filter(candidates, objectives_of=lambda c: objective_map[c])
    assert set(result.frontier) == {"a", "b", "c"}
    assert result.dominated == ()


def test_single_dominated_candidate_is_excluded():
    objective_map = {
        "best": scores(D("0.9"), D("0.9"), D("0.9"), D("0.9"), D("0.9")),
        "worst": scores(D("0.1"), D("0.1"), D("0.1"), D("0.1"), D("0.1")),
    }
    result = pareto_filter(
        list(objective_map), objectives_of=lambda c: objective_map[c]
    )
    assert result.frontier == ("best",)
    assert result.dominated == ("worst",)


def test_non_dominated_trade_off_set_all_survive():
    objective_map = {
        "critical_focused": scores(critical=D("0.9"), population=D("0.3")),
        "population_focused": scores(critical=D("0.3"), population=D("0.9")),
        "balanced": scores(critical=D("0.6"), population=D("0.6")),
    }
    result = pareto_filter(
        list(objective_map), objectives_of=lambda c: objective_map[c]
    )
    assert set(result.frontier) == set(objective_map)
    assert result.dominated == ()


def test_mixed_set_partitions_correctly():
    objective_map = {
        "dominant": scores(D("0.9"), D("0.9"), D("0.9"), D("0.9"), D("0.9")),
        "tradeoff_a": scores(critical=D("0.2"), population=D("0.95")),
        "clearly_dominated": scores(D("0.1"), D("0.1"), D("0.1"), D("0.1"), D("0.1")),
    }
    result = pareto_filter(
        list(objective_map), objectives_of=lambda c: objective_map[c]
    )
    assert set(result.frontier) == {"dominant", "tradeoff_a"}
    assert result.dominated == ("clearly_dominated",)


def test_empty_candidate_list():
    result = pareto_filter([], objectives_of=lambda c: scores())
    assert result.frontier == ()
    assert result.dominated == ()


def test_single_candidate_is_always_on_the_frontier():
    objective_map = {"only": scores(D("0.1"), D("0.1"), D("0.1"), D("0.1"), D("0.1"))}
    result = pareto_filter(["only"], objectives_of=lambda c: objective_map[c])
    assert result.frontier == ("only",)
