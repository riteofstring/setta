"""
FastAPI application for SaaS platform.
Simplified with service layer architecture.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config import get_settings
from database import SessionLocal
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService
from services.project_service import ProjectService
from services.websocket_service import get_connection_manager

# Initialize settings
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    # Startup
    print("Starting up...")
    yield
    # Shutdown
    print("Shutting down...")


# Create FastAPI app
app = FastAPI(title=settings.app_name, lifespan=lifespan)

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


async def get_async_db():
    """Get database session for async operations."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    """Get project service instance."""
    return ProjectService(db)


async def get_async_project_service(db: Session = Depends(get_async_db)) -> ProjectService:
    """Get project service instance for async operations."""
    return ProjectService(db)


def get_fly_service() -> FlyService:
    """Get fly service instance."""
    return FlyService()


# Routes
@app.get("/")
async def root():
    """Root endpoint."""
    return {"message": f"Welcome to {settings.app_name}"}


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "environment": settings.environment}


# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates."""
    manager = get_connection_manager()
    await manager.connect(websocket)

    try:
        while True:
            # Keep connection alive and handle any incoming messages
            data = await websocket.receive_text()
            # Could handle ping/pong or other client messages here if needed
            print(f"Received from client: {data}")
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        print(f"Client disconnected. Active connections: {manager.get_connection_count()}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await manager.disconnect(websocket)


@app.get("/api/projects", response_model=list[ProjectResponse])
async def list_projects(service: ProjectService = Depends(get_project_service)):
    """List all projects."""
    return service.list_projects()


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate, service: ProjectService = Depends(get_async_project_service)
):
    """Create a new project."""
    return await service.create_project(project_data)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, service: ProjectService = Depends(get_project_service)):
    """Get a specific project."""
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str, service: ProjectService = Depends(get_async_project_service)
):
    """Delete a project."""
    success = await service.delete_project(project_id)
    if not success:
        raise HTTPException(404, "Project not found")
    return {"message": "Project deleted"}


@app.post("/api/projects/{project_id}/check-status")
async def check_project_status(
    project_id: str, service: ProjectService = Depends(get_async_project_service)
):
    """Check and update project status."""
    status = await service.check_project_status(project_id)
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
    try:
        result = service.delete_all_apps()
        return {"message": "Delete all Fly.io apps completed", "result": result}
    except Exception as e:
        raise HTTPException(500, f"Failed to delete all apps: {str(e)}")


# WebSocket status endpoint
@app.get("/api/ws/status")
async def websocket_status():
    """Get WebSocket connection status."""
    manager = get_connection_manager()
    return {
        "active_connections": manager.get_connection_count(),
        "status": "active",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
