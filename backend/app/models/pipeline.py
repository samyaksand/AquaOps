"""Pipelines: directed capacity-bearing edges between network nodes."""

from __future__ import annotations

from decimal import Decimal

from geoalchemy2 import Geography
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import AssetStatus
from app.models.network import NetworkNode


class Pipeline(Base, TimestampMixin):
    """A directed conduit carrying water from one network node to another."""

    __tablename__ = "pipeline"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)

    source_node_id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_node_id: Mapped[int] = mapped_column(
        ForeignKey("network_node.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    capacity_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False
    )
    current_flow_m3_per_day: Mapped[Decimal] = mapped_column(
        Numeric(14, 3), nullable=False, default=Decimal("0")
    )
    loss_ratio: Mapped[Decimal] = mapped_column(
        Numeric(5, 4), nullable=False, default=Decimal("0")
    )
    length_m: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    diameter_mm: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))
    bidirectional: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    status: Mapped[AssetStatus] = mapped_column(
        Enum(AssetStatus, name="asset_status", native_enum=True),
        nullable=False,
        default=AssetStatus.OPERATIONAL,
        index=True,
    )
    route: Mapped[str | None] = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False)
    )

    source_node: Mapped[NetworkNode] = relationship(
        "NetworkNode",
        foreign_keys=[source_node_id],
        back_populates="outgoing_pipelines",
    )
    target_node: Mapped[NetworkNode] = relationship(
        "NetworkNode",
        foreign_keys=[target_node_id],
        back_populates="incoming_pipelines",
    )

    __table_args__ = (
        Index("ix_pipeline_route", "route", postgresql_using="gist"),
        UniqueConstraint("source_node_id", "target_node_id", name="unique_edge"),
        CheckConstraint(
            "source_node_id <> target_node_id", name="no_self_loop"
        ),
        CheckConstraint("capacity_m3_per_day > 0", name="capacity_positive"),
        CheckConstraint(
            "current_flow_m3_per_day >= 0 "
            "AND current_flow_m3_per_day <= capacity_m3_per_day",
            name="flow_within_capacity",
        ),
        CheckConstraint(
            "loss_ratio >= 0 AND loss_ratio < 1", name="loss_ratio_fraction"
        ),
        CheckConstraint("length_m IS NULL OR length_m > 0", name="length_positive"),
        CheckConstraint(
            "diameter_mm IS NULL OR diameter_mm > 0", name="diameter_positive"
        ),
    )
