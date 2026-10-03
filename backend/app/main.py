"""AquaOps FastAPI application entrypoint."""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator

from app.api.routes import router as api_router
from app.cache.redis_client import close_redis
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.db.session import engine
from app.domain.scenario import ScenarioError
from app.events.producer import get_event_producer
from app.observability.tracing import configure_tracing
from app.realtime.manager import get_connection_manager

settings = get_settings()

configure_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("%s starting up (environment=%s)", settings.app_name, settings.environment)
    # Relays allocation/scenario events published by any process (including
    # the Kafka worker) to this process's own WebSocket clients.
    listener = asyncio.create_task(get_connection_manager().listen_to_redis())
    yield
    listener.cancel()
    await get_event_producer().close()
    await close_redis()
    logger.info("%s shutting down", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    description=(
        "AquaOps decision-support platform API. "
        "Provides data, modeling, and scenario support for urban water "
        "resource allocation decisions."
    ),
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(ScenarioError)
async def handle_scenario_error(
    request: Request, exc: ScenarioError
) -> JSONResponse:
    """A scenario that cannot apply to the network is a client error."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": str(exc)},
    )


app.include_router(api_router, prefix=settings.api_v1_prefix)

# HTTP request count/latency and process CPU/memory, auto-instrumented.
# AquaOps-specific metrics (allocation timing, WebSocket, Kafka/Redis) live
# in app/observability/metrics.py and are recorded from call sites.
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

configure_tracing(app, engine=engine)
