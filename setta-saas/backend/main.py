"""
FastAPI backend for SaaS deployment platform.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

# Create database tables
from database import Base, SessionLocal, engine
from middleware.auth import get_current_user_optional
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService
from services.project_service import ProjectService
from services.websocket_service import get_connection_manager

Base.metadata.create_all(bind=engine)


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Dependency to get services
def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(db)


def get_async_project_service(db: Session = Depends(get_db)) -> ProjectService:
    """Get project service for async operations."""
    return ProjectService(db)


def get_fly_service() -> FlyService:
    return FlyService()


# Background task to periodically check machine states
async def periodic_machine_check():
    """Check machine states every 5 minutes."""
    while True:
        try:
            db = SessionLocal()
            service = ProjectService(db)
            result = await service.check_all_machine_states()
            print(f"Machine state check: {result}")
            db.close()
        except Exception as e:
            print(f"Error in periodic machine check: {e}")
        await asyncio.sleep(300)  # 5 minutes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Startup
    print("Starting up...")

    # Start background task
    task = asyncio.create_task(periodic_machine_check())

    yield

    # Shutdown
    print("Shutting down...")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# Create FastAPI app
app = FastAPI(
    title="Setta SaaS Backend",
    description="Deploy FOSS apps in the cloud",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://frontend-production-dfa4.up.railway.app",
        "https://setta.dev",
        "https://www.setta.dev",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "setta-backend"}


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    manager = get_connection_manager()
    await manager.connect(websocket)

    try:
        while True:
            # Keep connection alive, wait for messages
            _ = await websocket.receive_text()
            # Could handle client messages here if needed
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


# Project endpoints
@app.get("/api/projects", response_model=list[ProjectResponse])
async def list_projects(
    service: ProjectService = Depends(get_project_service),
    user_id: str | None = Depends(get_current_user_optional),
):
    """List all projects for the current user."""
    try:
        print(f"Listing projects for user: {user_id}")
        return service.list_projects(user_id=user_id)
    except Exception as e:
        print(f"Error in list_projects: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(500, f"Failed to list projects: {str(e)}")


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    service: ProjectService = Depends(get_async_project_service),
    user_id: str | None = Depends(get_current_user_optional),
):
    """Create a new project."""
    return await service.create_project(project_data, user_id=user_id)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
    user_id: str | None = Depends(get_current_user_optional),
):
    """Get a specific project."""
    project = service.get_project(project_id, user_id=user_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_async_project_service),
    user_id: str | None = Depends(get_current_user_optional),
):
    """Delete a project."""
    success = await service.delete_project(project_id, user_id=user_id)
    if not success:
        raise HTTPException(404, "Project not found")
    return {"message": "Project deleted"}


@app.post("/api/projects/{project_id}/check-status")
async def check_project_status(
    project_id: str,
    service: ProjectService = Depends(get_async_project_service),
    user_id: str | None = Depends(get_current_user_optional),
):
    """Check and update project status."""
    status = await service.check_project_status(project_id, user_id=user_id)
    if status is None:
        raise HTTPException(404, "Project not found")
    return {"status": status}


# Project management endpoints
@app.post("/api/projects/sync-all")
async def sync_all_projects(service: ProjectService = Depends(get_project_service)):
    """Sync all project statuses with Fly.io."""
    # Run sync in background to avoid timeout
    asyncio.create_task(_sync_all_projects_task(service))
    return {"message": "Sync started", "status": "processing"}


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


# Background task helpers
async def _sync_all_projects_task(service: ProjectService):
    """Background task to sync all projects."""
    try:
        result = service.sync_all_projects()
        print(f"Sync completed: {result}")
    except Exception as e:
        print(f"Sync failed: {e}")


# Fly.io management endpoints (separate from database)
@app.get("/api/fly/apps")
async def list_fly_apps(service: FlyService = Depends(get_fly_service)):
    """List all apps in the Fly.io organization."""
    try:
        apps = service.list_all_apps()
        return {"apps": apps, "total": len(apps)}
    except Exception as e:
        raise HTTPException(500, f"Failed to list apps: {str(e)}")


@app.delete("/api/fly/apps/delete-all")
async def delete_all_fly_apps(service: FlyService = Depends(get_fly_service)):
    """Delete ALL apps in the Fly.io organization. Nuclear option!"""
    result = service.delete_all_apps()
    return {"message": "Delete all completed", "result": result}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
