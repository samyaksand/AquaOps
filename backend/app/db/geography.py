"""Reads node geometry out of PostGIS for presentation purposes.

Geography is deliberately absent from the allocation domain: the engine routes
water over a graph and never needs to know where anything physically is. This
module exists only so a client can draw the network, and it reads the geometry
columns directly rather than routing them through the domain value objects.
"""

from __future__ import annotations

from dataclasses import dataclass

from geoalchemy2 import Geometry
from sqlalchemy import cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import NetworkNode, Tanker

_POINT = Geometry(geometry_type="POINT", srid=4326)


@dataclass(frozen=True)
class Position:
    """A WGS84 point, as degrees."""

    longitude: float
    latitude: float


async def load_node_positions(session: AsyncSession) -> dict[str, Position]:
    """Return the location of every network node, keyed by node code."""
    geometry = cast(NetworkNode.location, _POINT)
    rows = (
        await session.execute(
            select(
                NetworkNode.code,
                func.ST_X(geometry),
                func.ST_Y(geometry),
            )
        )
    ).all()
    return {
        code: Position(longitude=float(lon), latitude=float(lat))
        for code, lon, lat in rows
        if lon is not None and lat is not None
    }


async def load_tanker_positions(session: AsyncSession) -> dict[str, Position]:
    """Return the current location of each tanker that has one."""
    geometry = cast(Tanker.current_location, _POINT)
    rows = (
        await session.execute(
            select(
                Tanker.code,
                func.ST_X(geometry),
                func.ST_Y(geometry),
            ).where(Tanker.current_location.is_not(None))
        )
    ).all()
    return {
        code: Position(longitude=float(lon), latitude=float(lat))
        for code, lon, lat in rows
        if lon is not None and lat is not None
    }
