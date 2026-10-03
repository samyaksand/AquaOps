"""Application configuration using pydantic-settings.

Values are sourced from environment variables (and an optional .env file
in the backend/ directory) with sensible defaults for local development.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # General
    app_name: str = "AquaOps"
    environment: str = "local"
    debug: bool = True

    # API
    api_v1_prefix: str = "/api/v1"

    # CORS (future React frontend)
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Database (not connected yet; placeholder for future stages)
    database_url: str = (
        "postgresql+asyncpg://aquaops:aquaops@localhost:5432/aquaops"
    )
    database_echo: bool = False

    # Redis: current-state cache, and pub/sub fanout for realtime events so
    # every API process (not just the one that computed a result) can
    # broadcast it to its own WebSocket clients.
    redis_url: str = "redis://localhost:6379/0"

    # Kafka: event transport for allocation/scenario outcomes. Best-effort —
    # the API and WebSocket layers must keep working if the broker is down.
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
