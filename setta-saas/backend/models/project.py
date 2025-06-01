"""
Project-related Pydantic models for request/response validation.
"""

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Request model for creating a project."""

    name: str = Field(..., min_length=1, max_length=100)


class ProjectResponse(BaseModel):
    """Response model for project data."""

    id: str
    name: str
    url: str
    status: str
    created_at: datetime
    last_checked: datetime | None = None

    class Config:
        from_attributes = True  # For SQLAlchemy model conversion


class ProjectUpdate(BaseModel):
    """Request model for updating project status."""

    status: str | None = None
    url: str | None = None
