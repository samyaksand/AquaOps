"""Decision Analysis: multi-objective candidate generation and Pareto
filtering over the existing allocation engine.

Pure, like ``domain/allocation`` and ``domain/scenario`` — no FastAPI, DB, or
I/O. It never computes allocations itself; it runs the real engine several
times under different ``Balanced`` strategy weights and scores each result
on five objectives, then partitions the set by Pareto dominance. It does not
replace, duplicate, or modify the allocation engine, and it never declares
one candidate "best" — only which are non-dominated.
"""

from app.domain.decision.analysis import DecisionAnalysis, analyze
from app.domain.decision.candidates import Candidate, generate_candidates
from app.domain.decision.objectives import ObjectiveScores, score_objectives
from app.domain.decision.pareto import ParetoResult, dominates, pareto_filter

__all__ = [
    "Candidate",
    "DecisionAnalysis",
    "ObjectiveScores",
    "ParetoResult",
    "analyze",
    "dominates",
    "generate_candidates",
    "pareto_filter",
    "score_objectives",
]
