"""Network state endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentNetwork
from app.db.geography import load_node_positions, load_tanker_positions
from app.db.session import get_db
from app.schemas.geography import GeographyOut
from app.schemas.network import NetworkStateOut

router = APIRouter(prefix="/network", tags=["network"])


@router.get("", response_model=NetworkStateOut, summary="Current network state")
async def read_network(state: CurrentNetwork) -> NetworkStateOut:
    """Return the current simulated water network."""
    return NetworkStateOut.from_domain(state)


@router.get(
    "/geography",
    response_model=GeographyOut,
    summary="Entity positions for drawing the network",
)
async def read_geography(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> GeographyOut:
    """Return node and tanker coordinates.

    Presentation data only; allocation never consults it.
    """
    return GeographyOut.from_domain(
        nodes=await load_node_positions(session),
        tankers=await load_tanker_positions(session),
    )
