from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import routers
from app.routers import llm

# Create FastAPI app
app = FastAPI(
    title="Setta API",
    description="API for Setta Project",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development - restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(llm.router, prefix="/api", tags=["LLM"])


# Root endpoint
@app.get("/")
async def root():
    return {"message": "Welcome to Setta API"}
