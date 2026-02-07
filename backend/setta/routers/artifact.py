import fnmatch
import mimetypes
import os
import stat
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, NotRequired, TypedDict, TypeVar

from fastapi import HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from setta.auth.session import load_current_session_secret
from setta.binary import BinaryStore
from setta.project_state.artifacts import (
    Artifacts,
    ArtifactSaveResult,
    SaveConflictStrategy,
)
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.share.policy import ensure_share_deployment_path
from setta.types.artifact import (
    ArtifactType,
    BrushStrokeArtifact,
    ChartDataArtifact,
    DrawAreaLayerItemTransformArtifact,
    FileArtifact,
    ImageArtifact,
    create_file_artifact_id,
)
from setta.types.generated.unions import BaseArtifactUnion
from setta.types.routes import Route
from setta.utils.attachment_policy import (
    enforce_upload_policy,
    get_attachment_policy,
    resolve_attachment_policy_scope,
)
from setta.utils.attachment_tokens import AttachmentTokenManager
from setta.utils.constants import C
from setta.utils.paths import get_setta_paths, normalize_workspace_path

router = SettaAPIRouter()
TArtifact = TypeVar("TArtifact")

DEFAULT_FILE_BROWSER_IGNORE_PATTERNS = [
    ".git",
    "node_modules",
    ".venv",
    "dist",
    "build",
    "__pycache__",
    "setta_files",
]
DEFAULT_FILE_BROWSER_MAX_ENTRIES = 5000
_FILE_BROWSER_TOKEN_MANAGER = AttachmentTokenManager(
    C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS
)


class CheckIfFileExistsRequests(BaseModel):
    filepath: str


class GetFileBrowserRootResponse(BaseModel):
    rootPath: str
    pathSeparator: str
    ignorePatterns: list[str]


class GetFolderContentsRequest(BaseModel):
    folderPath: str
    includeMtime: bool = False
    includeSize: bool = False
    includeHidden: bool = False
    ignorePatterns: list[str] | None = None
    maxEntries: int | None = Field(default=None, gt=0)


class GetFileBrowserDownloadUrlsRequest(BaseModel):
    paths: list[str]


class FileBrowserDownloadUrlEntry(BaseModel):
    path: str
    url: str
    expiresAt: int


class FolderContentItem(TypedDict):
    name: str
    type: str
    fullPath: str
    mtime: NotRequired[float]
    size: NotRequired[int]


class LoadCachedPathsRequest(BaseModel):
    paths: list[str]


class UpdateArtifactsRequest(BaseModel):
    artifacts: list[BaseArtifactUnion]
    conflictStrategy: SaveConflictStrategy | None = None
    uploadScope: Literal["chat", "generic"]


class ImportFilesToArtifactsRequest(BaseModel):
    paths: list[str]
    uploadScope: Literal["chat", "generic"]


class ImportFilesToArtifactsResponseItem(BaseModel):
    kind: Literal["file"] = "file"
    id: str
    name: str
    mimeType: str
    size: int


class DeleteArtifactRequestItem(BaseModel):
    id: str
    type: ArtifactType


class DeleteArtifactsRequest(BaseModel):
    artifacts: list[DeleteArtifactRequestItem]


def _get_share_session_artifacts(
    ctx: RuntimeContextFromRequest,
):
    return ctx.state.share_runtime_state.get_session_artifacts(ctx.session_id)


def _get_artifacts(ctx: RuntimeContextFromRequest):
    if ctx.share_mode:
        return _get_share_session_artifacts(ctx)
    return ctx.state.artifacts


def _load_share_cached_artifact(
    path: str,
    deployment_root: Path | None,
    get_cached: Callable[[Path | str], TArtifact | None],
    read_from_disk: Callable[[Path], TArtifact],
) -> TArtifact | None:
    cached = get_cached(path)
    if cached is not None:
        return cached
    resolved = ensure_share_deployment_path(path, deployment_root)
    if not resolved.exists():
        return None
    return read_from_disk(resolved)


def _load_share_cached_image(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> ImageArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_image,
        artifacts.read_image_from_disk,
    )


def _load_share_cached_chart_data(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> ChartDataArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_chart_data,
        artifacts.read_chart_data_from_disk,
    )


def _load_share_cached_brush_stroke(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> BrushStrokeArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_brush_stroke,
        artifacts.read_brush_stroke_from_disk,
    )


def _load_share_cached_transform(
    artifacts: Artifacts, path: str, deployment_root: Path | None
) -> DrawAreaLayerItemTransformArtifact | None:
    return _load_share_cached_artifact(
        path,
        deployment_root,
        artifacts.get_cached_draw_area_layer_item_transform,
        artifacts.read_transform_from_disk,
    )


def _resolve_folder_path(
    folder_path: str,
    *,
    share_mode: bool,
    deployment_root: Path | None,
) -> Path:
    if share_mode:
        return ensure_share_deployment_path(folder_path, deployment_root)
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(folder_path, workspace_root=workspace_root)
    if not resolved.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Folder path must be within the project root.",
        )
    return resolved


def _resolve_file_path(path_str: str) -> Path:
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(path_str, workspace_root=workspace_root)
    if not resolved.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File path must be within the project root.",
        )
    return resolved


def _resolve_file_path_for_download(path_str: str) -> Path | None:
    trimmed = path_str.strip()
    if not trimmed:
        return None
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(trimmed, workspace_root=workspace_root)
    if not resolved.is_relative_to(workspace_root):
        return None
    if not resolved.exists() or resolved.is_dir():
        return None
    return resolved


def _format_browser_path(path: Path, *, share_mode: bool) -> str:
    if share_mode:
        return str(path.resolve())
    return str(normalize_workspace_path(path))


def _should_ignore(name: str, ignore_patterns: list[str]) -> bool:
    for pattern in ignore_patterns:
        if fnmatch.fnmatch(name, pattern):
            return True
    return False


def _require_session_secret() -> bytes:
    session_info = load_current_session_secret()
    if session_info is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File browser token secret unavailable.",
        )
    return session_info[1]


def _build_file_browser_download_url(token: str) -> str:
    path = Route.FILE_BROWSER_DOWNLOAD.value.replace("{token}", token)
    return f"{C.BACKEND}{Route.PREFIX.value}{path}"


@router.post(Route.CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(
    x: CheckIfFileExistsRequests, ctx: RuntimeContextFromRequest
) -> bool:
    if ctx.share_mode:
        target_path = ensure_share_deployment_path(x.filepath, ctx.deployment_root)
        return target_path.exists()
    raw_path = x.filepath.strip()
    if not raw_path:
        return False
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(raw_path, workspace_root=workspace_root)
    if not resolved.is_relative_to(workspace_root):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File path must be within the project root.",
        )
    return resolved.exists()


@router.post(Route.GET_FILE_BROWSER_ROOT)
def route_get_file_browser_root(
    ctx: RuntimeContextFromRequest,
) -> GetFileBrowserRootResponse:
    if ctx.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in share mode.",
        )
    return GetFileBrowserRootResponse(
        rootPath=str(get_setta_paths().workspace_root),
        pathSeparator=os.sep,
        ignorePatterns=list(DEFAULT_FILE_BROWSER_IGNORE_PATTERNS),
    )


@router.post(Route.GET_FOLDER_CONTENTS)
def route_get_folder_contents(
    x: GetFolderContentsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[FolderContentItem]:
    if ctx.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in share mode.",
        )
    path = _resolve_folder_path(
        x.folderPath,
        share_mode=ctx.share_mode,
        deployment_root=ctx.deployment_root,
    )

    # Check if path exists and is a directory
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Path does not exist: {x.folderPath}",
        )
    if not path.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path is not a directory: {x.folderPath}",
        )

    ignore_patterns = (
        x.ignorePatterns
        if x.ignorePatterns is not None
        else DEFAULT_FILE_BROWSER_IGNORE_PATTERNS
    )
    max_entries = (
        x.maxEntries if x.maxEntries is not None else DEFAULT_FILE_BROWSER_MAX_ENTRIES
    )

    contents: list[FolderContentItem] = []
    include_hidden = x.includeHidden
    include_mtime = x.includeMtime
    include_size = x.includeSize

    for item in path.iterdir():
        if not include_hidden and item.name.startswith("."):
            continue
        if _should_ignore(item.name, ignore_patterns):
            continue
        stat_result = None
        if include_mtime or include_size:
            stat_result = item.stat()
        if stat_result is None:
            is_dir = item.is_dir()
        else:
            is_dir = stat.S_ISDIR(stat_result.st_mode)
        entry: FolderContentItem = {
            "name": item.name,
            "type": "folder" if is_dir else "file",
            "fullPath": _format_browser_path(item, share_mode=ctx.share_mode),
        }
        if stat_result is not None:
            if include_mtime:
                entry["mtime"] = stat_result.st_mtime
            if include_size:
                entry["size"] = stat_result.st_size
        contents.append(entry)
        if len(contents) >= max_entries:
            break

    contents.sort(
        key=lambda entry: (
            0 if entry["type"] == "folder" else 1,
            entry["name"].lower(),
        )
    )

    return contents


@router.post(Route.GET_FILE_BROWSER_DOWNLOAD_URLS)
def route_get_file_browser_download_urls(
    x: GetFileBrowserDownloadUrlsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[FileBrowserDownloadUrlEntry]:
    if ctx.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in share mode.",
        )
    if not x.paths:
        return []
    secret = _require_session_secret()
    now = datetime.now(timezone.utc)
    expires_at = int(now.timestamp()) + C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS
    entries: list[FileBrowserDownloadUrlEntry] = []
    for raw_path in x.paths:
        resolved = _resolve_file_path_for_download(raw_path)
        if resolved is None:
            continue
        normalized = _format_browser_path(resolved, share_mode=ctx.share_mode)
        token = _FILE_BROWSER_TOKEN_MANAGER.mint(
            artifact_id=normalized,
            secret=secret,
            now=now,
        )
        entries.append(
            FileBrowserDownloadUrlEntry(
                path=normalized,
                url=_build_file_browser_download_url(token),
                expiresAt=expires_at,
            )
        )
    return entries


@router.get(Route.FILE_BROWSER_DOWNLOAD)
def route_file_browser_download(
    token: str,
    ctx: RuntimeContextFromRequest,
):
    if ctx.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in share mode.",
        )
    secret = _require_session_secret()
    try:
        payload = _FILE_BROWSER_TOKEN_MANAGER.validate(token, secret=secret)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired file browser token.",
        ) from exc
    resolved = _resolve_file_path(payload.artifactId)
    if not resolved.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found.",
        )
    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File path is not a file.",
        )
    mime_type, _ = mimetypes.guess_type(resolved.as_posix())
    media_type = mime_type or "application/octet-stream"
    return FileResponse(resolved, media_type=media_type)


@router.post(Route.IMPORT_FILES_TO_ARTIFACTS)
async def route_import_files_to_artifacts(
    x: ImportFilesToArtifactsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ImportFilesToArtifactsResponseItem]:
    if ctx.share_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in share mode.",
        )
    if not x.paths:
        return []
    upload_scope = x.uploadScope
    policy_scope = resolve_attachment_policy_scope(upload_scope)
    policy = get_attachment_policy(policy_scope)
    artifacts = _get_artifacts(ctx)
    binary_store = BinaryStore.from_dbe(ctx.state.dbe)
    updates: list[FileArtifact] = []
    results: list[ImportFilesToArtifactsResponseItem] = []
    for raw_path in x.paths:
        resolved = _resolve_file_path(raw_path)
        if not resolved.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"File does not exist: {raw_path}",
            )
        if not resolved.is_file():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Path is not a file: {raw_path}",
            )
        try:
            size = resolved.stat().st_size
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to stat file: {raw_path}",
            ) from exc
        mime_type, _ = mimetypes.guess_type(resolved.name)
        resolved_mime = mime_type or "application/octet-stream"
        enforce_upload_policy(
            file_size=size,
            mime_type=resolved_mime,
            scope=policy_scope,
            label=resolved.name,
            policy=policy,
        )
        try:
            content = resolved.read_bytes()
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read file: {raw_path}",
            ) from exc
        extension = "".join(resolved.suffixes) or ".bin"
        artifact_id = create_file_artifact_id(extension)
        ref = binary_store.store_bytes(
            content,
            mime_type=resolved_mime,
            durable=True,
        )
        updates.append(
            FileArtifact(
                id=artifact_id,
                value=ref,
            )
        )
        results.append(
            ImportFilesToArtifactsResponseItem(
                id=artifact_id,
                name=resolved.name,
                mimeType=resolved_mime,
                size=len(content),
            )
        )
    if updates:
        await artifacts.apply_updates(updates, SaveConflictStrategy.overwrite)
    return results


@router.post(Route.LOAD_CACHED_IMAGE_ARTIFACTS)
def route_load_cached_image_artifacts(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ImageArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_image(artifacts, i, ctx.deployment_root) for i in x.paths
        ]
    return [artifacts.get_cached_image(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_CHART_DATA)
def route_load_cached_chart_data(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ChartDataArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_chart_data(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_chart_data(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_BRUSH_STROKES)
def route_load_cached_brush_strokes(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[BrushStrokeArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_brush_stroke(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_brush_stroke(i) for i in x.paths]


@router.post(Route.LOAD_CACHED_DRAW_AREA_LAYER_ITEM_TRANFORM)
def route_load_cached_draw_area_layer_item_transform(
    x: LoadCachedPathsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[DrawAreaLayerItemTransformArtifact | None]:
    artifacts = _get_artifacts(ctx)
    if ctx.share_mode:
        return [
            _load_share_cached_transform(artifacts, i, ctx.deployment_root)
            for i in x.paths
        ]
    return [artifacts.get_cached_draw_area_layer_item_transform(i) for i in x.paths]


@router.post(Route.UPDATE_ARTIFACTS)
async def route_update_artifacts(
    x: UpdateArtifactsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[ArtifactSaveResult]:
    upload_scope = x.uploadScope
    policy_scope = resolve_attachment_policy_scope(upload_scope)
    policy = get_attachment_policy(policy_scope)
    for artifact in x.artifacts:
        if isinstance(artifact, FileArtifact):
            mime_type, _ = mimetypes.guess_type(artifact.id)
            resolved_mime = mime_type or "application/octet-stream"
            enforce_upload_policy(
                file_size=artifact.value.byteLength,
                mime_type=resolved_mime,
                scope=policy_scope,
                label=artifact.id,
                policy=policy,
            )
    if ctx.share_mode:
        session_id = ctx.session_id
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
        )
        artifacts = ctx.state.share_runtime_state.get_session_artifacts(session_id)
        results: list[ArtifactSaveResult] = []
        payloads: list[BaseArtifactUnion] = []
        for artifact in x.artifacts:
            normalized_id = artifacts.normalize_artifact_id(artifact.id)
            if normalized_id != artifact.id:
                artifact = artifact.model_copy(update={"id": normalized_id})
            artifacts.cache_artifact_in_memory(
                artifact,
                compute_last_read_hash=False,
                reset_conflict=True,
            )
            if not isinstance(artifact, FileArtifact):
                payloads.append(artifact)
            results.append(
                ArtifactSaveResult(
                    id=normalized_id,
                    type=artifact.type,
                    status="saved",
                )
            )
        if payloads:
            await ctx.state.wmh_frontend_sender.broadcast_artifacts_update(
                artifacts=payloads,
                updateType="update",
                share_session_id=session_id,
            )
        return results
    artifacts = _get_artifacts(ctx)
    conflict_strategy = x.conflictStrategy or SaveConflictStrategy.backup
    results = await artifacts.apply_updates(x.artifacts, conflict_strategy)
    return results


@router.post(Route.DELETE_ARTIFACTS)
async def route_delete_artifacts(
    x: DeleteArtifactsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[str]:
    if not x.artifacts:
        return []
    for artifact in x.artifacts:
        if artifact.type is not ArtifactType.File:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "DELETE_ARTIFACTS only supports File artifacts; "
                    f"received {artifact.type.value}."
                ),
            )
    artifact_ids = [artifact.id for artifact in x.artifacts]
    if ctx.share_mode:
        await ctx.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
        )
        if ctx.deployment_root is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Share deployment root is not available.",
            )
        artifacts_root = (ctx.deployment_root / "artifacts").resolve()
        artifacts = ctx.state.share_runtime_state.get_session_artifacts(ctx.session_id)
    else:
        artifacts_root = C.ARTIFACTS_FOLDER.resolve()
        artifacts = _get_artifacts(ctx)
    try:
        deleted_ids = artifacts.delete_file_artifacts(
            artifact_ids, artifacts_root=artifacts_root
        )
    except PermissionError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to delete artifact: {exc}",
        ) from exc

    return deleted_ids
