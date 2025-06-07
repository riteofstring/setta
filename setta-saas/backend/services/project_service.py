"""
Project service for managing user projects.
"""

import asyncio
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from database import Project
from models.project import ProjectCreate, ProjectResponse
from models.websocket import (
    DeploymentStep,
    EventType,
    ProgressData,
    ProjectEventData,
    WebSocketEvent,
)
from services.fly_service import FlyService
from services.websocket_service import get_connection_manager
from utils.validators import sanitize_app_name


class ProjectService:
    """Service for managing projects."""

    def __init__(self, db: Session):
        self.db = db
        self.fly = FlyService()
        self.ws_manager = get_connection_manager()

    def list_projects(self) -> list[ProjectResponse]:
        """List all projects."""
        projects = self.db.query(Project).all()
        return [self._to_response(p) for p in projects]

    def get_project(self, project_id: str) -> ProjectResponse | None:
        """Get a specific project."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None
        return self._to_response(project)

    async def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project and deploy to Fly.io."""
        # Generate unique app name
        timestamp = int(time.time())
        base_name = sanitize_app_name(project_data.name)
        app_name = f"setta-{base_name}-{timestamp}"

        # Create database record
        project = Project(
            id=str(uuid4()),
            name=project_data.name,
            url="Creating...",
            status="creating",
        )
        self.db.add(project)
        self.db.commit()

        # Broadcast project creating event
        await self._broadcast_project_event(
            project, EventType.PROJECT_CREATING, "Starting project creation..."
        )

        # Start deployment in background
        asyncio.create_task(self._deploy_project(project, app_name))

        return self._to_response(project)

    async def _deploy_project(self, project: Project, app_name: str):
        """Deploy project to Fly.io with progress updates."""
        deployment_steps = [
            (DeploymentStep.CREATING_APP, 20),
            (DeploymentStep.ALLOCATING_IPS, 40),
            (DeploymentStep.DEPLOYING_MACHINE, 60),
            (DeploymentStep.WAITING_FOR_DNS, 80),
            (DeploymentStep.VERIFYING_DEPLOYMENT, 100),
        ]

        try:
            # Update status to deploying
            project.status = "deploying"
            self.db.commit()

            await self._broadcast_project_event(
                project, EventType.PROJECT_DEPLOYING, "Deploying to Fly.io..."
            )

            # Send progress updates during deployment
            for step, percent in deployment_steps:
                await self._broadcast_progress(project, step.value, percent)

                # Simulate work for demo - remove in production
                await asyncio.sleep(2)

            # Actually deploy
            deployment = await asyncio.to_thread(self.fly.create_and_deploy_app, app_name)

            # Update project with deployment info
            project.url = deployment["url"]
            project.status = "running"
            project.last_checked = datetime.utcnow()
            self.db.commit()

            # Broadcast success
            await self._broadcast_project_event(
                project, EventType.PROJECT_READY, "Project is ready!"
            )

        except Exception as e:
            # Update status on failure
            project.url = "Failed to create"
            project.status = "error"
            self.db.commit()

            # Broadcast error
            await self._broadcast_project_event(
                project, EventType.PROJECT_ERROR, f"Deployment failed: {str(e)}"
            )

    async def delete_project(self, project_id: str) -> bool:
        """Delete a project and its Fly.io resources."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False

        # Extract app name from URL if available
        if project.url and project.url.startswith("https://"):
            try:
                app_name = project.url.split("//")[1].split(".")[0]
                await asyncio.to_thread(self.fly.delete_app, app_name)
            except Exception as e:
                print(f"Failed to delete Fly.io app: {str(e)}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()

        # Broadcast deletion
        await self._broadcast_project_event(project, EventType.PROJECT_DELETED, "Project deleted")

        return True

    async def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Don't check if no URL
        if not project.url or not project.url.startswith("https://"):
            return project.status

        try:
            app_name = project.url.split("//")[1].split(".")[0]
            status = await asyncio.to_thread(self.fly.get_app_status, app_name)

            old_status = project.status
            if status:
                project.status = "running" if status.get("deployed") else "deploying"
            else:
                project.status = "error"

            project.last_checked = datetime.utcnow()
            self.db.commit()

            # Broadcast if status changed
            if old_status != project.status:
                await self._broadcast_project_event(
                    project, EventType.PROJECT_STATUS_CHANGED, f"Status: {project.status}"
                )

        except Exception as e:
            print(f"Status check failed: {str(e)}")
            project.status = "error"
            self.db.commit()

        return project.status

    async def _broadcast_project_event(self, project: Project, event_type: EventType, message: str):
        """Broadcast a project event to all connected clients."""
        event_data = ProjectEventData(
            project_id=project.id,
            project_name=project.name,
            status=project.status,
            url=project.url if project.url != "Creating..." else None,
            error_message=message if event_type == EventType.PROJECT_ERROR else None,
        )

        event = WebSocketEvent(type=event_type, data=event_data.dict())
        await self.ws_manager.broadcast(event)

    async def _broadcast_progress(self, project: Project, message: str, percent: int):
        """Broadcast deployment progress."""
        progress_data = ProgressData(
            current_step=percent // 20,
            total_steps=5,
            message=message,
            percent_complete=percent,
        )

        event = WebSocketEvent(
            type=EventType.DEPLOYMENT_PROGRESS,
            data={
                "project_id": project.id,
                "progress": progress_data.dict(),
            },
        )
        await self.ws_manager.broadcast(event)

    def delete_all_projects(self) -> dict:
        """Delete all projects and their Fly.io resources."""
        projects = self.db.query(Project).all()
        deleted_count = 0
        failed_count = 0

        for project in projects:
            try:
                # Run async delete in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(self.delete_project(project.id))
                loop.close()

                if success:
                    deleted_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                print(f"Failed to delete project {project.id}: {str(e)}")
                failed_count += 1

        return {"deleted": deleted_count, "failed": failed_count, "total": len(projects)}

    def sync_all_projects(self) -> dict:
        """Sync all project statuses with Fly.io."""
        projects = self.db.query(Project).all()
        synced_count = 0
        failed_count = 0

        for project in projects:
            try:
                # Run async check in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                status = loop.run_until_complete(self.check_project_status(project.id))
                loop.close()

                if status:
                    synced_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                print(f"Failed to sync project {project.id}: {str(e)}")
                failed_count += 1

        return {"synced": synced_count, "failed": failed_count, "total": len(projects)}

    def cleanup_dead_projects(self) -> dict:
        """Remove projects with error status or failed deployments."""
        dead_projects = (
            self.db.query(Project).filter(Project.status.in_(["error", "creating"])).all()
        )

        deleted_count = 0
        failed_count = 0

        for project in dead_projects:
            try:
                # Check if it's been pending for more than 5 minutes
                if project.status == "creating":
                    age = datetime.utcnow() - project.created_at
                    if age.total_seconds() < 300:  # Less than 5 minutes
                        continue

                # Run async delete in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(self.delete_project(project.id))
                loop.close()

                if success:
                    deleted_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                print(f"Failed to cleanup project {project.id}: {str(e)}")
                failed_count += 1

        return {"deleted": deleted_count, "failed": failed_count, "total": len(dead_projects)}

    def _to_response(self, project: Project) -> ProjectResponse:
        """Convert database model to response model."""
        return ProjectResponse(
            id=project.id,
            name=project.name,
            url=project.url,
            status=project.status,
            created_at=project.created_at,
        )
