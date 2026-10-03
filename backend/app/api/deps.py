"""Shared API dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.network_state import load_network_state
from app.db.session import get_db
from app.domain.allocation.state import NetworkState


async def get_network_state(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NetworkState:
    """Load the current network from the database as a domain snapshot.

    Routes depend on this rather than on a session, so they never touch
    persistence and can be exercised against an in-memory network in tests.
    """
    return await load_network_state(session)


CurrentNetwork = Annotated[NetworkState, Depends(get_network_state)]
