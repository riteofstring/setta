from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy.orm import Session
import os

# Import from your database.py file
from database import SessionLocal, Project, engine, Base

app = FastAPI(title="SaaS Platform API")

# Create tables if they don't exist
Base.metadata.create_all(bind=engine)

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default port
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

# Keep your existing BaseModel
class ProjectCreate(BaseModel):
    name: str

@app.get("/")
async def root():
    return {"message": "Welcome to the SaaS Platform API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/projects")
async def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    # Create real project in database
    db_project = Project(
        name=project.name,
        url="https://test-foss-app.fly.dev",  # Still hardcoded for now
        status="running"
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    return {
        "id": db_project.id,
        "name": db_project.name,
        "url": db_project.url,
        "status": db_project.status,
        "created_at": db_project.created_at.isoformat()
    }

@app.get("/api/projects")
async def list_projects(db: Session = Depends(get_db)):
    # Get real projects from database
    projects = db.query(Project).all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "url": p.url,
            "status": p.status
        }
        for p in projects
    ]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
