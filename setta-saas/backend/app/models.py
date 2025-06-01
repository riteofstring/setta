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


class CreateAppRequest(BaseModel):
    """Request body for creating an app"""

    app_name: str
    org_slug: str = "personal"
    network: str | None = None


class CreateMachineRequest(BaseModel):
    """Request body for creating a machine"""

    region: str = "ord"
    config: dict

    @classmethod
    def default_config(cls, app_name: str) -> "CreateMachineRequest":
        """Create default machine configuration"""
        return cls(
            region="ord",
            config={
                # Use a simple nginx image for testing
                "image": "nginx:alpine",
                "env": {
                    "PROJECT_NAME": app_name,
                    "FLY_APP_NAME": app_name,
                },
                "services": [
                    {
                        "protocol": "tcp",
                        "internal_port": 80,  # nginx default port
                        "auto_stop_machines": True,
                        "auto_start_machines": True,
                        "min_machines_running": 0,
                        "ports": [
                            {
                                "port": 80,
                                "handlers": ["http"],
                                "force_https": True,  # Redirect HTTP to HTTPS
                            },
                            {
                                "port": 443,
                                "handlers": ["tls", "http"],
                                # Don't set force_https when tls handler is enabled
                            },
                        ],
                        "concurrency": {
                            "type": "requests",
                            "hard_limit": 250,
                            "soft_limit": 200,
                        },
                    }
                ],
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
