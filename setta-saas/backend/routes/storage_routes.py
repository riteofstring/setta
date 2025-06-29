"""
Storage API routes
"""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from middleware import CurrentUser
from services import storage_service

router = APIRouter(prefix="/api/storage", tags=["storage"])


class FileUploadResponse(BaseModel):
    success: bool
    path: str
    message: str


class FileListResponse(BaseModel):
    files: list[dict]
    count: int


class PresignedUrlResponse(BaseModel):
    url: str
    fields: dict | None = None


@router.post("/projects/{project_id}/upload")
async def upload_file(
    project_id: str,
    file: UploadFile = File(...),
    path: str | None = None,
    current_user: CurrentUser = Depends(),
):
    """Upload file to user's project"""
    if not file.filename:
        raise HTTPException(400, "No filename provided")

    # Use provided path or default to filename
    file_path = path or file.filename

    # Read file content
    content = await file.read()

    if not content:
        raise HTTPException(400, "Empty file")

    # Save to storage
    success = storage_service.save_file(current_user.id, project_id, file_path, content)

    if not success:
        raise HTTPException(500, "Failed to save file")

    return FileUploadResponse(success=True, path=file_path, message="File uploaded successfully")


@router.get("/projects/{project_id}/files")
async def list_files(project_id: str, current_user: CurrentUser = Depends()):
    """List all files in a project"""
    files = storage_service.list_files(current_user.id, project_id)
    return FileListResponse(files=files, count=len(files))


@router.get("/projects/{project_id}/download/{file_path:path}")
async def get_download_url(project_id: str, file_path: str, current_user: CurrentUser = Depends()):
    """Get download URL for a file"""
    url = storage_service.get_download_url(current_user.id, project_id, file_path)

    if not url:
        raise HTTPException(404, "File not found")

    return {"url": url}


@router.delete("/projects/{project_id}/files/{file_path:path}")
async def delete_file(project_id: str, file_path: str, current_user: CurrentUser = Depends()):
    """Delete a file"""
    success = storage_service.delete_file(current_user.id, project_id, file_path)

    if not success:
        raise HTTPException(404, "File not found")

    return {"success": True, "message": "File deleted"}


@router.delete("/projects/{project_id}/all-files")
async def delete_project_files(project_id: str, current_user: CurrentUser = Depends()):
    """Delete all files in a project"""
    success = storage_service.delete_project(current_user.id, project_id)

    if not success:
        raise HTTPException(500, "Failed to delete project files")

    return {"success": True, "message": "All project files deleted"}


@router.post("/projects/{project_id}/upload-url")
async def get_upload_url(project_id: str, file_path: str, current_user: CurrentUser = Depends()):
    """Get presigned URL for direct browser upload"""
    if not file_path:
        raise HTTPException(400, "file_path is required")

    result = storage_service.get_upload_url(current_user.id, project_id, file_path)

    if not result:
        raise HTTPException(500, "Failed to generate upload URL")

    return PresignedUrlResponse(url=result["url"], fields=result["fields"])
