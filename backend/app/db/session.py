"""Async SQLAlchemy database session setup.

This module defines the async engine/session machinery used by every request
and by the Alembic/seed scripts. The engine itself is created at import time
(no connection is opened until first use — asyncpg connects lazily).
"""

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=settings.database_echo,
    pool_pre_ping=True,
    # asyncpg uses server-side prepared statements by default, which a
    # transaction-mode connection pooler (e.g. Supabase's Supavisor/pgbouncer
    # pooler on port 6543) cannot support across pooled connections — it
    # surfaces as intermittent "prepared statement does not exist" errors
    # under concurrent load, not at startup. Disabling the statement cache
    # is the standard asyncpg fix and is a harmless no-op against a direct
    # (unpooled) Postgres connection, so this is safe regardless of which
    # connection string production ends up using.
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an async database session."""
    async with AsyncSessionLocal() as session:
        yield session
