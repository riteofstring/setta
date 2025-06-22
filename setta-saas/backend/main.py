"""
FastAPI application for SaaS platform.
Simplified with service layer architecture.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from config import get_settings
from database import SessionLocal
from middleware import CurrentUser
from models.project import ProjectCreate, ProjectResponse
from services.fly_service import FlyService
from services.project_service import ProjectService
from services.websocket_service import get_connection_manager

# Initialize settings
settings = get_settings()


async def check_machine_states_once():
    """Check machine states once and return result."""
    db = SessionLocal()
    try:
        service = ProjectService(db)
        return await service.check_all_machine_states()
    finally:
        db.close()


async def periodic_machine_state_check():
    """Periodically check machine states for all projects."""
    while True:
        try:
            await asyncio.sleep(60)
            result = await check_machine_states_once()
            print(f"Machine state check: {result}")
        except asyncio.CancelledError:
            print("Stopping periodic machine state checks")
            break
        except Exception as e:
            print(f"Error in periodic machine state check: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    print("Starting up...")

    # Start background task for checking machine states
    task = asyncio.create_task(periodic_machine_state_check())

    yield

    print("Shutting down...")
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


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
    print(f"New WebSocket connected. Total connections: {manager.get_connection_count()}")

    try:
        while True:
            data = await websocket.receive_text()
            print(f"Received from client: {data}")

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                print(f"Received non-JSON message: {data}")
                continue

            # Handle ping messages
            if message.get("type") != "ping":
                continue

            pong_response = {
                "type": "pong",
                "data": message.get("data", ""),
                "timestamp": datetime.utcnow().isoformat(),
            }
            await websocket.send_text(json.dumps(pong_response))
            print("Sent pong response")

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        print(f"Client disconnected. Active connections: {manager.get_connection_count()}")
    except Exception as e:
        print(f"WebSocket error: {e}")
        await manager.disconnect(websocket)


async def check_project_machine_states(projects: list[ProjectResponse], service: ProjectService):
    """Check machine states for a list of projects."""
    for project in projects:
        # Skip if not running or no machine ID
        if project.status != "running":
            continue
        if not project.machine_id:
            continue

        try:
            await service.check_machine_state(project.id)
        except Exception as e:
            print(f"Failed to check machine state for {project.id}: {e}")


@app.get("/api/projects", response_model=list[ProjectResponse])
async def list_projects(
    user_id: str = CurrentUser, service: ProjectService = Depends(get_async_project_service)
):
    """List all projects for the authenticated user."""
    # Get projects
    projects = service.list_user_projects(user_id)

    # Check machine states
    await check_project_machine_states(projects, service)

    # Return updated project list
    return service.list_user_projects(user_id)


@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Create a new project for the authenticated user."""
    return await service.create_project(project_data, user_id)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_project_service),
):
    """Get a specific project if owned by the authenticated user."""
    project = service.get_project(project_id, user_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Delete a project if owned by the authenticated user."""
    success = await service.delete_project(project_id, user_id)
    if not success:
        raise HTTPException(404, "Project not found or not authorized")
    return {"message": "Project deleted"}


@app.post("/api/projects/{project_id}/check-status")
async def check_project_status(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Check and update project status if owned by the authenticated user."""
    status = await service.check_project_status(project_id, user_id)
    if status is None:
        raise HTTPException(404, "Project not found or not authorized")
    return {"status": status}


@app.post("/api/projects/{project_id}/check-machine-state")
async def check_project_machine_state(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Check and update machine state for a specific project."""
    # Get the project to verify ownership
    project = service.get_project(project_id, user_id)
    if not project:
        raise HTTPException(404, "Project not found or not authorized")

    # Check machine state
    state = await service.check_machine_state(project_id)
    if state is None:
        return {"message": "No machine state available", "state": None}

    return {"state": state, "project_id": project_id}


@app.post("/api/projects/check-all-machine-states")
async def check_all_machine_states(
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Check machine states for all user's projects."""
    result = await service.check_all_machine_states()
    return {"message": "Machine state check completed", "result": result}


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


# User endpoints
@app.get("/api/me")
async def get_current_user(user_id: str = CurrentUser):
    """Get current user info."""
    return {"user_id": user_id}


if __name__ == "__main__":
    import os

    import uvicorn

    # Railway provides PORT env variable
    port = int(os.getenv("PORT", "8000"))

    # For production (Railway), disable reload
    is_production = os.getenv("ENVIRONMENT", "development") == "production"

    uvicorn.run(
        "main:app",
        host="0.0.0.0",  # Important for Railway
        port=port,
        reload=not is_production,  # Disable reload in production
    )
