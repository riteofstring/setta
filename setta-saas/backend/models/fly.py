"""
Fly.io related Pydantic models.
"""

from pydantic import BaseModel


class FlyApp(BaseModel):
    """Model for Fly.io app data."""

    id: str
    name: str
    hostname: str


class FlyRelease(BaseModel):
    """Model for Fly.io release data."""

    id: str
    version: int
    stable: bool


class FlyDeployResult(BaseModel):
    """Model for deployment result."""

    app: FlyApp
    release: FlyRelease | None = None
