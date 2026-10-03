"""Water network nodes: reservoirs, treatment plants, demand zones, facilities.

Nodes use joined-table inheritance from a shared ``network_node`` supertype so
that pipelines can reference any node with real foreign-key integrity and the
future allocation engine can traverse the network as a single graph.
"""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from geoalchemy2 import Geography
from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import (
    AssetStatus,
    FacilityType,
    NodeType,
    PriorityLevel,
    WaterQuality,
    ZoneType,
)

if TYPE_CHECKING:
    from app.models.pipeline import Pipeline


class NetworkNode(Base, TimestampMixin):
    """Supertype for every fixed point in the water distribution network."""

    __tablename__ = "network_node"

    id: Mapped[int] = mapped_column(primary_key=True)
    node_type: Mapped[NodeType] = mapped_column(
        Enum(NodeType, name="node_type", native_enum=True),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    location: Mapped[str] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False),
        nullable=False,
    )
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus, name="asset_status", native_enum=True),
        nullable=False,
        default=AssetStatus.OPERATIONAL,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text)

    outgoing_pipelines: Mapped[list[Pipeline]] = relationship(
        "Pipeline",
        foreign_keys="Pipeline.source_node_id",
        back_populates="source_node",
        cascade="all, delete-orphan",
    )
    incoming_pipelines: Mapped[list[Pipeline]] = relationship(
        "Pipeline",
        foreign_keys="Pipeline.target_node_id",
        back_populates="target_node",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_network_node_location", "location", postgresql_using="gist"),
    )

    __mapper_args__ = {
        "polymorphic_on": node_type,
        "polymorphic_identity": None,
    }


class Reservoir(NetworkNode):
    """Raw-water storage with finite capacity and natural inflow."""

    __tablename__ = "reservoir"

    id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        primary_key=True,
    )
    capacity_m3: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    current_volume_m3: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    dead_storage_m3: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    max_withdrawal_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False
    )
    inflow_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    water_quality: Mapped[WaterQuality] = mapped_column(
        Enum(WaterQuality, name="water_quality", native_enum=True),
        nullable=False,
        default=WaterQuality.RAW,
    )

    __table_args__ = (
        CheckConstraint("capacity_m3 > 0", name="capacity_positive"),
        CheckConstraint(
            "current_volume_m3 >= 0 AND current_volume_m3 <= capacity_m3",
            name="volume_within_capacity",
        ),
        CheckConstraint(
            "dead_storage_m3 >= 0 AND dead_storage_m3 <= capacity_m3",
            name="dead_storage_within_capacity",
        ),
        CheckConstraint(
            "max_withdrawal_m3_per_day >= 0", name="max_withdrawal_non_negative"
        ),
        CheckConstraint("inflow_m3_per_day >= 0", name="inflow_non_negative"),
    )

    __mapper_args__ = {"polymorphic_identity": NodeType.RESERVOIR}


class TreatmentPlant(NetworkNode):
    """Converts raw water into treated/potable water at a bounded rate."""

    __tablename__ = "treatment_plant"

    id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        primary_key=True,
    )
    capacity_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False
    )
    min_throughput_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    current_throughput_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    recovery_ratio: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, default=Decimal("1.0")
    )
    output_quality: Mapped[WaterQuality] = mapped_column(
        Enum(WaterQuality, name="water_quality", native_enum=True),
        nullable=False,
        default=WaterQuality.POTABLE,
    )

    __table_args__ = (
        CheckConstraint("capacity_m3_per_day > 0", name="capacity_positive"),
        CheckConstraint(
            "min_throughput_m3_per_day >= 0 "
            "AND min_throughput_m3_per_day <= capacity_m3_per_day",
            name="min_throughput_within_capacity",
        ),
        CheckConstraint(
            "current_throughput_m3_per_day >= 0 "
            "AND current_throughput_m3_per_day <= capacity_m3_per_day",
            name="throughput_within_capacity",
        ),
        CheckConstraint(
            "recovery_ratio > 0 AND recovery_ratio <= 1",
            name="recovery_ratio_fraction",
        ),
    )

    __mapper_args__ = {"polymorphic_identity": NodeType.TREATMENT_PLANT}


class DemandZone(NetworkNode):
    """A populated service area competing for water allocation."""

    __tablename__ = "demand_zone"

    id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        primary_key=True,
    )
    boundary: Mapped[str | None] = mapped_column(
        Geography(geometry_type="MULTIPOLYGON", srid=4326, spatial_index=False)
    )
    zone_type: Mapped[ZoneType] = mapped_column(
        Enum(ZoneType, name="zone_type", native_enum=True),
        nullable=False,
        default=ZoneType.RESIDENTIAL,
    )
    population: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    priority: Mapped[PriorityLevel] = mapped_column(
        Enum(PriorityLevel, name="priority_level", native_enum=True),
        nullable=False,
        default=PriorityLevel.MEDIUM,
        index=True,
    )
    demand_m3_per_day: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    minimum_demand_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    local_storage_m3: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    stored_volume_m3: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )

    critical_facilities: Mapped[list[CriticalFacility]] = relationship(
        "CriticalFacility",
        back_populates="demand_zone",
        foreign_keys="CriticalFacility.demand_zone_id",
    )

    __table_args__ = (
        Index("ix_demand_zone_boundary", "boundary", postgresql_using="gist"),
        CheckConstraint("population >= 0", name="population_non_negative"),
        CheckConstraint("demand_m3_per_day >= 0", name="demand_non_negative"),
        CheckConstraint(
            "minimum_demand_m3_per_day >= 0 "
            "AND minimum_demand_m3_per_day <= demand_m3_per_day",
            name="minimum_demand_within_demand",
        ),
        CheckConstraint("local_storage_m3 >= 0", name="local_storage_non_negative"),
        CheckConstraint(
            "stored_volume_m3 >= 0 AND stored_volume_m3 <= local_storage_m3",
            name="stored_volume_within_storage",
        ),
    )

    __mapper_args__ = {"polymorphic_identity": NodeType.DEMAND_ZONE}


class CriticalFacility(NetworkNode):
    """Facility whose water supply carries elevated societal consequence."""

    __tablename__ = "critical_facility"

    id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        primary_key=True,
    )
    facility_type: Mapped[FacilityType] = mapped_column(
        Enum(FacilityType, name="facility_type", native_enum=True),
        nullable=False,
        index=True,
    )
    priority: Mapped[PriorityLevel] = mapped_column(
        Enum(PriorityLevel, name="priority_level", native_enum=True),
        nullable=False,
        default=PriorityLevel.CRITICAL,
        index=True,
    )
    demand_m3_per_day: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    minimum_demand_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    backup_storage_m3: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    service_population: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    demand_zone_id: Mapped[int | None] = mapped_column(
        ForeignKey("demand_zone.id", ondelete="SET NULL"),
        index=True,
    )

    demand_zone: Mapped[DemandZone | None] = relationship(
        "DemandZone",
        back_populates="critical_facilities",
        foreign_keys=[demand_zone_id],
    )

    __table_args__ = (
        CheckConstraint("demand_m3_per_day >= 0", name="demand_non_negative"),
        CheckConstraint(
            "minimum_demand_m3_per_day >= 0 "
            "AND minimum_demand_m3_per_day <= demand_m3_per_day",
            name="minimum_demand_within_demand",
        ),
        CheckConstraint("backup_storage_m3 >= 0", name="backup_storage_non_negative"),
        CheckConstraint(
            "service_population >= 0", name="service_population_non_negative"
        ),
    )

    __mapper_args__ = {
        "polymorphic_identity": NodeType.CRITICAL_FACILITY,
        "inherit_condition": id == NetworkNode.id,
    }
