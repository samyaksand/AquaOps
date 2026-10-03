"""Deterministic candidate generation and full Decision Analysis."""

from __future__ import annotations

from decimal import Decimal

from app.domain.allocation import (
    DemandKind,
    DemandPoint,
    Link,
    NetworkState,
    SupplySource,
    TransitNode,
)
from app.domain.decision.analysis import analyze
from app.domain.decision.candidates import generate_candidates

D = Decimal


def build_network_with_many_demands() -> NetworkState:
    """Eight demand points of varying priority/population/efficiency under
    scarce supply — enough spread for some weight combinations to produce a
    result that is simply worse on every objective than another."""
    demands = []
    links = []
    for i in range(8):
        code = f"Z-{i}"
        demands.append(
            DemandPoint(
                code=code,
                name=code,
                kind=DemandKind.FACILITY if i == 0 else DemandKind.ZONE,
                demand_m3_per_day=D("100"),
                minimum_demand_m3_per_day=D("30"),
                priority_rank=0 if i == 0 else (i % 4),
                population=(i + 1) * 5_000,
            )
        )
        links.append(
            Link(
                code=f"L-{i}",
                source_code="P1",
                target_code=code,
                capacity_m3_per_day=D("100"),
                loss_ratio=D(str(round(0.01 * i, 3))),
            )
        )
    return NetworkState(
        sources=(SupplySource(code="R1", name="R1", available_m3_per_day=D("300")),),
        transits=(
            TransitNode(code="P1", name="P1", capacity_m3_per_day=D("10000")),
        ),
        demands=tuple(demands),
        links=(
            Link(
                code="L-R1-P1",
                source_code="R1",
                target_code="P1",
                capacity_m3_per_day=D("10000"),
            ),
            *links,
        ),
    )


def test_generation_is_deterministic(scarce_network):
    first = generate_candidates(scarce_network)
    second = generate_candidates(scarce_network)

    assert len(first) == len(second)
    for a, b in zip(first, second):
        assert a.candidate_id == b.candidate_id
        assert a.objectives == b.objectives
        assert a.result.summary() == b.result.summary()


def test_each_candidate_weight_triple_sums_to_one(scarce_network):
    for candidate in generate_candidates(scarce_network):
        total = (
            candidate.criticality_weight
            + candidate.population_weight
            + candidate.efficiency_weight
        )
        # The even three-way split (1/3 each) is a repeating decimal, so the
        # sum is only exact to within Decimal's default precision.
        assert abs(total - D("1")) < D("0.0000000001")


def test_candidate_ids_are_unique_and_ordered(scarce_network):
    candidates = generate_candidates(scarce_network)
    ids = [c.candidate_id for c in candidates]
    assert len(ids) == len(set(ids))
    assert ids == [f"candidate-{i}" for i in range(len(ids))]


def test_each_candidate_retains_its_full_allocation_result(scarce_network):
    for candidate in generate_candidates(scarce_network):
        assert candidate.result.strategy == "balanced"
        assert len(candidate.result.allocations) > 0


def test_ample_supply_collapses_most_candidates_to_identical_outcomes(ample_network):
    """With no scarcity, every weight combination should fully satisfy every
    demand point — the candidates differ in weights but converge in result."""
    candidates = generate_candidates(ample_network)
    objective_sets = {c.objectives for c in candidates}
    assert len(objective_sets) == 1


# -- analyze(): candidates + Pareto filtering together -----------------------


def test_analysis_frontier_is_subset_of_all_candidates(scarce_network):
    analysis = analyze(scarce_network)
    frontier_ids = {c.candidate_id for c in analysis.frontier}
    all_ids = {c.candidate_id for c in analysis.candidates}
    assert frontier_ids <= all_ids
    assert len(analysis.frontier) + len(analysis.dominated) == len(analysis.candidates)


def test_analysis_never_marks_zero_candidates_as_frontier(scarce_network, ample_network, severe_network):
    for network in (scarce_network, ample_network, severe_network):
        analysis = analyze(network)
        assert len(analysis.frontier) >= 1


def test_ample_supply_frontier_contains_all_tied_candidates(ample_network):
    """When every candidate scores identically, none dominates another, so
    all must be on the frontier — ties are not "dominated"."""
    analysis = analyze(ample_network)
    assert len(analysis.frontier) == len(analysis.candidates)
    assert len(analysis.dominated) == 0


def test_scarce_network_frontier_is_a_valid_nonempty_subset(scarce_network):
    analysis = analyze(scarce_network)
    assert 1 <= len(analysis.frontier) <= len(analysis.candidates)


def test_real_network_scarcity_produces_some_dominated_candidates(scarce_network):
    """The fixture network's 3 demand points are too few for 13 weight
    combinations to reliably produce strict domination (small differences
    tend to trade off rather than one clearly beating another). A network
    with more demand points gives the weight grid more ways to produce a
    result that is simply worse on every objective at once."""
    network = build_network_with_many_demands()
    analysis = analyze(network)
    assert len(analysis.dominated) >= 1
    assert len(analysis.frontier) < len(analysis.candidates)


def test_analysis_is_deterministic(scarce_network):
    first = analyze(scarce_network)
    second = analyze(scarce_network)
    assert first.frontier_ids == second.frontier_ids
    assert [c.candidate_id for c in first.candidates] == [
        c.candidate_id for c in second.candidates
    ]
