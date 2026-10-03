"""Decision Analysis: candidate generation plus Pareto filtering, in one call.

This is the single entry point the service layer uses. It never decides
which candidate is "best" — only which are non-dominated — leaving the
choice to the human operator.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.allocation.engine import EngineConfig
from app.domain.allocation.state import NetworkState
from app.domain.decision.candidates import Candidate, generate_candidates
from app.domain.decision.pareto import pareto_filter


@dataclass(frozen=True)
class DecisionAnalysis:
    """The full candidate set for one network state, partitioned by dominance."""

    candidates: tuple[Candidate, ...]
    frontier_ids: frozenset[str]

    def is_on_frontier(self, candidate_id: str) -> bool:
        return candidate_id in self.frontier_ids

    @property
    def frontier(self) -> tuple[Candidate, ...]:
        return tuple(c for c in self.candidates if self.is_on_frontier(c.candidate_id))

    @property
    def dominated(self) -> tuple[Candidate, ...]:
        return tuple(
            c for c in self.candidates if not self.is_on_frontier(c.candidate_id)
        )


def analyze(
    state: NetworkState, config: EngineConfig | None = None
) -> DecisionAnalysis:
    """Generate the candidate grid for ``state`` and Pareto-filter it."""
    candidates = generate_candidates(state, config)
    result = pareto_filter(list(candidates), objectives_of=lambda c: c.objectives)
    frontier_ids = frozenset(c.candidate_id for c in result.frontier)
    return DecisionAnalysis(candidates=candidates, frontier_ids=frontier_ids)
