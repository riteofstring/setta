from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class MachineState(str, Enum):
    """Possible states for a Fly.io machine"""

    CREATED = "created"
    STARTING = "starting"
    STARTED = "started"
    STOPPING = "stopping"
    STOPPED = "stopped"
    DESTROYING = "destroying"
    DESTROYED = "destroyed"


class Machine(BaseModel):
    """Fly.io machine information"""

    id: str
    state: MachineState
    region: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AppInfo(BaseModel):
    """Basic app information returned from create"""

    name: str
    hostname: str


class AppStatus(BaseModel):
    """Full app status information"""

    id: str | None = None
    name: str
    hostname: str
    status: str = "unknown"
    deployed: bool = False
    machines: list[Machine] = Field(default_factory=list)


class IPAddressType(str, Enum):
    """Types of IP addresses that can be allocated"""

    SHARED_V4 = "shared_v4"
    V4 = "v4"
    V6 = "v6"


class CreateAppRequest(BaseModel):
    """Request body for creating an app"""

    app_name: str
    org_slug: str = "personal"
    network: str | None = None  # Optional network isolation


class AllocateIPRequest(BaseModel):
    """Request body for allocating IP addresses"""

    type: IPAddressType


class CreateMachineRequest(BaseModel):
    """Request body for creating a machine"""

    region: str = "ord"
    config: dict

    @classmethod
    def default_config(cls, app_name: str) -> "CreateMachineRequest":
        """Create default machine configuration for test FOSS app"""
        return cls(
            region="ord",
            config={
                # Use the test FOSS app image from your registry
                # This should match what you deployed to test-foss-app
                "image": "registry.fly.io/test-foss-app:latest",
                "env": {
                    "PROJECT_NAME": app_name,
                    "FLY_APP_NAME": app_name,
                },
                "services": [
                    {
                        "protocol": "tcp",
                        "internal_port": 8000,  # Your FastAPI app runs on 8000
                        "ports": [
                            {
                                "port": 80,
                                "handlers": ["http"],
                            },
                            {
                                "port": 443,
                                "handlers": ["tls", "http"],
                            },
                        ],
                    }
                ],
                "init": {},
                "auto_destroy": True,
                "restart": {
                    "policy": "always",
                },
                "guest": {
                    "cpu_kind": "shared",
                    "cpus": 1,
                    "memory_mb": 256,
                },
            },
        )
