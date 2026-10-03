"""Decision Analysis request/response schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.allocation.strategies import StrategyName
from app.domain.decision.analysis import DecisionAnalysis
from app.domain.decision.candidates import Candidate
from app.domain.decision.objectives import ObjectiveScores
from app.schemas.allocation import AllocationResultOut
from app.schemas.scenario import ScenarioIn


class DecisionAnalysisRequest(BaseModel):
    """Optional scenario to analyze instead of the current network."""

    scenario: ScenarioIn | None = Field(
        default=None,
        description="If given, the network this scenario produces is analyzed instead of the live network.",
    )


class ScoreAllocationRequest(BaseModel):
    """Which already-run strategy to score on the same five objectives,
    so a candidate can be compared against it without the frontend
    re-deriving objective arithmetic from a raw allocation result."""

    strategy: StrategyName = Field(default=StrategyName.BALANCED)
    scenario: ScenarioIn | None = Field(
        default=None,
        description="If given, scores the strategy's allocation over the network this scenario produces.",
    )


class ObjectiveScoresOut(BaseModel):
    """All five objectives, each normalized to [0, 1] where higher is better."""

    critical_coverage: float
    population_served: float
    unmet_demand_score: float
    logistics_efficiency: float
    equity: float

    @classmethod
    def from_domain(cls, scores: ObjectiveScores) -> ObjectiveScoresOut:
        return cls(**{k: float(v) for k, v in scores.as_dict().items()})


class CandidateOut(BaseModel):
    """One generated allocation: the weights that produced it, its full
    result, its objective scores, and whether it is Pareto-optimal."""

    candidate_id: str
    criticality_weight: float
    population_weight: float
    efficiency_weight: float
    objectives: ObjectiveScoresOut
    is_pareto_optimal: bool
    allocation: AllocationResultOut

    @classmethod
    def from_domain(
        cls, candidate: Candidate, is_pareto_optimal: bool
    ) -> CandidateOut:
        return cls(
            candidate_id=candidate.candidate_id,
            criticality_weight=float(candidate.criticality_weight),
            population_weight=float(candidate.population_weight),
            efficiency_weight=float(candidate.efficiency_weight),
            objectives=ObjectiveScoresOut.from_domain(candidate.objectives),
            is_pareto_optimal=is_pareto_optimal,
            allocation=AllocationResultOut.from_domain(candidate.result),
        )


class DecisionAnalysisOut(BaseModel):
    """The full candidate set for one network, partitioned by Pareto dominance."""

    candidates: list[CandidateOut]
    frontier_candidate_ids: list[str]

    @classmethod
    def from_domain(cls, analysis: DecisionAnalysis) -> DecisionAnalysisOut:
        return cls(
            candidates=[
                CandidateOut.from_domain(
                    c, is_pareto_optimal=analysis.is_on_frontier(c.candidate_id)
                )
                for c in analysis.candidates
            ],
            frontier_candidate_ids=list(analysis.frontier_ids),
        )
