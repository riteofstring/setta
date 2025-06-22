"""
Project service for managing user projects.
"""

import asyncio
import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from database import Project, SessionLocal
from models.project import ProjectCreate, ProjectResponse
from models.websocket import (
    DeploymentStep,
    EventType,
    MachineStateData,
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

    def list_projects(self, user_id: str | None = None) -> list[ProjectResponse]:
        """List all projects, optionally filtered by user."""
        query = self.db.query(Project)

        if user_id:
            query = query.filter(Project.user_id == user_id)

        projects = query.all()
        return [self._to_response(p) for p in projects]

    def list_user_projects(self, user_id: str) -> list[ProjectResponse]:
        """List projects for a specific user."""
        return self.list_projects(user_id)

    def get_project(self, project_id: str, user_id: str | None = None) -> ProjectResponse | None:
        """Get a specific project, optionally filtered by user."""
        query = self.db.query(Project).filter(Project.id == project_id)

        if user_id:
            query = query.filter(Project.user_id == user_id)

        project = query.first()
        if not project:
            return None
        return self._to_response(project)

    async def create_project(self, project_data: ProjectCreate, user_id: str) -> ProjectResponse:
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
            user_id=user_id,  # Set the user who owns this project
        )
        self.db.add(project)
        self.db.commit()

        # Broadcast project creating event
        await self._broadcast_project_event(
            project, EventType.PROJECT_CREATING, "Starting project creation..."
        )

        # Start deployment in background
        asyncio.create_task(self._deploy_project_with_progress(project.id, app_name))

        return self._to_response(project)

    async def _deploy_project_with_progress(self, project_id: str, app_name: str):
        """Deploy project to Fly.io with real progress updates."""
        # Get a fresh database session for this async task
        db = SessionLocal()
        try:
            # Get the project from the database
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project:
                print(f"Project {project_id} not found")
                return

            # Update status to deploying
            project.status = "deploying"
            db.commit()

            await self._broadcast_project_event(
                project, EventType.PROJECT_DEPLOYING, "Deploying to Fly.io..."
            )

            # Send initial progress
            await self._broadcast_progress(project, DeploymentStep.CREATING_APP.value, 20)

            # Actually deploy (this is synchronous so run in thread)
            deployment = await asyncio.to_thread(self.fly.create_and_deploy_app, app_name)

            # Update project with deployment info INCLUDING machine data
            project.url = deployment["url"]
            project.status = "running"
            project.last_checked = datetime.utcnow()
            project.machine_id = deployment["machine_id"]  # Store machine ID
            project.machine_state = deployment["machine_state"]  # Store initial state
            db.commit()

            # Send completion progress
            await self._broadcast_progress(project, DeploymentStep.COMPLETE.value, 100)

            # Broadcast success with full project data including machine info
            await self._broadcast_project_ready(project)

        except Exception as e:
            # Update status on failure
            if project:
                project.url = "Failed to create"
                project.status = "error"
                project.machine_state = "error"  # Set machine state to error
                db.commit()

            # Broadcast error
            await self._broadcast_project_event(
                project, EventType.PROJECT_ERROR, f"Deployment failed: {str(e)}"
            )
            print(f"Deployment error for {app_name}: {str(e)}")
        finally:
            db.close()

    async def delete_project(self, project_id: str, user_id: str | None = None) -> bool:
        """Delete a project and its Fly.io resources."""
        query = self.db.query(Project).filter(Project.id == project_id)

        if user_id:
            query = query.filter(Project.user_id == user_id)

        project = query.first()
        if not project:
            return False

        print(f"Delete project called for ID: {project_id}")
        print(f"Project URL: {project.url}")
        print(f"Project status: {project.status}")

        # Extract app name from URL (e.g., https://setta-c0-1749387393.fly.dev)
        if project.url and "fly.dev" in project.url:
            try:
                app_name = project.url.split("//")[1].split(".")[0]
                print(f"Deleting Fly.io app: {app_name}")

                # Delete from Fly.io
                deleted = await asyncio.to_thread(self.fly.delete_app, app_name)
                if deleted:
                    print(f"✓ Fly.io app '{app_name}' deleted")
                else:
                    print(f"✗ Failed to delete Fly.io app '{app_name}'")
            except Exception as e:
                print(f"Error deleting Fly.io app: {str(e)}")

        if project.url and "fly.dev" in project.url:
            try:
                app_name = project.url.split("//")[1].split(".")[0]
                print(f"Deleting Fly.io app: {app_name}")
                await asyncio.to_thread(self.fly.delete_app, app_name)
            except Exception as e:
                print(f"Error deleting Fly.io app: {e}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()

        # Broadcast deletion
        await self._broadcast_project_event(project, EventType.PROJECT_DELETED, "Project deleted")

        return True

    async def check_project_status(self, project_id: str, user_id: str | None = None) -> str | None:
        """Check and update project status."""
        query = self.db.query(Project).filter(Project.id == project_id)

        if user_id:
            query = query.filter(Project.user_id == user_id)

        project = query.first()
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

    async def check_machine_state(self, project_id: str) -> str | None:
        """Check and update machine state for a project."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Skip if no machine ID
        if not project.machine_id:
            return None

        # Skip if no valid URL
        if not project.url or not project.url.startswith("https://"):
            return None

        try:
            # Extract app name from URL
            app_name = project.url.split("//")[1].split(".")[0]

            # Get machine status from Fly.io
            from fly.deployment import get_machine_status

            status = await asyncio.to_thread(
                get_machine_status, self.fly.client, app_name, project.machine_id
            )

            if not status:
                return None

            new_state = status.get("state", "unknown")
            old_state = project.machine_state

            # Update if state changed
            if old_state != new_state:
                project.machine_state = new_state
                self.db.commit()

                # Broadcast state change
                await self._broadcast_machine_state_change(project, old_state, new_state)

            return new_state

        except Exception as e:
            print(f"Machine state check failed: {str(e)}")
            return None

    async def check_all_machine_states(self) -> dict:
        """Check machine states for all projects with machines."""
        projects = self.db.query(Project).filter(Project.machine_id.isnot(None)).all()

        checked = 0
        changed = 0

        for project in projects:
            try:
                old_state = project.machine_state
                new_state = await self.check_machine_state(project.id)

                if new_state:
                    checked += 1
                    if old_state != new_state:
                        changed += 1

            except Exception as e:
                print(f"Failed to check machine state for {project.id}: {str(e)}")

        return {"total": len(projects), "checked": checked, "changed": changed}

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

    async def _broadcast_project_ready(self, project: Project):
        """Broadcast project ready event with full project data including machine info."""
        # Create event data with ALL project fields including machine data
        event_data = {
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "url": project.url,
            "machine_id": project.machine_id,
            "machine_state": project.machine_state,
            "message": "Project is ready!",
            "timestamp": datetime.utcnow().isoformat(),
        }

        event = WebSocketEvent(type=EventType.PROJECT_READY, data=event_data)
        await self.ws_manager.broadcast(event)

    async def _broadcast_machine_state_change(
        self, project: Project, old_state: str, new_state: str
    ):
        """Broadcast a machine state change event."""
        state_data = MachineStateData(
            project_id=project.id,
            project_name=project.name,
            machine_id=project.machine_id,
            old_state=old_state,
            new_state=new_state,
        )

        event = WebSocketEvent(type=EventType.MACHINE_STATE_CHANGED, data=state_data.dict())
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
            machine_id=project.machine_id,
            machine_state=project.machine_state,
        )
