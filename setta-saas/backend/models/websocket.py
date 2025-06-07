"""
WebSocket event models for real-time updates.
"""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class EventType(str, Enum):
    """Types of WebSocket events."""

    # Project lifecycle events
    PROJECT_CREATING = "project.creating"
    PROJECT_CREATED = "project.created"
    PROJECT_DEPLOYING = "project.deploying"
    PROJECT_READY = "project.ready"
    PROJECT_ERROR = "project.error"
    PROJECT_DELETED = "project.deleted"
    PROJECT_STATUS_CHANGED = "project.status_changed"

    # Progress events
    DEPLOYMENT_PROGRESS = "deployment.progress"

    # System events
    CONNECTION_ESTABLISHED = "connection.established"
    HEARTBEAT = "heartbeat"


class ProgressData(BaseModel):
    """Progress information for long-running operations."""

    current_step: int
    total_steps: int
    message: str
    percent_complete: int


class ProjectEventData(BaseModel):
    """Data for project-related events."""

    project_id: str
    project_name: str
    status: str
    url: str | None = None
    error_message: str | None = None
    timestamp: datetime = datetime.utcnow()


class WebSocketEvent(BaseModel):
    """Base WebSocket event structure."""

    type: EventType
    data: dict | ProjectEventData | ProgressData
    timestamp: datetime = datetime.utcnow()


class DeploymentStep(str, Enum):
    """Steps in the deployment process."""

    CREATING_APP = "Creating Fly.io app"
    ALLOCATING_IPS = "Allocating IP addresses"
    DEPLOYING_MACHINE = "Deploying container"
    WAITING_FOR_DNS = "Waiting for DNS propagation"
    VERIFYING_DEPLOYMENT = "Verifying deployment"
    COMPLETE = "Deployment complete"
