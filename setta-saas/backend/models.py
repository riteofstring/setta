from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AppInfo(BaseModel):
    """Basic app information returned from create"""
    name: str
    hostname: str


class AppStatus(BaseModel):
    """Full app status information"""
    id: Optional[str] = None
    name: str
    hostname: str
    status: str = "unknown"
    deployed: bool = False
    machines: List[Machine] = Field(default_factory=list)


class IPAddressType(str, Enum):
    """Types of IP addresses that can be allocated"""
    SHARED_V4 = "shared_v4"
    V4 = "v4"
    V6 = "v6"


class CreateAppRequest(BaseModel):
    """Request body for creating an app"""
    app_name: str
    org_slug: str = "personal"


class AllocateIPRequest(BaseModel):
    """Request body for allocating IP addresses"""
    type: IPAddressType


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
                "image": "flyio/hellofly:latest",
                "metadata": {
                    "fly_platform_version": "v2",
                    "fly_process_group": "app",
                    "fly_auto_stop": "true",
                    "fly_auto_start": "true"
                },
                "env": {
                    "PROJECT_NAME": app_name,
                    "FLY_APP_NAME": app_name
                },
                "services": [{
                    "ports": [
                        {"port": 443, "handlers": ["tls", "http"]},
                        {"port": 80, "handlers": ["http"]}
                    ],
                    "protocol": "tcp",
                    "internal_port": 8080,
                    "concurrency": {
                        "type": "connections",
                        "hard_limit": 25,
                        "soft_limit": 20
                    }
                }],
                "restart": {
                    "policy": "on-failure",
                    "max_retries": 10
                },
                "auto_destroy": False
            }
        )
