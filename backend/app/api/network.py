"""Network state endpoints."""

from fastapi import APIRouter

from app.api.deps import CurrentNetwork
from app.schemas.network import NetworkStateOut

router = APIRouter(prefix="/network", tags=["network"])


@router.get("", response_model=NetworkStateOut, summary="Current network state")
async def read_network(state: CurrentNetwork) -> NetworkStateOut:
    """Return the current simulated water network."""
    return NetworkStateOut.from_domain(state)
