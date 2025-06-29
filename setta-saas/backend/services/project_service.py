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

    def list_user_projects(self, user_id: str) -> list[ProjectResponse]:
        """List all projects for a specific user."""
        projects = self.db.query(Project).filter(Project.user_id == user_id).all()
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
        # For now, use a default user_id until auth is fully implemented
        project = Project(
            id=str(uuid4()),
            name=project_data.name,
            url="Creating...",
            status="creating",
            user_id="default-user",  # Temporary until auth is implemented
            github_url=project_data.github_url,
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

    async def delete_project(self, project_id: str) -> bool:
        """Delete a project and its Fly.io resources."""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return False

        # Get app name from URL
        app_name = None
        if project.url and project.url != "Creating...":
            try:
                app_name = project.url.split("//")[1].split(".")[0]
            except Exception:
                pass

        # Delete from Fly.io
        if app_name:
            try:
                destroyed = self.fly.destroy_app(app_name)
                if destroyed:
                    print(f"Deleted Fly.io app: {app_name}")
                else:
                    print(f"Failed to delete Fly.io app {app_name}")
            except Exception as e:
                print(f"Failed to delete Fly.io app {app_name}: {str(e)}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()

        # Broadcast deletion event
        await self._broadcast_project_event(project, EventType.PROJECT_DELETED, "Project deleted")

        return True

    async def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            return None

        # Don't check if already running or failed
        if project.status in ["running", "error"]:
            return project.status

        # Get app name from URL
        if not project.url or project.url == "Creating...":
            return project.status

        try:
            app_name = project.url.split("//")[1].split(".")[0]

            # Import get_app_status from deployment module
            from fly.deployment import get_app_status

            status = await asyncio.to_thread(get_app_status, self.fly.client, app_name)

            if status:
                project.status = "running"
                project.last_checked = datetime.utcnow()
                self.db.commit()

                # Get machine ID if we don't have it
                if not project.machine_id:
                    from fly.deployment import list_machines

                    machines = await asyncio.to_thread(list_machines, self.fly.client, app_name)
                    if machines:
                        project.machine_id = machines[0]["id"]
                        self.db.commit()

                return "running"
            else:
                return project.status
        except Exception as e:
            print(f"Error checking status for project {project_id}: {str(e)}")
            return project.status

    async def check_machine_state(self, project_id: str) -> str | None:
        """Check and update machine hibernation state."""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project or not project.machine_id:
            return None

        try:
            # Get app name from URL
            app_name = project.url.split("//")[1].split(".")[0]

            # Get machine state
            status = self.fly.get_machine_status(app_name, project.machine_id)
            state = status.get("state")

            if state:
                project.machine_state = state
                project.last_checked = datetime.utcnow()
                self.db.commit()
                return state

            return project.machine_state
        except Exception as e:
            print(f"Error checking machine state: {str(e)}")
            return project.machine_state

    def sync_all_projects(self) -> dict:
        """Sync all project statuses with Fly.io."""
        projects = self.db.query(Project).all()
        updated = 0
        failed = 0

        for project in projects:
            try:
                if project.status == "creating" and project.url != "Creating...":
                    app_name = project.url.split("//")[1].split(".")[0]

                    # Import get_app_status from deployment module
                    from fly.deployment import get_app_status

                    status = get_app_status(self.fly.client, app_name)

                    if status:
                        project.status = "running"
                        project.last_checked = datetime.utcnow()
                        updated += 1
            except Exception as e:
                print(f"Failed to sync project {project.id}: {str(e)}")
                failed += 1

        self.db.commit()
        return {"updated": updated, "failed": failed, "total": len(projects)}

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

    async def _deploy_project_with_progress(self, project_id: str, app_name: str):
        """Deploy project to Fly.io with real progress updates."""
        db = SessionLocal()
        project = db.query(Project).filter(Project.id == project_id).first()

        if not project:
            db.close()
            return

        try:
            # Step 1: Creating app
            await self._update_progress(project, DeploymentStep.CREATING_APP, 10)

            # Step 2-5: Deploy using FlyService's create_and_deploy_app method
            await self._update_progress(project, DeploymentStep.ALLOCATING_IPS, 20)

            # Deploy the app - this handles app creation, IP allocation, and machine deployment
            deployment_result = await asyncio.to_thread(self.fly.create_and_deploy_app, app_name)

            # Update progress as deployment completes
            await self._update_progress(project, DeploymentStep.DEPLOYING_MACHINE, 50)
            await self._update_progress(project, DeploymentStep.WAITING_FOR_DNS, 70)

            # Step 6: Verifying deployment
            await self._update_progress(project, DeploymentStep.VERIFYING_DEPLOYMENT, 90)

            # Update project with success
            project.url = deployment_result["url"]
            project.status = "running"
            project.machine_id = deployment_result.get("machine_id")
            project.machine_state = deployment_result.get("machine_state", "started")
            db.commit()

            # Step 7: Complete
            await self._update_progress(project, DeploymentStep.COMPLETE, 100)

            # Send completion event
            await self._broadcast_project_event(
                project,
                EventType.PROJECT_READY,
                f"Project deployed successfully at {project.url}",
            )

        except Exception as e:
            print(f"Deployment failed for project {project_id}: {str(e)}")

            # Update project with error
            project.status = "error"
            project.url = f"Error: {str(e)}"
            db.commit()

            # Send error event
            await self._broadcast_project_event(
                project, EventType.PROJECT_ERROR, f"Deployment failed: {str(e)}"
            )

            # Try to cleanup if app was partially created
            try:
                self.fly.destroy_app(app_name)
            except Exception:
                pass  # Ignore cleanup errors

        finally:
            db.close()

    async def _update_progress(self, project: Project, step: DeploymentStep, percentage: int):
        """Update deployment progress and broadcast to clients."""
        # Calculate current step number based on percentage
        current_step = int((percentage / 100) * 5)  # Assuming 5 total steps

        progress_data = ProgressData(
            current_step=current_step,
            total_steps=5,
            message=self._get_step_message(step),
            percent_complete=percentage,
        )

        await self._broadcast_progress(project, progress_data)

    def _get_step_message(self, step: DeploymentStep) -> str:
        """Get user-friendly message for deployment step."""
        # The DeploymentStep enum already contains user-friendly messages
        return step.value

    async def _broadcast_project_event(self, project: Project, event_type: EventType, message: str):
        """Broadcast project event to all connected clients."""
        event_data = ProjectEventData(
            project_id=project.id,
            project_name=project.name,
            status=project.status,
            url=project.url if project.url != "Creating..." else None,
            timestamp=datetime.utcnow(),
        )

        event = WebSocketEvent(
            type=event_type,
            data=event_data.model_dump(mode="json"),  # Serialize to JSON-compatible format
            timestamp=datetime.utcnow(),
        )

        await self.ws_manager.broadcast(
            event.model_dump(mode="json")
        )  # Serialize to JSON-compatible format

    async def _broadcast_progress(self, project: Project, progress: ProgressData):
        """Broadcast deployment progress to all connected clients."""
        event = WebSocketEvent(
            type=EventType.DEPLOYMENT_PROGRESS,
            data={
                "project_id": project.id,
                "progress": progress.model_dump(mode="json"),  # Serialize to JSON-compatible format
            },
            timestamp=datetime.utcnow(),
        )
        await self.ws_manager.broadcast(
            event.model_dump(mode="json")
        )  # Serialize to JSON-compatible format

    def _to_response(self, project: Project) -> ProjectResponse:
        """Convert database model to response model."""
        return ProjectResponse(
            id=project.id,
            name=project.name,
            url=project.url,
            status=project.status,
            created_at=project.created_at,
            github_url=project.github_url,
            machine_id=project.machine_id,
            machine_state=project.machine_state,
        )
