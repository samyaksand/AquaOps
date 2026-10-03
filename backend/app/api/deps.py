"""Shared API dependencies."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.network_state import load_network_state
from app.db.session import AsyncSessionLocal, get_db
from app.domain.allocation.state import NetworkState

NetworkProvider = Callable[[], Awaitable[NetworkState]]


async def get_network_state(
    session: Annotated[AsyncSession, Depends(get_db)],
) -> NetworkState:
    """Load the current network from the database as a domain snapshot.

    Routes depend on this rather than on a session, so they never touch
    persistence and can be exercised against an in-memory network in tests.
    """
    return await load_network_state(session)


CurrentNetwork = Annotated[NetworkState, Depends(get_network_state)]


async def _load_with_fresh_session() -> NetworkState:
    async with AsyncSessionLocal() as session:
        return await load_network_state(session)


def get_network_provider() -> NetworkProvider:
    """Return a callable that loads the network on demand.

    WebSocket connections are long-lived, so they must not hold a database
    session open for their lifetime. Handlers call this provider per command,
    which opens and closes a session around that one read.
    """
    return _load_with_fresh_session


CurrentNetworkProvider = Annotated[NetworkProvider, Depends(get_network_provider)]
