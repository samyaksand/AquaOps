"""Deterministic seed data for local development and testing.

Populates a small, internally consistent simulated urban water network
(reservoirs, treatment plants, demand zones, critical facilities, pipelines,
tankers) spanning a fictional city, "Rivertown". Every entity is keyed by a
stable ``code``; rerunning this script is a no-op for anything that already
exists, so it is safe to run repeatedly against the same database.

This module only creates rows for the existing domain model. It does not
implement allocation, scenario, or simulation logic.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from app.db.session import AsyncSessionLocal, engine
from app.models import (
    CriticalFacility,
    DemandZone,
    NetworkNode,
    Pipeline,
    Reservoir,
    Tanker,
    TreatmentPlant,
)
from app.models.enums import (
    AssetStatus,
    FacilityType,
    PriorityLevel,
    TankerStatus,
    WaterQuality,
    ZoneType,
)

SRID = 4326


def _point(lon: float, lat: float) -> WKTElement:
    return WKTElement(f"POINT({lon} {lat})", srid=SRID)


def _box(lon: float, lat: float, half_size: float = 0.01) -> WKTElement:
    """A small square polygon centered on (lon, lat), for demand-zone boundaries."""
    ring = (
        f"{lon - half_size} {lat - half_size}, "
        f"{lon + half_size} {lat - half_size}, "
        f"{lon + half_size} {lat + half_size}, "
        f"{lon - half_size} {lat + half_size}, "
        f"{lon - half_size} {lat - half_size}"
    )
    return WKTElement(f"MULTIPOLYGON((({ring})))", srid=SRID)


@dataclass
class NodeSpec:
    code: str
    model: type[NetworkNode]
    kwargs: dict[str, Any] = field(default_factory=dict)


# Rivertown node layout. Coordinates form a loose grid around a fictional
# city center so pipeline routes are geographically plausible.
RESERVOIRS = [
    NodeSpec(
        "RES-NORTH",
        Reservoir,
        dict(
            name="North Ridge Reservoir",
            location=_point(-97.745, 30.420),
            status=AssetStatus.OPERATIONAL,
            capacity_m3=Decimal("8000000.000"),
            current_volume_m3=Decimal("6200000.000"),
            dead_storage_m3=Decimal("500000.000"),
            max_withdrawal_m3_per_day=Decimal("90000.000"),
            inflow_m3_per_day=Decimal("45000.000"),
            water_quality=WaterQuality.RAW,
        ),
    ),
    NodeSpec(
        "RES-SOUTH",
        Reservoir,
        dict(
            name="South Fork Reservoir",
            location=_point(-97.760, 30.200),
            status=AssetStatus.OPERATIONAL,
            capacity_m3=Decimal("5000000.000"),
            current_volume_m3=Decimal("3100000.000"),
            dead_storage_m3=Decimal("300000.000"),
            max_withdrawal_m3_per_day=Decimal("60000.000"),
            inflow_m3_per_day=Decimal("28000.000"),
            water_quality=WaterQuality.RAW,
        ),
    ),
    NodeSpec(
        "RES-EAST",
        Reservoir,
        dict(
            name="East Basin Reservoir",
            location=_point(-97.650, 30.300),
            status=AssetStatus.DEGRADED,
            capacity_m3=Decimal("3500000.000"),
            current_volume_m3=Decimal("1200000.000"),
            dead_storage_m3=Decimal("250000.000"),
            max_withdrawal_m3_per_day=Decimal("40000.000"),
            inflow_m3_per_day=Decimal("12000.000"),
            water_quality=WaterQuality.RAW,
        ),
    ),
]

TREATMENT_PLANTS = [
    NodeSpec(
        "TP-ALPHA",
        TreatmentPlant,
        dict(
            name="Alpha Treatment Plant",
            location=_point(-97.745, 30.350),
            status=AssetStatus.OPERATIONAL,
            capacity_m3_per_day=Decimal("120000.000"),
            min_throughput_m3_per_day=Decimal("20000.000"),
            current_throughput_m3_per_day=Decimal("85000.000"),
            recovery_ratio=Decimal("0.9500"),
            output_quality=WaterQuality.POTABLE,
        ),
    ),
    NodeSpec(
        "TP-BRAVO",
        TreatmentPlant,
        dict(
            name="Bravo Treatment Plant",
            location=_point(-97.700, 30.270),
            status=AssetStatus.OPERATIONAL,
            capacity_m3_per_day=Decimal("70000.000"),
            min_throughput_m3_per_day=Decimal("10000.000"),
            current_throughput_m3_per_day=Decimal("48000.000"),
            recovery_ratio=Decimal("0.9000"),
            output_quality=WaterQuality.POTABLE,
        ),
    ),
]

DEMAND_ZONES = [
    NodeSpec(
        "DZ-DOWNTOWN",
        DemandZone,
        dict(
            name="Downtown",
            location=_point(-97.743, 30.267),
            boundary=_box(-97.743, 30.267),
            status=AssetStatus.OPERATIONAL,
            zone_type=ZoneType.MIXED,
            population=85000,
            priority=PriorityLevel.HIGH,
            demand_m3_per_day=Decimal("42000.000"),
            minimum_demand_m3_per_day=Decimal("25000.000"),
            local_storage_m3=Decimal("8000.000"),
            stored_volume_m3=Decimal("5200.000"),
        ),
    ),
    NodeSpec(
        "DZ-RIVERSIDE",
        DemandZone,
        dict(
            name="Riverside",
            location=_point(-97.730, 30.250),
            boundary=_box(-97.730, 30.250),
            status=AssetStatus.OPERATIONAL,
            zone_type=ZoneType.RESIDENTIAL,
            population=52000,
            priority=PriorityLevel.MEDIUM,
            demand_m3_per_day=Decimal("24000.000"),
            minimum_demand_m3_per_day=Decimal("14000.000"),
            local_storage_m3=Decimal("4000.000"),
            stored_volume_m3=Decimal("2600.000"),
        ),
    ),
    NodeSpec(
        "DZ-INDUSTRIAL-PARK",
        DemandZone,
        dict(
            name="Industrial Park",
            location=_point(-97.680, 30.240),
            boundary=_box(-97.680, 30.240),
            status=AssetStatus.OPERATIONAL,
            zone_type=ZoneType.INDUSTRIAL,
            population=4000,
            priority=PriorityLevel.LOW,
            demand_m3_per_day=Decimal("30000.000"),
            minimum_demand_m3_per_day=Decimal("12000.000"),
            local_storage_m3=Decimal("6000.000"),
            stored_volume_m3=Decimal("3000.000"),
        ),
    ),
    NodeSpec(
        "DZ-SUBURBS",
        DemandZone,
        dict(
            name="Suburbs",
            location=_point(-97.790, 30.300),
            boundary=_box(-97.790, 30.300),
            status=AssetStatus.OPERATIONAL,
            zone_type=ZoneType.RESIDENTIAL,
            population=61000,
            priority=PriorityLevel.MEDIUM,
            demand_m3_per_day=Decimal("27000.000"),
            minimum_demand_m3_per_day=Decimal("16000.000"),
            local_storage_m3=Decimal("5000.000"),
            stored_volume_m3=Decimal("3100.000"),
        ),
    ),
]

# Critical facilities reference a demand zone by code; resolved to an id
# after demand zones are created.
CRITICAL_FACILITIES = [
    NodeSpec(
        "CF-GENHOSP",
        CriticalFacility,
        dict(
            name="Rivertown General Hospital",
            location=_point(-97.742, 30.268),
            status=AssetStatus.OPERATIONAL,
            facility_type=FacilityType.HOSPITAL,
            priority=PriorityLevel.CRITICAL,
            demand_m3_per_day=Decimal("1800.000"),
            minimum_demand_m3_per_day=Decimal("1200.000"),
            backup_storage_m3=Decimal("500.000"),
            service_population=85000,
            _demand_zone_code="DZ-DOWNTOWN",
        ),
    ),
    NodeSpec(
        "CF-STMARY",
        CriticalFacility,
        dict(
            name="St. Mary's Medical Center",
            location=_point(-97.728, 30.251),
            status=AssetStatus.OPERATIONAL,
            facility_type=FacilityType.HOSPITAL,
            priority=PriorityLevel.CRITICAL,
            demand_m3_per_day=Decimal("1200.000"),
            minimum_demand_m3_per_day=Decimal("800.000"),
            backup_storage_m3=Decimal("350.000"),
            service_population=52000,
            _demand_zone_code="DZ-RIVERSIDE",
        ),
    ),
    NodeSpec(
        "CF-LINCOLN-SCHOOL",
        CriticalFacility,
        dict(
            name="Lincoln Elementary School",
            location=_point(-97.792, 30.302),
            status=AssetStatus.OPERATIONAL,
            facility_type=FacilityType.SCHOOL,
            priority=PriorityLevel.HIGH,
            demand_m3_per_day=Decimal("150.000"),
            minimum_demand_m3_per_day=Decimal("80.000"),
            backup_storage_m3=Decimal("20.000"),
            service_population=900,
            _demand_zone_code="DZ-SUBURBS",
        ),
    ),
    NodeSpec(
        "CF-WASHINGTON-SCHOOL",
        CriticalFacility,
        dict(
            name="Washington High School",
            location=_point(-97.744, 30.266),
            status=AssetStatus.OPERATIONAL,
            facility_type=FacilityType.SCHOOL,
            priority=PriorityLevel.HIGH,
            demand_m3_per_day=Decimal("220.000"),
            minimum_demand_m3_per_day=Decimal("120.000"),
            backup_storage_m3=Decimal("25.000"),
            service_population=1500,
            _demand_zone_code="DZ-DOWNTOWN",
        ),
    ),
]

ALL_NODE_SPECS: list[NodeSpec] = (
    RESERVOIRS + TREATMENT_PLANTS + DEMAND_ZONES + CRITICAL_FACILITIES
)


@dataclass
class PipelineSpec:
    code: str
    source_code: str
    target_code: str
    kwargs: dict[str, Any] = field(default_factory=dict)


PIPELINES = [
    PipelineSpec(
        "PIPE-RN-TPA",
        "RES-NORTH",
        "TP-ALPHA",
        dict(
            name="North Ridge to Alpha Trunk",
            capacity_m3_per_day=Decimal("95000.000"),
            current_flow_m3_per_day=Decimal("70000.000"),
            loss_ratio=Decimal("0.0200"),
            length_m=Decimal("8200.00"),
            diameter_mm=Decimal("900.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-RS-TPA",
        "RES-SOUTH",
        "TP-ALPHA",
        dict(
            name="South Fork to Alpha Trunk",
            capacity_m3_per_day=Decimal("55000.000"),
            current_flow_m3_per_day=Decimal("30000.000"),
            loss_ratio=Decimal("0.0300"),
            length_m=Decimal("15400.00"),
            diameter_mm=Decimal("750.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-RE-TPB",
        "RES-EAST",
        "TP-BRAVO",
        dict(
            name="East Basin to Bravo Trunk",
            capacity_m3_per_day=Decimal("38000.000"),
            current_flow_m3_per_day=Decimal("18000.000"),
            loss_ratio=Decimal("0.0400"),
            length_m=Decimal("9800.00"),
            diameter_mm=Decimal("600.00"),
            status=AssetStatus.DEGRADED,
        ),
    ),
    PipelineSpec(
        "PIPE-TPA-DZDT",
        "TP-ALPHA",
        "DZ-DOWNTOWN",
        dict(
            name="Alpha to Downtown Main",
            capacity_m3_per_day=Decimal("48000.000"),
            current_flow_m3_per_day=Decimal("40000.000"),
            loss_ratio=Decimal("0.0150"),
            length_m=Decimal("5200.00"),
            diameter_mm=Decimal("600.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-TPA-DZRS",
        "TP-ALPHA",
        "DZ-RIVERSIDE",
        dict(
            name="Alpha to Riverside Main",
            capacity_m3_per_day=Decimal("28000.000"),
            current_flow_m3_per_day=Decimal("22000.000"),
            loss_ratio=Decimal("0.0200"),
            length_m=Decimal("6700.00"),
            diameter_mm=Decimal("500.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-TPA-CFGH",
        "TP-ALPHA",
        "CF-GENHOSP",
        dict(
            name="Alpha to General Hospital Direct Feed",
            capacity_m3_per_day=Decimal("3000.000"),
            current_flow_m3_per_day=Decimal("1800.000"),
            loss_ratio=Decimal("0.0100"),
            length_m=Decimal("4900.00"),
            diameter_mm=Decimal("250.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-TPB-DZIP",
        "TP-BRAVO",
        "DZ-INDUSTRIAL-PARK",
        dict(
            name="Bravo to Industrial Park Main",
            capacity_m3_per_day=Decimal("32000.000"),
            current_flow_m3_per_day=Decimal("24000.000"),
            loss_ratio=Decimal("0.0250"),
            length_m=Decimal("7100.00"),
            diameter_mm=Decimal("550.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-TPB-DZSB",
        "TP-BRAVO",
        "DZ-SUBURBS",
        dict(
            name="Bravo to Suburbs Main",
            capacity_m3_per_day=Decimal("30000.000"),
            current_flow_m3_per_day=Decimal("21000.000"),
            loss_ratio=Decimal("0.0300"),
            length_m=Decimal("11200.00"),
            diameter_mm=Decimal("500.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-TPB-CFLS",
        "TP-BRAVO",
        "CF-LINCOLN-SCHOOL",
        dict(
            name="Bravo to Lincoln School Feed",
            capacity_m3_per_day=Decimal("500.000"),
            current_flow_m3_per_day=Decimal("150.000"),
            loss_ratio=Decimal("0.0100"),
            length_m=Decimal("13500.00"),
            diameter_mm=Decimal("150.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-DZDT-CFWS",
        "DZ-DOWNTOWN",
        "CF-WASHINGTON-SCHOOL",
        dict(
            name="Downtown Local Feed to Washington School",
            capacity_m3_per_day=Decimal("400.000"),
            current_flow_m3_per_day=Decimal("220.000"),
            loss_ratio=Decimal("0.0050"),
            length_m=Decimal("1200.00"),
            diameter_mm=Decimal("150.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
    PipelineSpec(
        "PIPE-DZRS-CFSM",
        "DZ-RIVERSIDE",
        "CF-STMARY",
        dict(
            name="Riverside Local Feed to St. Mary's",
            capacity_m3_per_day=Decimal("2000.000"),
            current_flow_m3_per_day=Decimal("1200.000"),
            loss_ratio=Decimal("0.0050"),
            length_m=Decimal("900.00"),
            diameter_mm=Decimal("200.00"),
            status=AssetStatus.OPERATIONAL,
        ),
    ),
]


@dataclass
class TankerSpec:
    code: str
    kwargs: dict[str, Any] = field(default_factory=dict)
    home_code: str | None = None
    destination_code: str | None = None


TANKERS = [
    TankerSpec(
        "TANK-001",
        dict(
            capacity_m3=Decimal("20.000"),
            current_load_m3=Decimal("0.000"),
            cargo_quality=None,
            status=TankerStatus.IDLE,
            average_speed_kmh=Decimal("45.00"),
            trips_per_day=3,
            current_location=_point(-97.745, 30.350),
        ),
        home_code="TP-ALPHA",
        destination_code=None,
    ),
    TankerSpec(
        "TANK-002",
        dict(
            capacity_m3=Decimal("25.000"),
            current_load_m3=Decimal("25.000"),
            cargo_quality=WaterQuality.POTABLE,
            status=TankerStatus.EN_ROUTE,
            average_speed_kmh=Decimal("40.00"),
            trips_per_day=2,
            current_location=_point(-97.735, 30.290),
        ),
        home_code="TP-BRAVO",
        destination_code="DZ-SUBURBS",
    ),
    TankerSpec(
        "TANK-003",
        dict(
            capacity_m3=Decimal("18.000"),
            current_load_m3=Decimal("0.000"),
            cargo_quality=None,
            status=TankerStatus.MAINTENANCE,
            average_speed_kmh=Decimal("42.00"),
            trips_per_day=2,
            current_location=_point(-97.700, 30.270),
        ),
        home_code="TP-BRAVO",
        destination_code=None,
    ),
]


async def seed() -> dict[str, int]:
    """Insert any missing seed rows. Safe to call repeatedly."""
    async with AsyncSessionLocal() as session:
        async with session.begin():
            existing_node_codes = set(
                (await session.execute(select(NetworkNode.code))).scalars().all()
            )

            node_ids: dict[str, int] = {}
            for spec in ALL_NODE_SPECS:
                if spec.code in existing_node_codes:
                    continue
                kwargs = dict(spec.kwargs)
                kwargs.pop("_demand_zone_code", None)
                session.add(spec.model(code=spec.code, **kwargs))

            await session.flush()

            # Resolve demand_zone_id for newly created critical facilities now
            # that demand zones have ids.
            all_codes = [spec.code for spec in ALL_NODE_SPECS]
            rows = (
                await session.execute(
                    select(NetworkNode.id, NetworkNode.code).where(
                        NetworkNode.code.in_(all_codes)
                    )
                )
            ).all()
            node_ids = {code: node_id for node_id, code in rows}

            for spec in CRITICAL_FACILITIES:
                if spec.code in existing_node_codes:
                    continue
                zone_code = spec.kwargs.get("_demand_zone_code")
                if zone_code is None:
                    continue
                facility = await session.get(CriticalFacility, node_ids[spec.code])
                facility.demand_zone_id = node_ids[zone_code]

            existing_pipeline_codes = set(
                (await session.execute(select(Pipeline.code))).scalars().all()
            )
            for pspec in PIPELINES:
                if pspec.code in existing_pipeline_codes:
                    continue
                session.add(
                    Pipeline(
                        code=pspec.code,
                        source_node_id=node_ids[pspec.source_code],
                        target_node_id=node_ids[pspec.target_code],
                        **pspec.kwargs,
                    )
                )

            existing_tanker_codes = set(
                (await session.execute(select(Tanker.code))).scalars().all()
            )
            for tspec in TANKERS:
                if tspec.code in existing_tanker_codes:
                    continue
                session.add(
                    Tanker(
                        code=tspec.code,
                        home_node_id=(
                            node_ids[tspec.home_code] if tspec.home_code else None
                        ),
                        destination_node_id=(
                            node_ids[tspec.destination_code]
                            if tspec.destination_code
                            else None
                        ),
                        **tspec.kwargs,
                    )
                )

        counts = {}
        for label, model in (
            ("reservoir", Reservoir),
            ("treatment_plant", TreatmentPlant),
            ("demand_zone", DemandZone),
            ("critical_facility", CriticalFacility),
            ("pipeline", Pipeline),
            ("tanker", Tanker),
            ("network_node", NetworkNode),
        ):
            result = await session.execute(select(model))
            counts[label] = len(result.scalars().all())
        return counts


async def main() -> None:
    counts = await seed()
    for table, count in counts.items():
        print(f"{table}: {count}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
