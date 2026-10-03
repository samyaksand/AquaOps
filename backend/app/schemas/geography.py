"""Geography response schemas.

Kept separate from the network state schema: positions are presentation data
for drawing the network, not part of the allocation contract.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.db.geography import Position


class PositionOut(BaseModel):
    """A WGS84 point in degrees."""

    longitude: float
    latitude: float

    @classmethod
    def from_domain(cls, position: Position) -> PositionOut:
        return cls(
            longitude=position.longitude, latitude=position.latitude
        )


class GeographyOut(BaseModel):
    """Positions for the network, keyed by entity code."""

    nodes: dict[str, PositionOut]
    tankers: dict[str, PositionOut]

    @classmethod
    def from_domain(
        cls,
        nodes: dict[str, Position],
        tankers: dict[str, Position],
    ) -> GeographyOut:
        return cls(
            nodes={
                code: PositionOut.from_domain(value)
                for code, value in nodes.items()
            },
            tankers={
                code: PositionOut.from_domain(value)
                for code, value in tankers.items()
            },
        )
