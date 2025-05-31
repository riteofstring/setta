from typing import Optional
from pydantic import BaseModel, Field


# Request models
class ProjectCreateRequest(BaseModel):
    """Request body for creating a project"""
    name: str = Field(..., min_length=1, max_length=100)


# Response models
class ProjectResponse(BaseModel):
    """Response model for a project"""
    id: str
    name: str
    url: str
    status: str
    created_at: str
    last_checked: Optional[str] = None

    @classmethod
    def from_db_model(cls, project) -> "ProjectResponse":
        """Create response from database model"""
        return cls(
            id=project.id,
            name=project.name,
            url=project.url,
            status=project.status,
            created_at=project.created_at.isoformat(),
            last_checked=project.last_checked.isoformat() if project.last_checked else None
        )


class ProjectStatusResponse(BaseModel):
    """Response for project status check"""
    status: str
    last_checked: Optional[str] = None


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
    deleted: Optional[int] = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "healthy"


class RootResponse(BaseModel):
    """Root endpoint response"""
    message: str = "Welcome to the SaaS Platform API"
