from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session
import time
import re

from database import SessionLocal, Project
from fly_manager import FlyManager

app = FastAPI(title="SaaS Platform API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://*.railway.app"],
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

# Data models
class ProjectCreate(BaseModel):
    name: str

@app.get("/")
async def root():
    return {"message": "Welcome to the SaaS Platform API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/api/projects")
async def list_projects(db: Session = Depends(get_db)):
    """List all projects from database"""
    projects = db.query(Project).all()

    return [
        {
            "id": p.id,
            "name": p.name,
            "url": p.url,
            "status": p.status,
            "created_at": p.created_at.isoformat()
        }
        for p in projects
    ]

@app.post("/api/projects")
async def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db)
):
    """Create a new project and Fly.io container"""

    # Generate a unique app name for Fly.io (must be globally unique)
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
    print(f"Step 1: Creating Fly.io app for project {project.name}")
    fly_app = fly_manager.create_app(app_name)

    if fly_app:
        # Update project with real URL
        project.url = f"https://{fly_app['hostname']}"
        project.status = "created"
        db.commit()

        print(f"Verifying app {app_name} exists...")
        app_status = fly_manager.get_app_status(app_name)

        if app_status:
            print(f"App verified: {app_status}")
            project.url = f"https://{fly_app['hostname']}"

            # Deploy to the app
            if fly_manager.deploy_to_app(app_name):
                project.status = "running"
            else:
                project.status = "deployment_pending"
        else:
            print(f"WARNING: App {app_name} not found after creation!")
            project.status = "dns_pending"
            project.url = f"https://{app_name}.fly.dev (DNS pending)"


        # Now deploy to the app
        print(f"Step 2: Attempting deployment to {app_name}")
        deployment_success = fly_manager.deploy_to_app(app_name)
        print(f"Step 3: Deployment result: {deployment_success}")

        if deployment_success:
            project.status = "running"
            print(f"Step 4: Project {app_name} is now running")
        else:
            project.status = "deployment_pending"
            print(f"Step 4: Project {app_name} deployment failed or pending")
    else:
        # Mark as error if Fly creation failed
        project.status = "error"
        project.url = "Failed to create"
        print(f"ERROR: Failed to create Fly.io app")

    db.commit()
    db.refresh(project)

    return {
        "id": project.id,
        "name": project.name,
        "url": project.url,
        "status": project.status,
        "created_at": project.created_at.isoformat()
    }



@app.delete("/api/projects/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Delete a project and its Fly.io container"""

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")

    # Extract app name from URL if it exists
    if project.url and "fly.dev" in project.url:
        # URL format: https://app-name.fly.dev
        app_name = project.url.split("//")[1].split(".")[0]

        # Try to delete Fly app
        fly_manager.delete_app(app_name)

    # Delete from database
    db.delete(project)
    db.commit()

    return {"message": "Project deleted"}


# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local development
        "https://frontend-production-*.up.railway.app",  # Railway frontend
        "*"  # Allow all origins for now (tighten this later)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
