"""
Project management service.
Handles business logic for creating and managing projects.
"""

import re
import time
from datetime import datetime

from sqlalchemy.orm import Session

from ..database import Project
from ..models.project import ProjectCreate, ProjectResponse
from .fly_service import FlyAPIError, FlyService


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
        return ProjectResponse.from_orm(project) if project else None

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project with Fly.io app."""
        # Generate unique app name
        app_name = self._generate_app_name(project_data.name)

        # Create database record
        project = Project(name=project_data.name, url="Creating...", status="creating")
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)

        try:
            # Create Fly.io app
            fly_app = self.fly.create_app(app_name)

            # Update project with app info
            project.url = f"https://{fly_app['hostname']}"
            project.status = "created"
            self.db.commit()

            # Deploy default image
            try:
                self.fly.deploy_image(fly_app["id"])
                project.status = "running"
                self.db.commit()
            except Exception as e:
                print(f"Deployment pending: {e}")
                project.status = "deployment_pending"
                self.db.commit()

        except FlyAPIError as e:
            # Handle errors
            project.status = "error"
            project.url = "Failed to create"
            self.db.commit()
            print(f"Failed to create Fly app: {e}")

        self.db.refresh(project)
        return ProjectResponse.from_orm(project)

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and its Fly.io app."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False

        # Try to delete Fly.io app if it has a valid URL
        if project.url and "fly.dev" in project.url:
            try:
                # Get app status to find app ID
                app_name = project.url.split("//")[1].split(".")[0]
                app_info = self.fly.get_app_status(app_name)

                if app_info:
                    self.fly.delete_app(app_info["id"])
            except Exception as e:
                print(f"Error deleting Fly app: {e}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()
        return True

    def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Check Fly.io status if we have a URL
        if project.url and "fly.dev" in project.url:
            app_name = project.url.split("//")[1].split(".")[0]
            app_status = self.fly.get_app_status(app_name)

            if not app_status:
                project.status = "not_found"
            else:
                project.status = "running" if app_status.get("deployed") else "pending"

            project.last_checked = datetime.utcnow()
            self.db.commit()

        return project.status

    def _generate_app_name(self, project_name: str) -> str:
        """Generate a unique app name for Fly.io."""
        # Clean the name
        safe_name = re.sub(r"[^a-z0-9-]", "-", project_name.lower())
        safe_name = re.sub(r"-+", "-", safe_name)  # Remove multiple dashes
        safe_name = safe_name.strip("-")[:40]  # Trim and limit length

        # Add timestamp for uniqueness
        timestamp = int(time.time())
        app_name = f"setta-{safe_name}-{timestamp}"

        return app_name[:63]  # Fly.io app name limit
