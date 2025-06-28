"""
Project request/response models.
"""

from datetime import datetime

from pydantic import BaseModel


class ProjectCreate(BaseModel):
    """Request model for creating a project."""

    name: str
    github_url: str | None = None


class ProjectResponse(BaseModel):
    """Response model for project data."""

    id: str
    name: str
    url: str
    status: str
    created_at: datetime
    github_url: str | None = None
    machine_id: str | None = None
    machine_state: str | None = None
