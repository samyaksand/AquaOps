"""Top-level API router aggregation."""

from fastapi import APIRouter

router = APIRouter()


@router.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    """Basic liveness check endpoint."""
    return {"status": "ok"}
