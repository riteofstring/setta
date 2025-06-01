import re
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.config import settings
from app.database_models import Project, create_db_and_tables, get_session
from app.fly_manager import FlyManager
from app.schemas import (
    DeleteResponse,
    HealthResponse,
    ProjectCreateRequest,
    ProjectResponse,
    ProjectStatus,
    ProjectStatusResponse,
    RootResponse,
    SyncAllResponse,
    SyncResultItem,
)
from app.utils import HTTPClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events"""
    # Startup
    create_db_and_tables()
    print("Database tables created")
    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(title=settings.project_name, lifespan=lifespan, debug=settings.debug)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.debug else settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Fly manager
fly_manager = FlyManager()


def check_app_health(url: str, max_retries: int = 10) -> bool:
    """Check if the app is accessible"""
    client = HTTPClient()

    for i in range(max_retries):
        print(f"Health check attempt {i + 1}/{max_retries} for {url}")
        response = client.get(f"{url}/health", timeout=5.0)

        if response and response.status_code == 200:
            print(f"✓ App is healthy: {url}")
            return True

        time.sleep(3)

    print(f"✗ App health check failed after {max_retries} attempts")
    return False


@app.get("/", response_model=RootResponse)
async def root():
    """Root endpoint"""
    return RootResponse()


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint"""
    return HealthResponse()


@app.get("/api/projects", response_model=list[ProjectResponse])
async def list_projects(session: Session = Depends(get_session)):
    """List all projects from database"""
    projects = session.exec(select(Project)).all()
    return projects


@app.post(
    "/api/projects/{project_id}/check-status", response_model=ProjectStatusResponse
)
async def check_project_status(
    project_id: str, session: Session = Depends(get_session)
):
    """Check individual project status"""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Check Fly.io status
    if project.url and "fly.dev" in project.url:
        app_name = project.url.split("//")[1].split(".")[0]
        app_status = fly_manager.get_app_status(app_name)

        if not app_status:
            project.update_status(ProjectStatus.NOT_FOUND)
        else:
            # Check if app is actually accessible
            if app_status.deployed:
                is_healthy = check_app_health(project.url, max_retries=3)
                status = (
                    ProjectStatus.RUNNING
                    if is_healthy
                    else ProjectStatus.DEPLOYMENT_PENDING
                )
            else:
                status = ProjectStatus.DEPLOYMENT_PENDING

            project.update_status(status)

        session.add(project)
        session.commit()

    return ProjectStatusResponse(
        status=project.status, last_checked=project.last_checked
    )


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreateRequest, session: Session = Depends(get_session)
):
    """Create a new project and Fly.io container"""
    # Generate safe app name
    safe_name = re.sub(r"[^a-z0-9-]", "-", project_data.name.lower())
    safe_name = re.sub(r"-+", "-", safe_name).strip("-")

    # Ensure it starts with a letter
    if not safe_name or not safe_name[0].isalpha():
        safe_name = f"app-{safe_name}"

    # Create unique name with timestamp
    app_name = f"setta-{safe_name}-{int(time.time())}"[:63]

    print(f"Generated app name: {app_name}")

    # Create project in database
    project = Project(
        name=project_data.name, url="Creating...", status=ProjectStatus.CREATING.value
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    # Create Fly.io app
    print(f"Creating Fly.io app for project {project.name}")
    fly_app = fly_manager.create_app(app_name)

    if not fly_app:
        project.url = "Failed to create app"
        project.update_status(ProjectStatus.ERROR)
        session.add(project)
        session.commit()
        return project

    # Update project with URL
    project.url = f"https://{fly_app.hostname}"
    project.update_status(ProjectStatus.CREATED)
    session.add(project)
    session.commit()

    # Wait a bit more before deploying to ensure app is ready
    print("Waiting for app to be fully ready before deployment...")
    time.sleep(5)

    # Deploy to the app
    print(f"Deploying to {app_name}")
    deployment_success = fly_manager.deploy_to_app(app_name)

    if not deployment_success:
        project.update_status(ProjectStatus.DEPLOYMENT_PENDING)
        session.add(project)
        session.commit()
        return project

    # Wait longer for deployment to stabilize
    print("Waiting for deployment to stabilize...")
    time.sleep(20)

    # Check if app is actually accessible
    is_healthy = check_app_health(project.url, max_retries=15)

    if is_healthy:
        project.update_status(ProjectStatus.RUNNING)
    else:
        project.update_status(ProjectStatus.DEPLOYMENT_PENDING)

    session.add(project)
    session.commit()
    session.refresh(project)

    return project


@app.post("/api/projects/sync-all", response_model=SyncAllResponse)
async def sync_all_projects(session: Session = Depends(get_session)):
    """Force check all projects and update their real status"""
    projects = session.exec(select(Project)).all()
    results = []

    for project in projects:
        old_status = project.status

        if project.url and "fly.dev" in project.url:
            app_name = project.url.split("//")[1].split(".")[0]
            print(f"Checking {app_name}...")

            app_status = fly_manager.get_app_status(app_name)

            if not app_status:
                status = ProjectStatus.NOT_FOUND
            elif app_status.deployed:
                # Check if accessible
                is_healthy = check_app_health(project.url, max_retries=2)
                status = (
                    ProjectStatus.RUNNING
                    if is_healthy
                    else ProjectStatus.DEPLOYMENT_PENDING
                )
            else:
                status = ProjectStatus.DEPLOYMENT_PENDING

            project.update_status(status)
        else:
            project.update_status(ProjectStatus.ERROR)

        session.add(project)

        results.append(
            SyncResultItem(
                name=project.name, old_status=old_status, new_status=project.status
            )
        )

    session.commit()

    return SyncAllResponse(checked=len(projects), results=results)


@app.delete("/api/projects/cleanup", response_model=DeleteResponse)
async def cleanup_dead_projects(session: Session = Depends(get_session)):
    """Delete all projects that are not running"""
    # Find dead projects
    dead_projects = session.exec(
        select(Project).where(
            Project.status.in_(
                [ProjectStatus.NOT_FOUND.value, ProjectStatus.ERROR.value]
            )
        )
    ).all()

    count = len(dead_projects)

    # Delete them
    for project in dead_projects:
        session.delete(project)

    session.commit()

    return DeleteResponse(message=f"Deleted {count} dead projects", deleted=count)


@app.delete("/api/projects/all", response_model=DeleteResponse)
async def delete_all_projects(session: Session = Depends(get_session)):
    """Delete ALL projects - use with caution!"""
    projects = session.exec(select(Project)).all()
    count = len(projects)

    for project in projects:
        session.delete(project)

    session.commit()

    return DeleteResponse(message=f"Deleted {count} projects", deleted=count)


@app.delete("/api/projects/{project_id}", response_model=DeleteResponse)
async def delete_project(project_id: str, session: Session = Depends(get_session)):
    """Delete a project"""
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")

    # Try to delete from Fly.io if it exists
    if project.url and "fly.dev" in project.url:
        app_name = project.url.split("//")[1].split(".")[0]
        try:
            fly_manager.delete_app(app_name)
        except Exception as e:
            print(f"Error deleting Fly app: {e}")

    # Delete from database
    session.delete(project)
    session.commit()

    return DeleteResponse(message="Project deleted")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug,
    )
