from pathlib import Path

from fastapi import HTTPException, status
from pydantic import BaseModel

from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.generate_new_filename import generate_new_filename
from setta.utils.paths import get_setta_paths, normalize_workspace_path

router = SettaAPIRouter()


class NewJSONVersionNameRequest(BaseModel):
    filename: str


class CreateFileRequest(BaseModel):
    filepath: str


class GetJSONSourcePathToBeDeleted(BaseModel):
    variantName: str


@router.post(Route.NEW_JSON_VERSION_NAME)
def route_new_json_version_name(
    x: NewJSONVersionNameRequest, ctx: RuntimeContextFromRequest
):
    ctx.require_ide_mode("Share mode does not allow creating JSON source files.")
    raw_pattern = x.filename.strip()
    if not raw_pattern:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing filename.",
        )
    workspace_root = get_setta_paths().workspace_root
    resolved_pattern = normalize_workspace_path(
        raw_pattern, workspace_root=workspace_root
    )
    if not resolved_pattern.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Filename must be within the project root.",
        )

    new_filename = generate_new_filename(str(resolved_pattern))
    target_path = Path(new_filename).resolve(strict=False)
    if not target_path.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Resolved filename must be within the project root.",
        )
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()

    if Path(raw_pattern).is_absolute():
        return str(target_path)
    return str(target_path.relative_to(workspace_root))


@router.post(Route.CREATE_FILE)
def route_create_file(x: CreateFileRequest, ctx: RuntimeContextFromRequest):
    ctx.require_ide_mode("Share mode does not allow creating files.")
    raw_path = x.filepath.strip()
    if not raw_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing filepath.",
        )
    workspace_root = get_setta_paths().workspace_root
    target_path = normalize_workspace_path(raw_path, workspace_root=workspace_root)
    if not target_path.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File path must be within the project root.",
        )
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.touch()


@router.post(Route.GET_JSON_SOURCE_PATH_TO_BE_DELETED)
def route_get_json_source_path_to_be_deleted(
    x: GetJSONSourcePathToBeDeleted, ctx: RuntimeContextFromRequest
) -> str:
    ctx.require_ide_mode("Share mode does not allow resolving JSON source paths.")
    raw_path = x.variantName.strip()
    if not raw_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing variantName.",
        )
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(raw_path, workspace_root=workspace_root)
    if not resolved.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="JSON source path must be within the project root.",
        )
    return str(resolved)
