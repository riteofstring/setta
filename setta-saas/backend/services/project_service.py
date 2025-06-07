"""
Project service for managing user projects.
"""

import logging
import re
import time
import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from config import get_settings
from database import Project
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService

logger = logging.getLogger(__name__)


class ProjectService:
    """Service for managing projects."""

    def __init__(self, db: Session):
        self.db = db
        settings = get_settings()
        self.fly = FlyService(settings.fly_api_token)

    def list_projects(self) -> list[ProjectResponse]:
        """List all projects."""
        projects = self.db.query(Project).all()
        return [
            ProjectResponse(
                id=p.id,
                name=p.name,
                url=p.url or "",
                status=p.status,
                created_at=p.created_at,
            )
            for p in projects
        ]

    def get_project(self, project_id: str) -> ProjectResponse | None:
        """Get a specific project."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        return ProjectResponse(
            id=project.id,
            name=project.name,
            url=project.url or "",
            status=project.status,
            created_at=project.created_at,
        )

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """Create a new project."""
        # Generate unique app name
        app_name = self._generate_app_name(project_data.name)

        # Create DB record first
        project = Project(
            id=str(uuid.uuid4()),
            name=project_data.name,
            url="Creating...",
            status="creating",
        )
        self.db.add(project)
        self.db.commit()

        # Create Fly.io app
        try:
            fly_app = self.fly.create_app(app_name)
            if not fly_app:
                raise Exception("Failed to create Fly.io app")

            # Update project with successful creation
            project.url = f"https://{fly_app['hostname']}"
            project.status = "running"
            self.db.commit()

            logger.info(f"Project {project.id} created successfully")

        except Exception as e:
            logger.error(f"Failed to create Fly.io app: {e}")
            project.url = "Failed to create"
            project.status = "error"
            self.db.commit()

        return ProjectResponse(
            id=project.id,
            name=project.name,
            url=project.url,
            status=project.status,
            created_at=project.created_at,
        )

    def delete_project(self, project_id: str) -> bool:
        """Delete a project."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return False

        # Extract app name from URL if possible
        app_name = None
        if project.url and project.url.startswith("https://"):
            # Extract app name from URL like https://app-name.fly.dev
            match = re.match(r"https://([^.]+)\.fly\.dev", project.url)
            if match:
                app_name = match.group(1)

        # Try to delete Fly.io app if we have the name
        if app_name:
            try:
                self.fly.delete_app(app_name)
                logger.info(f"Deleted Fly.io app: {app_name}")
            except Exception as e:
                logger.error(f"Failed to delete Fly.io app: {e}")
                # Continue with DB deletion even if Fly.io deletion fails

        # Delete from database
        self.db.delete(project)
        self.db.commit()
        return True

    def check_project_status(self, project_id: str) -> str | None:
        """Check and update project status."""
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            return None

        # Extract app name from URL
        if not project.url or not project.url.startswith("https://"):
            return project.status

        match = re.match(r"https://([^.]+)\.fly\.dev", project.url)
        if not match:
            return project.status

        app_name = match.group(1)

        # Check app status
        try:
            app_status = self.fly.get_app_status(app_name)
            if app_status:
                new_status = (
                    "running"
                    if app_status.get("status") == "deployed"
                    else app_status.get("status", "unknown")
                )
                if new_status != project.status:
                    project.status = new_status
                    project.last_checked = datetime.utcnow()
                    self.db.commit()
                return new_status
        except Exception as e:
            logger.error(f"Failed to check app status: {e}")

        return project.status

    def _generate_app_name(self, project_name: str) -> str:
        """Generate a unique app name for Fly.io."""
        # Clean the project name
        clean_name = re.sub(r"[^a-z0-9-]", "-", project_name.lower())
        clean_name = re.sub(r"-+", "-", clean_name).strip("-")

        # Add timestamp for uniqueness
        timestamp = int(time.time())
        app_name = f"setta-{clean_name[:20]}-{timestamp}"

        # Ensure it's within Fly.io limits (63 chars)
        return app_name[:63]
