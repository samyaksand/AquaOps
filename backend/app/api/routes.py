"""Top-level API router aggregation."""

from fastapi import APIRouter

from app.api import allocation, network, scenarios, websocket

router = APIRouter()


@router.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Basic liveness check endpoint."""
    return {"status": "ok"}


router.include_router(network.router)
router.include_router(allocation.router)
router.include_router(scenarios.router)
router.include_router(websocket.router)
