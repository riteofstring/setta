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
        """List all projects (admin use)."""
        projects = self.db.query(Project).all()
        return [self._to_response(p) for p in projects]

    def list_user_projects(self, user_id: str) -> list[ProjectResponse]:
        """List all projects for a specific user."""
        projects = self.db.query(Project).filter(Project.user_id == user_id).all()
        return [self._to_response(p) for p in projects]

    def get_project(self, project_id: str, user_id: str) -> ProjectResponse | None:
        """Get a specific project if owned by the user."""
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
        )

        if not project:
            return None
        return self._to_response(project)

    async def create_project(self, project_data: ProjectCreate, user_id: str) -> ProjectResponse:
        """Create a new project for a user and deploy to Fly.io."""
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
            user_id=user_id,
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

    async def delete_project(self, project_id: str, user_id: str) -> bool:
        """Delete a project if owned by the user and its Fly.io resources."""
        # Get project and verify ownership
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
        )

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
                self.fly.delete_app(app_name)
                print(f"Deleted Fly.io app: {app_name}")
            except Exception as e:
                print(f"Failed to delete Fly.io app {app_name}: {str(e)}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()

        # Broadcast deletion event
        await self._broadcast_project_event(project, EventType.PROJECT_DELETED, "Project deleted")

        return True

    async def check_project_status(self, project_id: str, user_id: str) -> str | None:
        """Check and update project status if owned by the user."""
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
        )

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
            status = self.fly.check_app_status(app_name)

            if status:
                project.status = "running"
                project.last_checked = datetime.utcnow()
                self.db.commit()

                # Get machine ID if we don't have it
                if not project.machine_id:
                    machines = self.fly.list_machines(app_name)
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
            state = self.fly.get_machine_state(app_name, project.machine_id)

            if state:
                project.machine_state = state
                project.last_checked = datetime.utcnow()
                self.db.commit()
                return state

            return project.machine_state
        except Exception as e:
            print(f"Error checking machine state: {str(e)}")
            return project.machine_state

    async def start_machine(self, project_id: str, user_id: str) -> bool:
        """Start (wake up) a hibernated machine if owned by the user."""
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.user_id == user_id)
            .first()
        )

        if not project or not project.machine_id:
            return False

        try:
            app_name = project.url.split("//")[1].split(".")[0]

            # Start the machine
            self.fly.start_machine(app_name, project.machine_id)

            # Update state
            project.machine_state = "started"
            project.last_checked = datetime.utcnow()
            self.db.commit()

            return True
        except Exception as e:
            print(f"Error starting machine: {str(e)}")
            return False

    def sync_all_projects(self) -> dict:
        """Sync all project statuses with Fly.io (admin use)."""
        projects = self.db.query(Project).all()
        updated = 0
        failed = 0

        for project in projects:
            try:
                if project.status == "creating" and project.url != "Creating...":
                    app_name = project.url.split("//")[1].split(".")[0]
                    if self.fly.check_app_status(app_name):
                        project.status = "running"
                        project.last_checked = datetime.utcnow()
                        updated += 1
            except Exception as e:
                print(f"Failed to sync project {project.id}: {str(e)}")
                failed += 1

        self.db.commit()
        return {"updated": updated, "failed": failed, "total": len(projects)}

    def delete_all_projects(self) -> dict:
        """Delete all projects and their Fly.io resources (admin use)."""
        projects = self.db.query(Project).all()
        deleted_count = 0
        failed_count = 0

        for project in projects:
            try:
                # Run async delete in sync context
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                success = loop.run_until_complete(self.delete_project(project.id, project.user_id))
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
        """Remove projects with error status or failed deployments (admin use)."""
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
                success = loop.run_until_complete(self.delete_project(project.id, project.user_id))
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

            fly_config = self.fly.create_fly_config(
                app_name=app_name,
                github_url=project.github_url,
            )

            # Step 2: Allocating resources
            await self._update_progress(project, DeploymentStep.ALLOCATING_RESOURCES, 20)

            success = self.fly.create_app(app_name)
            if not success:
                raise Exception("Failed to create Fly.io app")

            # Step 3: Configuring network
            await self._update_progress(project, DeploymentStep.CONFIGURING_NETWORK, 30)

            # Allocate IP addresses
            self.fly.allocate_ips(app_name)
            await asyncio.sleep(2)  # Give Fly.io time to allocate

            # Step 4: Building application
            await self._update_progress(project, DeploymentStep.BUILDING_APPLICATION, 50)

            # Deploy the app
            deploy_success = self.fly.deploy_app(app_name, fly_config)
            if not deploy_success:
                raise Exception("Failed to deploy application")

            # Step 5: Starting services
            await self._update_progress(project, DeploymentStep.STARTING_SERVICES, 70)

            # Wait for app to be ready
            max_attempts = 30
            for attempt in range(max_attempts):
                if self.fly.check_app_status(app_name):
                    break
                await asyncio.sleep(2)

                # Update progress during waiting
                progress = 70 + (20 * (attempt / max_attempts))
                await self._update_progress(
                    project, DeploymentStep.STARTING_SERVICES, int(progress)
                )

            # Step 6: Finalizing
            await self._update_progress(project, DeploymentStep.FINALIZING, 90)

            # Get machine ID
            machines = self.fly.list_machines(app_name)
            machine_id = machines[0]["id"] if machines else None

            # Update project with success
            project.url = f"https://{app_name}.fly.dev"
            project.status = "running"
            project.machine_id = machine_id
            project.machine_state = "started"
            db.commit()

            # Step 7: Completed
            await self._update_progress(project, DeploymentStep.COMPLETED, 100)

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

        finally:
            db.close()

    async def _update_progress(self, project: Project, step: DeploymentStep, percentage: int):
        """Update deployment progress and broadcast to clients."""
        progress_data = ProgressData(
            step=step,
            percentage=percentage,
            message=self._get_step_message(step),
        )

        await self._broadcast_progress(project, progress_data)

    def _get_step_message(self, step: DeploymentStep) -> str:
        """Get user-friendly message for deployment step."""
        messages = {
            DeploymentStep.CREATING_APP: "Creating your application...",
            DeploymentStep.ALLOCATING_RESOURCES: "Allocating cloud resources...",
            DeploymentStep.CONFIGURING_NETWORK: "Configuring network settings...",
            DeploymentStep.BUILDING_APPLICATION: "Building your application...",
            DeploymentStep.STARTING_SERVICES: "Starting application services...",
            DeploymentStep.FINALIZING: "Finalizing deployment...",
            DeploymentStep.COMPLETED: "Deployment completed successfully!",
        }
        return messages.get(step, "Processing...")

    async def _broadcast_project_event(self, project: Project, event_type: EventType, message: str):
        """Broadcast project event to all connected clients."""
        event = WebSocketEvent(
            type=event_type,
            data=ProjectEventData(
                project_id=project.id,
                name=project.name,
                url=project.url,
                status=project.status,
                message=message,
            ),
        )
        await self.ws_manager.broadcast(event.model_dump())

    async def _broadcast_progress(self, project: Project, progress: ProgressData):
        """Broadcast deployment progress to all connected clients."""
        event = WebSocketEvent(
            type=EventType.DEPLOYMENT_PROGRESS,
            data={
                "project_id": project.id,
                "progress": progress.model_dump(),
            },
        )
        await self.ws_manager.broadcast(event.model_dump())

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
