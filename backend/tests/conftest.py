"""Shared fixtures: hand-built networks with known, hand-checkable arithmetic."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.allocation import (
    DemandKind,
    DemandPoint,
    Link,
    NetworkState,
    OperationalState,
    SupplySource,
    TankerUnit,
    TransitNode,
)

D = Decimal


def zone(
    code: str,
    *,
    demand: str,
    minimum: str,
    population: int,
    rank: int = 2,
) -> DemandPoint:
    return DemandPoint(
        code=code,
        name=code,
        kind=DemandKind.ZONE,
        demand_m3_per_day=D(demand),
        minimum_demand_m3_per_day=D(minimum),
        priority_rank=rank,
        population=population,
    )


def facility(
    code: str,
    *,
    demand: str,
    minimum: str,
    population: int,
    rank: int = 0,
) -> DemandPoint:
    return DemandPoint(
        code=code,
        name=code,
        kind=DemandKind.FACILITY,
        demand_m3_per_day=D(demand),
        minimum_demand_m3_per_day=D(minimum),
        priority_rank=rank,
        population=population,
    )


def link(
    code: str,
    source: str,
    target: str,
    *,
    capacity: str,
    loss: str = "0",
    state: OperationalState = OperationalState.ONLINE,
) -> Link:
    return Link(
        code=code,
        source_code=source,
        target_code=target,
        capacity_m3_per_day=D(capacity),
        loss_ratio=D(loss),
        state=state,
    )


def _plant(code: str, *, capacity: str, recovery: str = "1") -> TransitNode:
    return TransitNode(
        code=code,
        name=code,
        capacity_m3_per_day=D(capacity),
        recovery_ratio=D(recovery),
    )


def _source(code: str, *, available: str) -> SupplySource:
    return SupplySource(code=code, name=code, available_m3_per_day=D(available))


def build_network(supply: str) -> NetworkState:
    """One reservoir, one plant, two zones and a hospital.

    Route efficiencies are distinct by construction so that Efficiency First
    has something to prefer: Z-SMALL 1.00, F-HOSP 0.95, Z-BIG 0.90. Pipeline
    and plant capacities are deliberately generous here so that supply and
    demand are the only binding constraints; capacity binding has its own
    dedicated tests.
    """
    return NetworkState(
        sources=(_source("R1", available=supply),),
        transits=(_plant("P1", capacity="10000", recovery="1"),),
        demands=(
            zone("Z-BIG", demand="500", minimum="100", population=100_000),
            zone("Z-SMALL", demand="500", minimum="100", population=1_000),
            facility("F-HOSP", demand="300", minimum="100", population=50_000),
        ),
        links=(
            link("L-R1-P1", "R1", "P1", capacity="10000"),
            link("L-P1-BIG", "P1", "Z-BIG", capacity="2000", loss="0.1"),
            link("L-P1-SMALL", "P1", "Z-SMALL", capacity="2000", loss="0"),
            link("L-P1-HOSP", "P1", "F-HOSP", capacity="2000", loss="0.05"),
        ),
        tankers=(
            TankerUnit("T-1", "T-1", D("20"), trips_per_day=3),
            TankerUnit("T-2", "T-2", D("25"), trips_per_day=2),
        ),
    )


@pytest.fixture
def scarce_network() -> NetworkState:
    """Supply 1000 against demand 1300: surplus ordering matters."""
    return build_network("1000")


@pytest.fixture
def severe_network() -> NetworkState:
    """Supply 150 against minimums totalling 300: lifeline ordering matters."""
    return build_network("150")


@pytest.fixture
def ample_network() -> NetworkState:
    """Supply far exceeding demand: every strategy should fully satisfy."""
    return build_network("100000")
