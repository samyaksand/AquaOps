"""Allocation endpoint."""

from fastapi import APIRouter

from app.api.deps import CurrentNetwork
from app.schemas.allocation import AllocateRequest, AllocationResultOut
from app.services.allocation_service import allocate_network

router = APIRouter(tags=["allocation"])


@router.post(
    "/allocate",
    response_model=AllocationResultOut,
    summary="Allocate the current network",
)
async def allocate(
    request: AllocateRequest, state: CurrentNetwork
) -> AllocationResultOut:
    """Run the allocation engine over the current network state."""
    result = allocate_network(state, request.strategy)
    return AllocationResultOut.from_domain(result)
