"""Adapter tests: persisted rows must project onto a valid domain snapshot.

The database-backed test is skipped when no local PostgreSQL is reachable, so
the domain suite stays runnable on its own.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.db.network_state import (
    load_network_state,
    operational_state,
    priority_rank,
    releasable_supply,
    tanker_state,
)
from app.domain.allocation import OperationalState, StrategyName, compare_strategies
from app.models import Reservoir
from app.models.enums import AssetStatus, PriorityLevel, TankerStatus

D = Decimal


def test_status_maps_maintenance_and_offline_to_unavailable():
    assert operational_state(AssetStatus.OPERATIONAL) is OperationalState.ONLINE
    assert operational_state(AssetStatus.DEGRADED) is OperationalState.DERATED
    assert operational_state(AssetStatus.OFFLINE) is OperationalState.UNAVAILABLE
    assert (
        operational_state(AssetStatus.MAINTENANCE) is OperationalState.UNAVAILABLE
    )


def test_priority_ranks_are_ordered_most_to_least_critical():
    ranks = [
        priority_rank(level)
        for level in (
            PriorityLevel.CRITICAL,
            PriorityLevel.HIGH,
            PriorityLevel.MEDIUM,
            PriorityLevel.LOW,
        )
    ]
    assert ranks == sorted(ranks)
    assert ranks[0] == 0


def test_tanker_in_maintenance_is_unavailable():
    assert tanker_state(TankerStatus.MAINTENANCE) is OperationalState.UNAVAILABLE
    for status in (
        TankerStatus.IDLE,
        TankerStatus.LOADING,
        TankerStatus.EN_ROUTE,
        TankerStatus.UNLOADING,
    ):
        assert tanker_state(status) is OperationalState.ONLINE


def test_releasable_supply_is_limited_by_withdrawal_rate():
    reservoir = Reservoir(
        code="R",
        name="R",
        capacity_m3=D("1000000"),
        current_volume_m3=D("900000"),
        dead_storage_m3=D("100000"),
        max_withdrawal_m3_per_day=D("5000"),
    )
    assert releasable_supply(reservoir) == D("5000")


def test_releasable_supply_is_limited_by_live_storage():
    reservoir = Reservoir(
        code="R",
        name="R",
        capacity_m3=D("1000000"),
        current_volume_m3=D("120000"),
        dead_storage_m3=D("100000"),
        max_withdrawal_m3_per_day=D("50000"),
    )
    assert releasable_supply(reservoir) == D("20000")


def test_releasable_supply_never_goes_negative():
    reservoir = Reservoir(
        code="R",
        name="R",
        capacity_m3=D("1000000"),
        current_volume_m3=D("50000"),
        dead_storage_m3=D("100000"),
        max_withdrawal_m3_per_day=D("50000"),
    )
    assert releasable_supply(reservoir) == D("0")


@pytest.mark.asyncio
async def test_seeded_network_allocates_under_every_strategy():
    """End-to-end over the seeded Rivertown network, if the database is up."""
    from app.db.session import AsyncSessionLocal, engine

    try:
        async with AsyncSessionLocal() as session:
            state = await load_network_state(session)
    except (SQLAlchemyError, OSError) as exc:
        pytest.skip(f"local PostgreSQL unavailable: {exc}")
    finally:
        await engine.dispose()

    if not state.demands:
        pytest.skip("database reachable but not seeded")

    assert len(state.sources) == 3
    assert len(state.transits) == 2
    assert len(state.demands) == 8
    assert len(state.links) == 11
    assert len(state.tankers) == 3
    # TANK-003 is seeded in maintenance.
    unavailable = [
        t.code for t in state.tankers if t.state is OperationalState.UNAVAILABLE
    ]
    assert unavailable == ["TANK-003"]

    results = compare_strategies(state)
    assert len(results) == 4

    for result in results:
        assert result.total_supplied_m3_per_day > 0
        assert result.total_withdrawn_m3_per_day <= (
            result.total_supply_available_m3_per_day + D("0.000001")
        )
        for allocation in result.allocations:
            assert 0 <= allocation.supplied_m3_per_day <= (
                allocation.demand_m3_per_day
            )

    profiles = {
        tuple((a.code, a.supplied_m3_per_day) for a in r.allocations)
        for r in results
    }
    assert len(profiles) > 1, "strategies must differ on the seeded network"
