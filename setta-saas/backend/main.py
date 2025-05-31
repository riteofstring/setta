from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from sqlalchemy.orm import Session
import time
import re

from database import SessionLocal, Project
from fly_manager import FlyManager
from schemas import (
    ProjectCreateRequest,
    ProjectResponse,
    ProjectStatusResponse,
    SyncResultItem,
    SyncAllResponse,
    DeleteResponse,
    HealthResponse,
    RootResponse
)

app = FastAPI(title="SaaS Platform API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://frontend-production-*.up.railway.app",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize Fly manager
fly_manager = FlyManager()


@app.get("/")
async def root():
    return RootResponse()


@app.get("/health")
async def health():
    return HealthResponse()


@app.get("/api/projects")
async def list_projects(db: Session = Depends(get_db)):
    """List all projects from database"""
    projects = db.query(Project).all()
    return [ProjectResponse.from_db_model(p) for p in projects]


@app.post("/api/projects/{project_id}/check-status")
async def check_project_status(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Check individual project status"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Check Fly.io status
    if project.url and "fly.dev" in project.url:
        app_name = project.url.split("//")[1].split(".")[0]
        app_status = fly_manager.get_app_status(app_name)

        if not app_status:
            project.status = "not_found"
        else:
            project.status = "running" if app_status.deployed else "pending"

        project.last_checked = datetime.utcnow()
        db.commit()

    return ProjectStatusResponse(
        status=project.status,
        last_checked=project.last_checked.isoformat() if project.last_checked else None
    )


@app.post("/api/projects")
async def create_project(
    project_data: ProjectCreateRequest,
    db: Session = Depends(get_db)
):
    """Create a new project and Fly.io container"""

    # Generate a unique app name for Fly.io
    safe_name = re.sub(r'[^a-z0-9-]', '-', project_data.name.lower())
    app_name = f"setta-{safe_name}-{int(time.time())}"

    # Create project in database first
    project = Project(
        name=project_data.name,
        url="Creating...",
        status="creating"
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Try to create Fly.io app
    print(f"Creating Fly.io app for project {project.name}")
    fly_app = fly_manager.create_app(app_name)

    if not fly_app:
        project.status = "error"
        project.url = "Failed to create"
        db.commit()
        return ProjectResponse.from_db_model(project)

    # Update project with real URL
    project.url = f"https://{fly_app.hostname}"
    project.status = "created"
    db.commit()

    # Verify app exists
    print(f"Verifying app {app_name} exists...")
    app_status = fly_manager.get_app_status(app_name)

    if not app_status:
        print(f"WARNING: App {app_name} not found after creation!")
        project.status = "dns_pending"
        project.url = f"https://{app_name}.fly.dev (DNS pending)"
        db.commit()
        return ProjectResponse.from_db_model(project)

    print(f"App verified: {app_status}")

    # Deploy to the app
    print(f"Attempting deployment to {app_name}")
    deployment_success = fly_manager.deploy_to_app(app_name)

    project.status = "running" if deployment_success else "deployment_pending"
    print(f"Project {app_name} status: {project.status}")

    db.commit()
    db.refresh(project)

    return ProjectResponse.from_db_model(project)


@app.post("/api/projects/sync-all")
async def sync_all_projects(db: Session = Depends(get_db)):
    """Force check all projects and update their real status"""
    projects = db.query(Project).all()
    results = []

    for project in projects:
        old_status = project.status

        if project.url and "fly.dev" in project.url:
            app_name = project.url.split("//")[1].split(".")[0]
            print(f"Checking {app_name}...")

            app_status = fly_manager.get_app_status(app_name)
            project.status = "running" if app_status and app_status.deployed else "not_found"
        else:
            project.status = "error"

        project.last_checked = datetime.utcnow()

        results.append(SyncResultItem(
            name=project.name,
            old_status=old_status,
            new_status=project.status
        ))

    db.commit()

    return SyncAllResponse(
        checked=len(projects),
        results=results
    )


@app.delete("/api/projects/cleanup")
async def cleanup_dead_projects(db: Session = Depends(get_db)):
    """Delete all projects that are not running"""
    deleted = db.query(Project).filter(
        Project.status.in_(["not_found", "error"])
    ).delete()

    db.commit()

    return DeleteResponse(
        message=f"Deleted {deleted} dead projects",
        deleted=deleted
    )


@app.delete("/api/projects/all")
async def delete_all_projects(db: Session = Depends(get_db)):
    """Delete ALL projects - use with caution!"""
    deleted = db.query(Project).delete()
    db.commit()

    return DeleteResponse(
        message=f"Deleted {deleted} projects",
        deleted=deleted
    )


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Delete a project"""
    project = db.query(Project).filter(Project.id == project_id).first()
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
    db.delete(project)
    db.commit()

    return DeleteResponse(message="Project deleted")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
