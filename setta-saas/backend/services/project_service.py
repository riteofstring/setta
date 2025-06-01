"""
Project management service.
Handles business logic for creating and managing projects.
"""

import re
import time
from datetime import datetime

from sqlalchemy.orm import Session

from database import Project
from fly.client import FlyAPIError
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService


class ProjectService:
    """Service for managing projects."""

    def __init__(self, db: Session):
        self.db = db
        self.fly = FlyService()

    def list_projects(self) -> list[ProjectResponse]:
        """List all projects."""
        projects = self.db.query(Project).all()
        return [ProjectResponse.from_orm(p) for p in projects]

    def get_project(self, project_id: str) -> ProjectResponse | None:
        """Get a specific project."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None
        return ProjectResponse.from_orm(project)

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project with Fly.io app."""
        # Generate unique app name
        app_name = self._generate_app_name(project_data.name)

        # Create initial database record
        project = self._create_project_record(project_data.name)

        # Try to create and deploy Fly.io app
        try:
            fly_app = self.fly.create_app(app_name)
            self._update_project_with_app(project, fly_app)
            self._deploy_default_image(project, fly_app["name"])
        except FlyAPIError as e:
            self._mark_project_as_failed(project, str(e))

        self.db.refresh(project)
        return ProjectResponse.from_orm(project)

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and its Fly.io app."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False

        # Try to delete Fly.io app if it exists
        self._try_delete_fly_app(project)

        # Delete from database
        self.db.delete(project)
        self.db.commit()
        return True

    def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Skip if no valid Fly.io URL
        if not project.url or "fly.dev" not in project.url:
            return project.status

        # Extract app name and check status
        app_name = project.url.split("//")[1].split(".")[0]
        app_status = self.fly.get_app_status(app_name)

        # Update status based on result
        project.status = "running" if app_status and app_status.get("deployed") else "not_found"
        project.last_checked = datetime.utcnow()
        self.db.commit()

        return project.status

    # Helper methods (kept simple and focused)

    def _create_project_record(self, name: str) -> Project:
        """Create initial project database record."""
        project = Project(name=name, url="Creating...", status="creating")
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def _update_project_with_app(self, project: Project, fly_app: dict):
        """Update project with Fly app info."""
        project.url = f"https://{fly_app['hostname']}"
        project.status = "created"
        self.db.commit()

    def _deploy_default_image(self, project: Project, app_name: str):
        """Deploy default image to project."""
        try:
            self.fly.deploy_image(app_name)
            project.status = "running"
        except Exception as e:
            print(f"Deployment pending: {e}")
            project.status = "deployment_pending"
        self.db.commit()

    def _mark_project_as_failed(self, project: Project, error: str):
        """Mark project as failed with error."""
        project.status = "error"
        project.url = "Failed to create"
        self.db.commit()
        print(f"Failed to create Fly app: {error}")

    def _try_delete_fly_app(self, project: Project):
        """Try to delete Fly.io app if it exists."""
        if not project.url or "fly.dev" not in project.url:
            return

        try:
            app_name = project.url.split("//")[1].split(".")[0]
            app_info = self.fly.get_app_status(app_name)
            if app_info:
                self.fly.delete_app(app_info["id"])
        except Exception as e:
            print(f"Error deleting Fly app: {e}")

    def _generate_app_name(self, project_name: str) -> str:
        """Generate a unique app name for Fly.io."""
        # Clean the name
        safe_name = re.sub(r"[^a-z0-9-]", "-", project_name.lower())
        safe_name = re.sub(r"-+", "-", safe_name)
        safe_name = safe_name.strip("-")[:40]

        # Add timestamp for uniqueness
        timestamp = int(time.time())
        return f"setta-{safe_name}-{timestamp}"[:63]
