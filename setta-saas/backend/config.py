"""
Configuration management for the SaaS platform.
Centralizes all settings and environment variables.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str

    # Fly.io API
    fly_api_token: str
    fly_api_url: str = "https://api.fly.io/graphql"

    # App settings
    app_name: str = "SaaS Platform API"
    environment: str = "development"

    # CORS settings
    cors_origins: list[str] = [
        "http://localhost:5173",
        "https://frontend-production-*.up.railway.app",
        "*",  # Will tighten this later
    ]

    model_config = {"env_file": ".env", "case_sensitive": False, "extra": "ignore"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Fix postgres:// to postgresql:// if needed
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql://", 1)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
