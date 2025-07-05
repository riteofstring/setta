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

    # Fly.io
    fly_api_token: str
    fly_api_url: str = "https://api.fly.io/graphql"
    fly_machines_url: str = "https://api.machines.dev/v1"
    fly_org_slug: str = "personal"  # Default to personal org

    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "https://frontend-production-c08f.up.railway.app",
    ]

    # Clerk Authentication
    clerk_jwt_public_key: str | None = None
    clerk_api_key: str | None = None  # Optional: for API verification fallback

    # Storage (R2)
    storage_access_key: str | None = None
    storage_secret_key: str | None = None
    storage_bucket_name: str = "user-projects"
    r2_endpoint: str | None = None

    class Config:
        env_file = ".env"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
