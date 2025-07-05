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
from database import Project, SessionLocal
from middleware import CurrentUser
from models.project import ProjectCreate, ProjectResponse
from routes import storage_router
from services.fly_service import FlyService
from services.project_service import ProjectService
from services.websocket_service import get_connection_manager
from utils.storage_init import init_storage

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


def check_fly_config():
    """Check Fly.io configuration on startup."""
    print("\n=== Checking Fly.io Configuration ===")

    if not settings.fly_api_token:
        print("❌ ERROR: FLY_API_TOKEN not set!")
        return False

    print(f"✓ FLY_API_TOKEN: {'*' * 10}{settings.fly_api_token[-6:]}")
    print(f"✓ FLY_ORG_SLUG: {settings.fly_org_slug}")

    # Test Fly.io connection
    try:
        fly_service = FlyService()
        apps = fly_service.list_all_apps()
        print(f"✓ Connected to Fly.io - found {len(apps)} existing apps")
        return True
    except Exception as e:
        print(f"❌ Failed to connect to Fly.io: {e}")
        return False


def check_storage_config():
    """Check storage configuration on startup."""
    print("\n=== Checking Storage Configuration ===")

    if not settings.storage_access_key or not settings.storage_secret_key:
        print("⚠ Storage not configured (optional)")
        return False

    print("✓ Storage provider: R2")
    print(f"✓ Bucket: {settings.storage_bucket_name}")
    print(f"✓ Endpoint: {settings.r2_endpoint}")
    return True


def check_clerk_config():
    """Check Clerk configuration on startup."""
    print("\n=== Checking Clerk Configuration ===")

    if not settings.clerk_jwt_public_key:
        print("❌ ERROR: CLERK_JWT_PUBLIC_KEY not set!")
        return False

    print(f"✓ CLERK_JWT_PUBLIC_KEY: Set ({len(settings.clerk_jwt_public_key)} chars)")

    if settings.clerk_api_key:
        print("✓ CLERK_API_KEY: Set (optional)")
    else:
        print("⚠ CLERK_API_KEY: Not set (optional)")

    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan."""
    print("\n" + "=" * 50)
    print(f"Starting {settings.app_name}...")
    print(f"Environment: {settings.environment}")
    print("=" * 50)

    # Run configuration checks
    fly_ok = check_fly_config()
    storage_ok = check_storage_config()
    clerk_ok = check_clerk_config()

    print("\n=== Configuration Summary ===")
    print(f"Fly.io: {'✓' if fly_ok else '❌'}")
    print(f"Storage: {'✓' if storage_ok else '⚠'}")
    print(f"Clerk: {'✓' if clerk_ok else '❌'}")

    if not fly_ok or not clerk_ok:
        print("\n❌ CRITICAL: Required configuration missing!")
        print("Please check your environment variables.")

    # Initialize storage
    if storage_ok:
        init_storage()

    # Start background task for checking machine states
    task = asyncio.create_task(periodic_machine_state_check())

    print("\n✓ Application started successfully!")
    print("=" * 50 + "\n")

    yield

    print("\nShutting down...")
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
    print(f"[WS] New WebSocket connected. Total connections: {manager.get_connection_count()}")

    try:
        while True:
            data = await websocket.receive_text()
            print(f"[WS] Received from client: {data}")

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                print(f"[WS] Received non-JSON message: {data}")
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
            print("[WS] Sent pong response")

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
        print(f"[WS] Client disconnected. Active connections: {manager.get_connection_count()}")
    except Exception as e:
        print(f"[WS] WebSocket error: {e}")
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
    print(f"\n[API] Creating project: {project_data.name} for user: {user_id}")
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


@app.post("/api/projects/{project_id}/machine/start")
async def start_project_machine(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Start (wake up) a hibernated project machine."""
    # Verify ownership
    project = service.get_project(project_id, user_id)
    if not project:
        raise HTTPException(404, "Project not found or not authorized")

    if not project.machine_id:
        raise HTTPException(400, "Project has no machine")

    # Extract app name from URL
    if not project.url or "fly.dev" not in project.url:
        raise HTTPException(400, "Invalid project URL")

    app_name = project.url.split("//")[1].split(".")[0]

    # Start the machine
    try:
        from fly.deployment import start_machine

        success = await asyncio.to_thread(
            start_machine, service.fly.client, app_name, project.machine_id
        )

        if not success:
            raise HTTPException(500, "Failed to start machine")

        # Update state
        project = service.db.query(Project).filter(Project.id == project_id).first()
        project.machine_state = "starting"
        service.db.commit()

        # Check state after a moment
        await asyncio.sleep(2)
        await service.check_machine_state(project_id)

        return {"message": "Machine start requested", "status": "starting"}

    except Exception as e:
        print(f"Error starting machine: {e}")
        raise HTTPException(500, f"Failed to start machine: {str(e)}")


@app.post("/api/projects/{project_id}/machine/stop")
async def stop_project_machine(
    project_id: str,
    user_id: str = CurrentUser,
    service: ProjectService = Depends(get_async_project_service),
):
    """Stop (hibernate) a running project machine."""
    # Verify ownership
    project = service.get_project(project_id, user_id)
    if not project:
        raise HTTPException(404, "Project not found or not authorized")

    if not project.machine_id:
        raise HTTPException(400, "Project has no machine")

    # Extract app name from URL
    if not project.url or "fly.dev" not in project.url:
        raise HTTPException(400, "Invalid project URL")

    app_name = project.url.split("//")[1].split(".")[0]

    # Stop the machine
    try:
        from fly.deployment import stop_machine

        success = await asyncio.to_thread(
            stop_machine, service.fly.client, app_name, project.machine_id
        )

        if not success:
            raise HTTPException(500, "Failed to stop machine")

        # Update state
        project = service.db.query(Project).filter(Project.id == project_id).first()
        project.machine_state = "stopping"
        service.db.commit()

        # Check state after a moment
        await asyncio.sleep(2)
        await service.check_machine_state(project_id)

        return {"message": "Machine stop requested", "status": "stopping"}

    except Exception as e:
        print(f"Error stopping machine: {e}")
        raise HTTPException(500, f"Failed to stop machine: {str(e)}")


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


# Include routers
app.include_router(storage_router)


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
