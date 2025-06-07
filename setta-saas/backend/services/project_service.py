"""
Project service for managing user projects.
"""

import time
from datetime import datetime
from uuid import uuid4

from sqlalchemy.orm import Session

from database import Project
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService
from utils.validators import sanitize_app_name


class ProjectService:
    """Service for managing projects."""

    def __init__(self, db: Session):
        self.db = db
        self.fly = FlyService()

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

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
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
            status="deployment_pending",
        )
        self.db.add(project)
        self.db.commit()

        # Deploy to Fly.io
        try:
            deployment = self.fly.create_and_deploy_app(app_name)

            # Update project with deployment info
            project.url = deployment["url"]
            project.status = "running"
            project.last_checked = datetime.utcnow()
            self.db.commit()

        except Exception as e:
            # Update status on failure
            project.url = "Failed to create"
            project.status = "error"
            self.db.commit()
            print(f"Deployment failed for {app_name}: {str(e)}")

        return self._to_response(project)

    def delete_project(self, project_id: str) -> bool:
        """Delete a project and its Fly.io resources."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False

        # Extract app name from URL if available
        if project.url and project.url.startswith("https://"):
            try:
                # Extract app name from URL like https://app-name.fly.dev
                app_name = project.url.split("//")[1].split(".")[0]
                self.fly.delete_app(app_name)
            except Exception as e:
                print(f"Failed to delete Fly.io app: {str(e)}")

        # Delete from database
        self.db.delete(project)
        self.db.commit()
        return True

    def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Extract app name and check status
        if project.url and project.url.startswith("https://"):
            try:
                app_name = project.url.split("//")[1].split(".")[0]
                status = self.fly.get_app_status(app_name)

                if status:
                    project.status = "running" if status.get("deployed") else "deploying"
                else:
                    project.status = "error"

                project.last_checked = datetime.utcnow()
                self.db.commit()
            except Exception as e:
                print(f"Status check failed: {str(e)}")

        return project.status

    def _to_response(self, project: Project) -> ProjectResponse:
        """Convert database model to response model."""
        return ProjectResponse(
            id=project.id,
            name=project.name,
            url=project.url,
            status=project.status,
            created_at=project.created_at,
        )
