from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env", env_ignore_empty=True, extra="ignore"
    )

    # Fly.io settings
    fly_api_token: str

    # Database settings
    database_url: str

    # API settings
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # CORS settings
    backend_cors_origins: list[str] = [
        "http://localhost:5173",
        "https://frontend-production-*.up.railway.app",
    ]

    # App settings
    project_name: str = "SaaS Platform API"
    debug: bool = False

    @property
    def postgres_url(self) -> str:
        """Convert postgres:// to postgresql:// if needed"""
        if self.database_url.startswith("postgres://"):
            return self.database_url.replace("postgres://", "postgresql://", 1)
        return self.database_url


# Create global settings instance
settings = Settings()
