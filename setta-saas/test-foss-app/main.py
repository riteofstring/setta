from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/")
async def root():
    app_name = os.getenv("FLY_APP_NAME", "local")
    return {"message": f"Test FOSS App Instance: {app_name}"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
