from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(title="SaaS Platform API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite's default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple data model
class ProjectCreate(BaseModel):
    name: str

# Add this endpoint after your /health endpoint
@app.post("/api/projects")
async def create_project(project: ProjectCreate):
    # For now, just return mock data
    return {
        "id": "123",
        "name": project.name,
        "url": "https://test-foss-app.fly.dev",
        "status": "running",
        "created_at": datetime.now().isoformat()
    }

@app.get("/api/projects")
async def list_projects():
    # Return some fake projects for testing
    return [
        {
            "id": "123",
            "name": "My Test Project",
            "url": "https://test-foss-app.fly.dev",
            "status": "running"
        }
    ]

@app.get("/")
async def root():
    return {"message": "Welcome to the SaaS Platform API"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
