from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ProjectStatus(str, Enum):
    """Possible project statuses"""

    CREATING = "creating"
    CREATED = "created"
    RUNNING = "running"
    ERROR = "error"
    HIBERNATING = "hibernating"
    DNS_PENDING = "dns_pending"
    DEPLOYMENT_PENDING = "deployment_pending"
    NOT_FOUND = "not_found"


# Request models
class ProjectCreateRequest(BaseModel):
    """Request body for creating a project"""

    name: str = Field(..., min_length=1, max_length=100)


# Response models
class ProjectResponse(BaseModel):
    """Response model for a project"""

    model_config = ConfigDict(
        from_attributes=True, json_encoders={datetime: lambda v: v.isoformat()}
    )

    id: str
    name: str
    url: str
    status: ProjectStatus | str  # Allow string for backward compatibility
    created_at: datetime
    last_checked: datetime | None = None


class ProjectStatusResponse(BaseModel):
    """Response for project status check"""

    status: str
    last_checked: datetime | None = None


class SyncResultItem(BaseModel):
    """Individual sync result"""

    name: str
    old_status: str
    new_status: str


class SyncAllResponse(BaseModel):
    """Response for sync all projects"""

    checked: int
    results: list[SyncResultItem]


class DeleteResponse(BaseModel):
    """Generic delete response"""

    message: str
    deleted: int | None = None


class HealthResponse(BaseModel):
    """Health check response"""

    status: str = "healthy"


class RootResponse(BaseModel):
    """Root endpoint response"""

    message: str = "Welcome to the SaaS Platform API"
