"""Projects persisted rows onto the allocation domain's value objects.

This adapter is the only place that knows about both SQLAlchemy and the
allocation domain, which keeps the domain itself free of persistence concerns.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.allocation.state import (
    DemandKind,
    DemandPoint,
    Link,
    NetworkState,
    OperationalState,
    SupplySource,
    TankerUnit,
    TransitNode,
)
from app.models import (
    CriticalFacility,
    DemandZone,
    NetworkNode,
    Pipeline,
    Reservoir,
    Tanker,
    TreatmentPlant,
)
from app.models.enums import AssetStatus, PriorityLevel, TankerStatus

ZERO = Decimal("0")

_STATUS_MAP = {
    AssetStatus.OPERATIONAL: OperationalState.ONLINE,
    AssetStatus.DEGRADED: OperationalState.DERATED,
    AssetStatus.OFFLINE: OperationalState.UNAVAILABLE,
    AssetStatus.MAINTENANCE: OperationalState.UNAVAILABLE,
}

_PRIORITY_RANK = {
    PriorityLevel.CRITICAL: 0,
    PriorityLevel.HIGH: 1,
    PriorityLevel.MEDIUM: 2,
    PriorityLevel.LOW: 3,
}

# A tanker in transit or being serviced is not available for dispatch.
_TANKER_UNAVAILABLE = {TankerStatus.MAINTENANCE}


def operational_state(status: AssetStatus) -> OperationalState:
    return _STATUS_MAP[status]


def priority_rank(priority: PriorityLevel) -> int:
    return _PRIORITY_RANK[priority]


def tanker_state(status: TankerStatus) -> OperationalState:
    """Whether a tanker is available for dispatch."""
    if status in _TANKER_UNAVAILABLE:
        return OperationalState.UNAVAILABLE
    return OperationalState.ONLINE


def releasable_supply(reservoir: Reservoir) -> Decimal:
    """Daily volume a reservoir can release: withdrawal rate vs. live storage."""
    live_storage = reservoir.current_volume_m3 - reservoir.dead_storage_m3
    available = min(reservoir.max_withdrawal_m3_per_day, live_storage)
    return available if available > ZERO else ZERO


async def load_network_state(session: AsyncSession) -> NetworkState:
    """Read the current network from the database as a domain snapshot."""
    reservoirs = (await session.execute(select(Reservoir))).scalars().all()
    plants = (await session.execute(select(TreatmentPlant))).scalars().all()
    zones = (await session.execute(select(DemandZone))).scalars().all()
    facilities = (await session.execute(select(CriticalFacility))).scalars().all()
    pipelines = (await session.execute(select(Pipeline))).scalars().all()
    fleet = (await session.execute(select(Tanker))).scalars().all()

    node_codes = dict(
        (await session.execute(select(NetworkNode.id, NetworkNode.code))).all()
    )

    sources = tuple(
        SupplySource(
            code=reservoir.code,
            name=reservoir.name,
            available_m3_per_day=releasable_supply(reservoir),
            state=operational_state(reservoir.status),
        )
        for reservoir in sorted(reservoirs, key=lambda item: item.code)
    )

    transits = tuple(
        TransitNode(
            code=plant.code,
            name=plant.name,
            capacity_m3_per_day=plant.capacity_m3_per_day,
            recovery_ratio=plant.recovery_ratio,
            state=operational_state(plant.status),
        )
        for plant in sorted(plants, key=lambda item: item.code)
    )

    demands = tuple(
        DemandPoint(
            code=zone.code,
            name=zone.name,
            kind=DemandKind.ZONE,
            demand_m3_per_day=zone.demand_m3_per_day,
            minimum_demand_m3_per_day=zone.minimum_demand_m3_per_day,
            priority_rank=priority_rank(zone.priority),
            population=zone.population,
            reserve_m3=zone.stored_volume_m3,
        )
        for zone in sorted(zones, key=lambda item: item.code)
    ) + tuple(
        DemandPoint(
            code=facility.code,
            name=facility.name,
            kind=DemandKind.FACILITY,
            demand_m3_per_day=facility.demand_m3_per_day,
            minimum_demand_m3_per_day=facility.minimum_demand_m3_per_day,
            priority_rank=priority_rank(facility.priority),
            population=facility.service_population,
            reserve_m3=facility.backup_storage_m3,
        )
        for facility in sorted(facilities, key=lambda item: item.code)
    )

    links = tuple(
        Link(
            code=pipeline.code,
            source_code=node_codes[pipeline.source_node_id],
            target_code=node_codes[pipeline.target_node_id],
            capacity_m3_per_day=pipeline.capacity_m3_per_day,
            loss_ratio=pipeline.loss_ratio,
            state=operational_state(pipeline.status),
        )
        for pipeline in sorted(pipelines, key=lambda item: item.code)
    )

    tankers = tuple(
        TankerUnit(
            code=tanker.code,
            # The Tanker table has no display name; its code is the label.
            name=tanker.code,
            capacity_m3=tanker.capacity_m3,
            trips_per_day=tanker.trips_per_day,
            state=tanker_state(tanker.status),
        )
        for tanker in sorted(fleet, key=lambda item: item.code)
    )

    return NetworkState(
        sources=sources,
        transits=transits,
        demands=demands,
        links=links,
        tankers=tankers,
    )
