"""Settings must keep today's local defaults unchanged, and must fail loudly
(never silently boot) when a non-local environment is left with a
development default for DEBUG, DATABASE_URL, or CORS_ORIGINS."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_local_environment_retains_current_defaults(monkeypatch):
    """No env vars set (the plain local case) must behave exactly as before."""
    for var in ("ENVIRONMENT", "DEBUG", "DATABASE_URL", "CORS_ORIGINS"):
        monkeypatch.delenv(var, raising=False)

    settings = Settings()

    assert settings.environment == "local"
    assert settings.debug is True
    assert settings.database_url == (
        "postgresql+asyncpg://aquaops:aquaops@localhost:5432/aquaops"
    )
    assert settings.cors_origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def test_production_with_valid_settings_succeeds(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pw@db.supabase.co:5432/aquaops",
    )
    monkeypatch.setenv("CORS_ORIGINS", '["https://aquaops.samyaksand.com"]')

    settings = Settings()

    assert settings.environment == "production"
    assert settings.debug is False
    assert "supabase" in settings.database_url
    assert settings.cors_origins == ["https://aquaops.samyaksand.com"]


def test_production_missing_database_url_fails(monkeypatch):
    """Nothing set for DATABASE_URL means the localhost dev default is still
    in effect — production must refuse to start on it."""
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv("CORS_ORIGINS", '["https://aquaops.samyaksand.com"]')
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError, match="DATABASE_URL"):
        Settings()


def test_production_with_debug_true_fails(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pw@db.supabase.co:5432/aquaops",
    )
    monkeypatch.setenv("CORS_ORIGINS", '["https://aquaops.samyaksand.com"]')

    with pytest.raises(ValidationError, match="DEBUG"):
        Settings()


def test_production_with_localhost_cors_fails(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "false")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pw@db.supabase.co:5432/aquaops",
    )
    monkeypatch.setenv(
        "CORS_ORIGINS",
        '["https://aquaops.samyaksand.com","http://localhost:5173"]',
    )

    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings()
