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


class FlyMachineInfo(BaseModel):
    """Model for Fly.io machine information."""

    id: str
    state: str
    region: str
    created_at: str | None = None
    updated_at: str | None = None
    instance_id: str | None = None
    private_ip: str | None = None


class FlyAppInfo(BaseModel):
    """Model for detailed Fly.io app information."""

    id: str
    name: str
    hostname: str
    deployed: bool = False
    status: str = "unknown"
    created_at: str | None = None
    machines: list[FlyMachineInfo] = []


class FlyDeploymentStatus(BaseModel):
    """Model for Fly.io deployment status."""

    id: str
    status: str
    successful: bool = False
    created_at: str | None = None
    updated_at: str | None = None
    description: str | None = None
