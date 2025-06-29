import asyncio
from datetime import datetime

from sqlalchemy.orm import Session

from database import SessionLocal
from models.project import Project, ProjectCreate
from services.fly_service import FlyService
from services.websocket_service import ConnectionManager, EventType

from .async_project_service import AsyncProjectService


class ProjectService:
    def __init__(self, db: Session):
        self.db = db
        self.fly = FlyService()
        self.ws_manager = ConnectionManager()

    def get_projects(self, user_id: str, skip: int = 0, limit: int = 100) -> list[Project]:
        """Get all projects for a user."""
        return (
            self.db.query(Project)
            .filter(Project.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_project(self, project_id: str, user_id: str) -> Project:
        """Get a specific project if the user owns it."""
        project = self.db.query(Project).filter(Project.id == project_id).first()

        if not project:
            raise ValueError("Project not found")

        if project.user_id != user_id:
            raise ValueError("Not authorized to access this project")

        return project

    def create_project(self, project_data: ProjectCreate, user_id: str) -> Project:
        """Create a new project and start deployment."""
        # Create project in database
        db_project = Project(
            name=project_data.name,
            description=project_data.description,
            user_id=user_id,
            status="creating",
            github_url=project_data.github_url,
        )
        self.db.add(db_project)
        self.db.commit()
        self.db.refresh(db_project)

        # Generate Fly app name
        app_name = self._generate_app_name(db_project.name, db_project.id)

        # Start async deployment
        asyncio.create_task(
            self._create_project_background(app_name, str(db_project.id), db_project.github_url)
        )

        return db_project

    def _generate_app_name(self, project_name: str, project_id: str) -> str:
        """Generate a unique Fly.io app name."""
        # Clean project name (lowercase, alphanumeric)
        clean_name = "".join(c.lower() for c in project_name if c.isalnum())[:20]

        # Add unique suffix from project ID
        suffix = project_id.split("-")[0][:8]

        return f"setta-{clean_name}-{suffix}"

    async def _create_project_background(
        self, app_name: str, project_id: str, github_url: str | None
    ):
        """Background task to create Fly.io resources."""
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

            # Create async service instance
            async_service = AsyncProjectService(db, self.fly, self.ws_manager)

            # Broadcast deployment starting
            await async_service._broadcast_project_event(
                project, EventType.PROJECT_DEPLOYING, "Deploying to Fly.io..."
            )

            # Deploy with github_url if provided
            deployment = await self.fly.create_and_deploy_app_with_progress(
                app_name, project_id, github_url
            )

            # Update project with deployment info
            project.url = deployment["url"]
            project.status = "running"
            project.machine_id = deployment["machine_id"]
            project.machine_state = deployment["machine_state"]
            project.last_checked = datetime.utcnow()
            db.commit()

            # Broadcast success
            await async_service._broadcast_project_event(
                project, EventType.PROJECT_READY, "Project is ready!"
            )

        except Exception as e:
            print(f"Deployment error for {app_name}: {str(e)}")
            # Update status on failure
            if project:
                project.url = "Failed to create"
                project.status = "error"
                db.commit()

            # Broadcast error
            if project:
                async_service = AsyncProjectService(db, self.fly, self.ws_manager)
                await async_service._broadcast_project_event(
                    project, EventType.PROJECT_ERROR, f"Deployment failed: {str(e)}"
                )
        finally:
            db.close()

    def delete_project(self, project_id: str, user_id: str) -> bool:
        """Delete a project and its Fly.io resources."""
        project = self.get_project(project_id, user_id)

        print(f"Delete project called for ID: {project_id}")
        print(f"Project URL: {project.url}")
        print(f"Project status: {project.status}")

        # Extract app name from URL
        if not project.url or "fly.dev" not in project.url:
            # Just delete from database if no Fly.io resources
            self.db.delete(project)
            self.db.commit()
            return True

        try:
            # Extract app name from URL (e.g., https://setta-test-abc123.fly.dev)
            app_name = project.url.split("//")[1].split(".")[0]
            print(f"Extracted app name: {app_name}")

            # Destroy Fly.io app
            self.fly.destroy_app(app_name)

            # Delete from database
            self.db.delete(project)
            self.db.commit()
            return True

        except Exception as e:
            print(f"Error deleting project: {str(e)}")
            # Still delete from database even if Fly.io deletion fails
            self.db.delete(project)
            self.db.commit()
            return True

    def update_machine_state(self, project_id: str, user_id: str, new_state: str) -> Project:
        """Update the machine state of a project."""
        project = self.get_project(project_id, user_id)

        if new_state not in ["started", "stopped", "stopping", "starting"]:
            raise ValueError(f"Invalid machine state: {new_state}")

        project.machine_state = new_state
        project.last_checked = datetime.utcnow()
        self.db.commit()
        self.db.refresh(project)

        return project

    def wake_project(self, project_id: str, user_id: str) -> bool:
        """Wake up a hibernated project."""
        project = self.get_project(project_id, user_id)

        if not project.url or not project.machine_id:
            raise ValueError("Project has no machine to wake")

        # Extract app name from URL
        app_name = project.url.split("//")[1].split(".")[0]

        # Start the machine
        success = self.fly.start_machine(app_name, project.machine_id)

        if success:
            project.machine_state = "starting"
            project.last_checked = datetime.utcnow()
            self.db.commit()

        return success

    def hibernate_project(self, project_id: str, user_id: str) -> bool:
        """Hibernate a running project."""
        project = self.get_project(project_id, user_id)

        if not project.url or not project.machine_id:
            raise ValueError("Project has no machine to hibernate")

        # Extract app name from URL
        app_name = project.url.split("//")[1].split(".")[0]

        # Stop the machine
        success = self.fly.stop_machine(app_name, project.machine_id)

        if success:
            project.machine_state = "stopping"
            project.last_checked = datetime.utcnow()
            self.db.commit()

        return success
