"""Deterministic candidate generation for Decision Analysis.

A candidate is one real, fully-computed allocation — produced by the actual
allocation engine under the existing ``Balanced`` strategy at one weight
combination — scored on all five objectives. Decision Analysis does not
invent a second optimizer: it samples the one weighted lever the engine
already exposes (criticality / population / efficiency ordering weights),
and lets the real engine's routing and capacity logic produce the outcome.
Varying the ordering changes who is served first when supply is scarce,
which in turn moves all five *measured* objectives — including the two
(unmet demand, equity) that are not themselves ordering weights.

Determinism: the weight grid is a fixed, hardcoded sequence (no randomness),
and the allocation engine is itself pure, so the same network state always
yields the same candidate set in the same order.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.domain.allocation.engine import AllocationEngine, EngineConfig
from app.domain.allocation.results import AllocationResult
from app.domain.allocation.state import NetworkState
from app.domain.allocation.strategies import Balanced
from app.domain.decision.objectives import ObjectiveScores, score_objectives

# A fixed grid over the three weights `Balanced` already exposes, each
# triple summing to 1 so weights stay directly comparable across candidates.
# Includes each weight maxed alone, pairwise splits, and an even split —
# enough spread to produce genuinely different orderings without the grid
# size growing unreadably large.
_WEIGHT_GRID: tuple[tuple[Decimal, Decimal, Decimal], ...] = (
    (Decimal("1.0"), Decimal("0.0"), Decimal("0.0")),  # criticality only
    (Decimal("0.0"), Decimal("1.0"), Decimal("0.0")),  # population only
    (Decimal("0.0"), Decimal("0.0"), Decimal("1.0")),  # efficiency only
    (Decimal("0.6"), Decimal("0.4"), Decimal("0.0")),
    (Decimal("0.4"), Decimal("0.6"), Decimal("0.0")),
    (Decimal("0.6"), Decimal("0.0"), Decimal("0.4")),
    (Decimal("0.4"), Decimal("0.0"), Decimal("0.6")),
    (Decimal("0.0"), Decimal("0.6"), Decimal("0.4")),
    (Decimal("0.0"), Decimal("0.4"), Decimal("0.6")),
    (Decimal("0.4"), Decimal("0.4"), Decimal("0.2")),
    (Decimal("0.2"), Decimal("0.4"), Decimal("0.4")),
    (Decimal("0.4"), Decimal("0.2"), Decimal("0.4")),
    (
        Decimal("1") / Decimal("3"),
        Decimal("1") / Decimal("3"),
        Decimal("1") / Decimal("3"),
    ),
)


@dataclass(frozen=True)
class Candidate:
    """One generated allocation: its weights, the full result, and its scores.

    Retains everything Decision Analysis needs to inspect or re-derive a
    candidate later — the weights that produced it, the complete
    ``AllocationResult`` (so "inspect on map" can show the exact allocation),
    and its five objective scores.
    """

    candidate_id: str
    criticality_weight: Decimal
    population_weight: Decimal
    efficiency_weight: Decimal
    result: AllocationResult
    objectives: ObjectiveScores


def generate_candidates(
    state: NetworkState, config: EngineConfig | None = None
) -> tuple[Candidate, ...]:
    """Run the real engine once per weight combination in the fixed grid.

    Returns candidates in the grid's declared order — deterministic given
    the same ``state``, since neither the grid nor the engine involves
    randomness or wall-clock time.
    """
    engine = AllocationEngine(config)
    candidates: list[Candidate] = []

    for index, (crit, pop, eff) in enumerate(_WEIGHT_GRID):
        strategy = Balanced(
            criticality_weight=crit,
            population_weight=pop,
            efficiency_weight=eff,
        )
        result = engine.allocate(state, strategy)
        candidates.append(
            Candidate(
                candidate_id=f"candidate-{index}",
                criticality_weight=crit,
                population_weight=pop,
                efficiency_weight=eff,
                result=result,
                objectives=score_objectives(result),
            )
        )

    return tuple(candidates)
