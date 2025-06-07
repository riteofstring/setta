"""
Configuration management using pydantic-settings.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings."""

    # App settings
    app_name: str = "Setta SaaS"
    environment: str = "development"

    # Database
    database_url: str

    # CORS
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Fly.io
    fly_api_token: str = ""
    fly_org_id: str = "personal"  # or your actual org ID

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
