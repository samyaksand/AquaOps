"""Decision Analysis endpoints."""

from fastapi import APIRouter

from app.api.deps import CurrentNetwork
from app.domain.decision.objectives import score_objectives
from app.schemas.decision import (
    DecisionAnalysisOut,
    DecisionAnalysisRequest,
    ObjectiveScoresOut,
    ScoreAllocationRequest,
)
from app.services.allocation_service import allocate_network, apply_scenario_to_network
from app.services.decision_service import analyze_network

router = APIRouter(prefix="/decision", tags=["decision"])


@router.post(
    "/analyze",
    response_model=DecisionAnalysisOut,
    summary="Generate and Pareto-filter candidate allocations",
)
async def analyze(
    request: DecisionAnalysisRequest, state: CurrentNetwork
) -> DecisionAnalysisOut:
    """Analyze the current network, or the network a scenario produces.

    Candidates are real allocations computed by the existing engine under a
    fixed, deterministic grid of strategy weights, then partitioned into
    Pareto-optimal and dominated sets. No candidate is marked "best".
    """
    target = state
    if request.scenario is not None:
        target = apply_scenario_to_network(state, request.scenario.to_domain())

    analysis = analyze_network(target)
    return DecisionAnalysisOut.from_domain(analysis)


@router.post(
    "/score",
    response_model=ObjectiveScoresOut,
    summary="Score an already-known strategy on the same five objectives",
)
async def score(
    request: ScoreAllocationRequest, state: CurrentNetwork
) -> ObjectiveScoresOut:
    """Score one strategy's allocation the same way every candidate is
    scored, so the frontend can compare a selected candidate against the
    current allocation without re-deriving objective arithmetic itself.
    """
    target = state
    if request.scenario is not None:
        target = apply_scenario_to_network(state, request.scenario.to_domain())

    result = allocate_network(target, request.strategy)
    return ObjectiveScoresOut.from_domain(score_objectives(result))
