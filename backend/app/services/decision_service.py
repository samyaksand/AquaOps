"""Orchestrates Decision Analysis for the API layer.

Mirrors `allocation_service.py`'s shape: synchronous, pure, takes a network
state and returns a domain result. Loading state and applying a scenario
first (if requested) is the caller's concern.
"""

from __future__ import annotations

from app.domain.allocation.engine import EngineConfig
from app.domain.allocation.state import NetworkState
from app.domain.decision.analysis import DecisionAnalysis, analyze


def analyze_network(
    state: NetworkState, config: EngineConfig | None = None
) -> DecisionAnalysis:
    """Run Decision Analysis over `state`."""
    return analyze(state, config)
