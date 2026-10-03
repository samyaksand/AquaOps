"""Tankers: mobile water transport used where pipelines cannot deliver."""

from __future__ import annotations

from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import (
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import TankerStatus, WaterQuality
from app.models.network import NetworkNode


class Tanker(Base, TimestampMixin):
    """A mobile water carrier with finite capacity and travel constraints."""

    __tablename__ = "tanker"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    capacity_m3: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    current_load_m3: Mapped[Decimal] = mapped_column(
        Numeric(10, 3), nullable=False, default=Decimal("0")
    )
    cargo_quality: Mapped[WaterQuality | None] = mapped_column(
        Enum(WaterQuality, name="water_quality", native_enum=True)
    )
    status: Mapped[TankerStatus] = mapped_column(
        Enum(TankerStatus, name="tanker_status", native_enum=True),
        nullable=False,
        default=TankerStatus.IDLE,
        index=True,
    )
    average_speed_kmh: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), nullable=False, default=Decimal("40")
    )
    trips_per_day: Mapped[int] = mapped_column(nullable=False, default=1)
    current_location: Mapped[str | None] = mapped_column(
        Geography(geometry_type="POINT", srid=4326, spatial_index=False)
    )

    home_node_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_node.id", ondelete="SET NULL"),
        index=True,
    )
    destination_node_id: Mapped[int | None] = mapped_column(
        ForeignKey("network_node.id", ondelete="SET NULL"),
        index=True,
    )

    home_node: Mapped[NetworkNode | None] = relationship(
        "NetworkNode", foreign_keys=[home_node_id]
    )
    destination_node: Mapped[NetworkNode | None] = relationship(
        "NetworkNode", foreign_keys=[destination_node_id]
    )

    __table_args__ = (
        Index(
            "ix_tanker_current_location", "current_location", postgresql_using="gist"
        ),
        CheckConstraint("capacity_m3 > 0", name="capacity_positive"),
        CheckConstraint(
            "current_load_m3 >= 0 AND current_load_m3 <= capacity_m3",
            name="load_within_capacity",
        ),
        CheckConstraint("average_speed_kmh > 0", name="speed_positive"),
        CheckConstraint("trips_per_day > 0", name="trips_positive"),
    )
