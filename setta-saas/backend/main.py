"""
FastAPI application for SaaS platform.
Simplified with service layer architecture.
"""

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config import get_settings
from database import SessionLocal
from models.project import ProjectCreate, ProjectResponse
from services.project_service import ProjectService

# Initialize settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(title=settings.app_name)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Dependencies
def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    """Get project service instance."""
    return ProjectService(db)


# Routes
@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": f"Welcome to {settings.app_name}"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "environment": settings.environment}


@app.get("/api/projects", response_model=list[ProjectResponse])
async def list_projects(service: ProjectService = Depends(get_project_service)):
    """List all projects."""
    return service.list_projects()


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate, service: ProjectService = Depends(get_project_service)
):
    """Create a new project."""
    return service.create_project(project_data)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, service: ProjectService = Depends(get_project_service)):
    """Get a specific project."""
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(project_id: str, service: ProjectService = Depends(get_project_service)):
    """Delete a project."""
    if not service.delete_project(project_id):
        raise HTTPException(404, "Project not found")
    return {"message": "Project deleted"}


@app.post("/api/projects/{project_id}/check-status")
async def check_project_status(
    project_id: str, service: ProjectService = Depends(get_project_service)
):
    """Check and update project status."""
    status = service.check_project_status(project_id)
    if status is None:
        raise HTTPException(404, "Project not found")
    return {"status": status}


# New management endpoints
@app.post("/api/projects/sync-all")
async def sync_all_projects(service: ProjectService = Depends(get_project_service)):
    """Sync all project statuses with Fly.io."""
    result = service.sync_all_projects()
    return {"message": "Sync completed", "result": result}


@app.delete("/api/projects/delete-all")
async def delete_all_projects(service: ProjectService = Depends(get_project_service)):
    """Delete all projects and their Fly.io resources."""
    result = service.delete_all_projects()
    return {"message": "Delete all completed", "result": result}


@app.post("/api/projects/cleanup-dead")
async def cleanup_dead_projects(service: ProjectService = Depends(get_project_service)):
    """Remove projects with error status or failed deployments."""
    result = service.cleanup_dead_projects()
    return {"message": "Cleanup completed", "result": result}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
