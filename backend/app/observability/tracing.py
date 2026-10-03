"""OpenTelemetry tracing setup.

Auto-instruments FastAPI (HTTP spans) and SQLAlchemy (DB query spans).
Traces export over OTLP/HTTP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (a
collector address); otherwise they export to the console, so instrumentation
is verifiable with nothing extra running. No tracing backend (Jaeger, Tempo,
...) is bundled here — this is deliberately just the foundation the task
asked for, wired to whatever collector a later milestone points it at.
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SpanExporter,
)

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_configured = False


def _build_exporter() -> SpanExporter:
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return ConsoleSpanExporter()
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
            OTLPSpanExporter,
        )
    except ImportError:
        logger.warning(
            "OTEL_EXPORTER_OTLP_ENDPOINT is set but the OTLP exporter package "
            "is not installed; falling back to console export"
        )
        return ConsoleSpanExporter()
    return OTLPSpanExporter(endpoint=endpoint)


def configure_tracing(app: FastAPI, engine=None) -> None:
    """Wire up tracing for the FastAPI app and, if given, a DB engine.

    Idempotent and safe to call once at startup; a second call is a no-op so
    tests that import the app repeatedly don't double-instrument it.
    """
    global _configured
    if _configured:
        return

    settings = get_settings()
    provider = TracerProvider(
        resource=Resource.create({SERVICE_NAME: settings.app_name})
    )
    provider.add_span_processor(BatchSpanProcessor(_build_exporter()))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    if engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)

    _configured = True
    logger.info("tracing configured for %s", settings.app_name)
