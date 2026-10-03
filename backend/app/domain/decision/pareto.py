"""Pareto dominance filtering over a set of candidate objective scores.

Pure set logic: given several candidates each scored on the same objectives
(all oriented so higher is better, per ``objectives.py``), find the
non-dominated subset — the actual Pareto frontier the decision-analysis
layer explores. Never picks a "best" candidate; dominance only ever narrows
the set down to those no other candidate strictly improves on.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Generic, TypeVar

from app.domain.decision.objectives import ObjectiveScores

T = TypeVar("T")

# Scores within this tolerance count as equal rather than one strictly
# beating the other — Decimal arithmetic on independently-rounded ratios can
# otherwise produce spurious strict dominance between two candidates that are
# meaningfully tied.
_EPSILON = Decimal("0.0005")


def dominates(a: ObjectiveScores, b: ObjectiveScores) -> bool:
    """Whether ``a`` Pareto-dominates ``b``: at least as good on every
    objective, and strictly better on at least one."""
    at_least_as_good = True
    strictly_better_somewhere = False

    for name in a.names:
        va, vb = a.value(name), b.value(name)
        if va < vb - _EPSILON:
            at_least_as_good = False
            break
        if va > vb + _EPSILON:
            strictly_better_somewhere = True

    return at_least_as_good and strictly_better_somewhere


@dataclass(frozen=True)
class ParetoResult(Generic[T]):
    """A candidate set partitioned into the Pareto frontier and the rest."""

    frontier: tuple[T, ...]
    dominated: tuple[T, ...]

    @property
    def all_candidates(self) -> tuple[T, ...]:
        return (*self.frontier, *self.dominated)


def pareto_filter(
    candidates: list[T], objectives_of: "callable[[T], ObjectiveScores]"
) -> ParetoResult[T]:
    """Partition ``candidates`` into non-dominated (frontier) and dominated.

    O(n^2) pairwise comparison, which is fine at the scale Decision Analysis
    generates candidates at (tens, not thousands) and keeps the logic
    auditable rather than reaching for a sweep-line optimization.
    """
    scored = [(c, objectives_of(c)) for c in candidates]

    frontier: list[T] = []
    dominated: list[T] = []

    for candidate, score in scored:
        is_dominated = any(
            dominates(other_score, score)
            for other_c, other_score in scored
            if other_c is not candidate
        )
        (dominated if is_dominated else frontier).append(candidate)

    return ParetoResult(frontier=tuple(frontier), dominated=tuple(dominated))
