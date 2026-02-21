import fnmatch
import mimetypes
import os
import shutil
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
from setta.utils.paths import (
    ensure_within_workspace_root,
    get_setta_paths,
    normalize_workspace_path,
)

router = SettaAPIRouter()
TArtifact = TypeVar("TArtifact")

DEFAULT_FILE_BROWSER_IGNORE_PATTERNS = [
    ".git",
    "node_modules",
    ".venv",
    "dist",
    "build",
    "__pycache__",
]
DEFAULT_FILE_BROWSER_MAX_ENTRIES = 5000
DEFAULT_FILE_BROWSER_MAX_FILE_CONTENT_BYTES = 10 * 1024 * 1024
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
    includeSettaInitialized: bool = False
    ignorePatterns: list[str] | None = None
    maxEntries: int | None = Field(default=None, gt=0)
    missingFolderBehavior: Literal["error", "empty"] = "error"


class GetFileBrowserDownloadUrlsRequest(BaseModel):
    paths: list[str]


class FileBrowserDownloadUrlEntry(BaseModel):
    path: str
    url: str
    expiresAt: int


class GetFileBrowserFileContentRequest(BaseModel):
    path: str
    maxBytes: int | None = Field(default=None, gt=0)


class FileBrowserFileContentResponse(BaseModel):
    path: str
    mimeType: str
    contentId: str
    mtimeNs: int
    size: int


class GetFileBrowserFileStatRequest(BaseModel):
    path: str


class FileBrowserFileStatResponse(BaseModel):
    path: str
    mtimeNs: int
    size: int


class WriteFileBrowserFileContentRequest(BaseModel):
    path: str
    contentId: str
    expectedMtimeNs: int | None = None


class WriteFileBrowserFileContentResponse(BaseModel):
    path: str
    mimeType: str
    mtimeNs: int
    size: int


class TransferFileBrowserEntryRequest(BaseModel):
    sourcePath: str
    destinationFolderPath: str
    operation: Literal["copy", "move"]


class TransferFileBrowserEntryResponse(BaseModel):
    sourcePath: str
    destinationPath: str
    operation: Literal["copy", "move"]


class FolderContentItem(TypedDict):
    name: str
    type: str
    fullPath: str
    mtime: NotRequired[float]
    size: NotRequired[int]
    isSettaInitialized: NotRequired[bool]


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
    if ctx.deployment_mode:
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
    try:
        return ensure_within_workspace_root(
            resolved, label="Folder path", workspace_root=workspace_root
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


def _resolve_file_path(path_str: str) -> Path:
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(path_str, workspace_root=workspace_root)
    try:
        return ensure_within_workspace_root(
            resolved, label="File path", workspace_root=workspace_root
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc


def _resolve_file_path_for_download(path_str: str) -> Path | None:
    trimmed = path_str.strip()
    if not trimmed:
        return None
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(trimmed, workspace_root=workspace_root)
    try:
        resolved = ensure_within_workspace_root(
            resolved, label="File path", workspace_root=workspace_root
        )
    except ValueError:
        return None
    if not resolved.exists() or resolved.is_dir():
        return None
    return resolved


def _resolve_file_path_for_edit(path_str: str, *, allow_missing: bool = False) -> Path:
    resolved = _resolve_file_path(path_str)
    if not resolved.exists():
        if allow_missing:
            return resolved
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File does not exist: {path_str}",
        )
    if not resolved.is_file():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path is not a file: {path_str}",
        )
    return resolved


def _resolve_workspace_entry_path(path_str: str) -> Path:
    resolved = _resolve_file_path(path_str)
    if not resolved.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Path does not exist: {path_str}",
        )
    return resolved


def _format_browser_path(path: Path, *, share_mode: bool) -> str:
    if share_mode:
        return str(path.resolve())
    return str(normalize_workspace_path(path))


def _build_copy_candidate_name(source_name: str, attempt: int) -> str:
    has_only_leading_dot = source_name.startswith(".") and "." not in source_name[1:]
    if has_only_leading_dot:
        suffix = ""
        base_name = source_name
    else:
        source_path = Path(source_name)
        suffix = "".join(source_path.suffixes)
        base_name = source_name[: -len(suffix)] if suffix else source_name
        if not base_name:
            base_name = source_name
    if attempt == 1:
        return f"{base_name} copy{suffix}"
    return f"{base_name} copy {attempt}{suffix}"


def _resolve_copy_destination_path(source: Path, destination_folder: Path) -> Path:
    direct = destination_folder / source.name
    if not direct.exists():
        return direct
    for attempt in range(1, 10_000):
        candidate = destination_folder / _build_copy_candidate_name(
            source.name, attempt
        )
        if not candidate.exists():
            return candidate
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Unable to resolve copy destination for {source.name}.",
    )


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


def _default_file_browser_ignore_patterns() -> list[str]:
    return list(DEFAULT_FILE_BROWSER_IGNORE_PATTERNS)


def _resolve_setta_internal_ignore_roots() -> tuple[Path, ...]:
    paths = get_setta_paths()
    workspace_root = paths.workspace_root.resolve(strict=False)
    roots: list[Path] = []
    for root in (
        paths.setta_files_root.resolve(strict=False),
        paths.runtime_root.resolve(strict=False),
    ):
        if root.is_relative_to(workspace_root):
            roots.append(root)
    return tuple(roots)


def _is_under_ignored_root(path: Path, ignored_roots: tuple[Path, ...]) -> bool:
    for root in ignored_roots:
        if path.is_relative_to(root):
            return True
    if not path.is_symlink():
        return False
    resolved = path.resolve(strict=False)
    for root in ignored_roots:
        if resolved.is_relative_to(root):
            return True
    return False


@router.post(Route.CHECK_IF_FILE_EXISTS)
def route_check_if_file_exists(
    x: CheckIfFileExistsRequests, ctx: RuntimeContextFromRequest
) -> bool:
    if ctx.deployment_mode:
        target_path = ensure_share_deployment_path(x.filepath, ctx.deployment_root)
        return target_path.exists()
    raw_path = x.filepath.strip()
    if not raw_path:
        return False
    workspace_root = get_setta_paths().workspace_root
    resolved = normalize_workspace_path(raw_path, workspace_root=workspace_root)
    try:
        resolved = ensure_within_workspace_root(
            resolved, label="File path", workspace_root=workspace_root
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    return resolved.exists()


@router.post(Route.GET_FILE_BROWSER_ROOT)
def route_get_file_browser_root(
    ctx: RuntimeContextFromRequest,
) -> GetFileBrowserRootResponse:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )
    return GetFileBrowserRootResponse(
        rootPath=str(get_setta_paths().workspace_root),
        pathSeparator=os.sep,
        ignorePatterns=_default_file_browser_ignore_patterns(),
    )


@router.post(Route.GET_FOLDER_CONTENTS)
def route_get_folder_contents(
    x: GetFolderContentsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[FolderContentItem]:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )
    path = _resolve_folder_path(
        x.folderPath,
        share_mode=ctx.deployment_mode,
        deployment_root=ctx.deployment_root,
    )

    # Check if path exists and is a directory
    if not path.exists():
        if x.missingFolderBehavior == "empty":
            return []
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
        else _default_file_browser_ignore_patterns()
    )
    max_entries = (
        x.maxEntries if x.maxEntries is not None else DEFAULT_FILE_BROWSER_MAX_ENTRIES
    )
    internal_ignore_roots = _resolve_setta_internal_ignore_roots()

    contents: list[FolderContentItem] = []
    include_hidden = x.includeHidden
    include_mtime = x.includeMtime
    include_size = x.includeSize
    include_setta_initialized = x.includeSettaInitialized

    for item in path.iterdir():
        if _is_under_ignored_root(item, internal_ignore_roots):
            continue
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
            "fullPath": _format_browser_path(item, share_mode=ctx.deployment_mode),
        }
        if stat_result is not None:
            if include_mtime:
                entry["mtime"] = stat_result.st_mtime
            if include_size:
                entry["size"] = stat_result.st_size
        if include_setta_initialized and is_dir:
            entry["isSettaInitialized"] = (item / "setta_files").is_dir()
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
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
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
        normalized = _format_browser_path(resolved, share_mode=ctx.deployment_mode)
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


@router.post(Route.GET_FILE_BROWSER_FILE_CONTENT)
def route_get_file_browser_file_content(
    x: GetFileBrowserFileContentRequest,
    ctx: RuntimeContextFromRequest,
) -> FileBrowserFileContentResponse:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )
    resolved = _resolve_file_path_for_edit(x.path)
    requested_max_bytes = (
        x.maxBytes
        if x.maxBytes is not None
        else DEFAULT_FILE_BROWSER_MAX_FILE_CONTENT_BYTES
    )
    max_bytes = min(requested_max_bytes, DEFAULT_FILE_BROWSER_MAX_FILE_CONTENT_BYTES)
    try:
        with resolved.open("rb") as source:
            stat_before_read = os.fstat(source.fileno())
            content = source.read(max_bytes + 1)
            stat_after_read = os.fstat(source.fileno())
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to read file: {x.path}",
        ) from exc
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds max size ({max_bytes} bytes): {x.path}",
        )
    if (
        stat_before_read.st_size != stat_after_read.st_size
        or stat_before_read.st_mtime_ns != stat_after_read.st_mtime_ns
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="File changed on disk while reading.",
        )
    mime_type, _ = mimetypes.guess_type(resolved.as_posix())
    store = BinaryStore.from_dbe(ctx.state.dbe)
    ref = store.store_bytes(
        content,
        mime_type=mime_type or "application/octet-stream",
        durable=False,
    )
    return FileBrowserFileContentResponse(
        path=_format_browser_path(resolved, share_mode=ctx.deployment_mode),
        mimeType=mime_type or "application/octet-stream",
        contentId=ref.contentId,
        mtimeNs=stat_after_read.st_mtime_ns,
        size=stat_after_read.st_size,
    )


@router.post(Route.GET_FILE_BROWSER_FILE_STAT)
def route_get_file_browser_file_stat(
    x: GetFileBrowserFileStatRequest,
    ctx: RuntimeContextFromRequest,
) -> FileBrowserFileStatResponse:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )
    resolved = _resolve_file_path_for_edit(x.path)
    try:
        stat_result = resolved.stat()
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to stat file: {x.path}",
        ) from exc
    return FileBrowserFileStatResponse(
        path=_format_browser_path(resolved, share_mode=ctx.deployment_mode),
        mtimeNs=stat_result.st_mtime_ns,
        size=stat_result.st_size,
    )


@router.post(Route.WRITE_FILE_BROWSER_FILE_CONTENT)
def route_write_file_browser_file_content(
    x: WriteFileBrowserFileContentRequest,
    ctx: RuntimeContextFromRequest,
) -> WriteFileBrowserFileContentResponse:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )
    resolved = _resolve_file_path_for_edit(x.path, allow_missing=True)
    store = BinaryStore.from_dbe(ctx.state.dbe)
    try:
        decoded = store.read_bytes(x.contentId)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid binary content payload.",
        ) from exc
    if len(decoded) > DEFAULT_FILE_BROWSER_MAX_FILE_CONTENT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                "Updated file content exceeds maximum supported size "
                f"({DEFAULT_FILE_BROWSER_MAX_FILE_CONTENT_BYTES} bytes)."
            ),
        )
    try:
        resolved.parent.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to write file: {x.path}",
        ) from exc
    if x.expectedMtimeNs is None:
        try:
            with resolved.open("xb") as output:
                output.write(decoded)
        except FileExistsError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="File already exists.",
            ) from None
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to write file: {x.path}",
            ) from exc
    else:
        try:
            existing_stat = resolved.stat()
        except FileNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="File changed on disk since it was loaded.",
            ) from None
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to stat file: {x.path}",
            ) from exc
        if existing_stat.st_mtime_ns != x.expectedMtimeNs:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="File changed on disk since it was loaded.",
            )
        try:
            resolved.write_bytes(decoded)
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to write file: {x.path}",
            ) from exc
    try:
        updated_stat = resolved.stat()
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to stat file: {x.path}",
        ) from exc
    mime_type, _ = mimetypes.guess_type(resolved.as_posix())
    return WriteFileBrowserFileContentResponse(
        path=_format_browser_path(resolved, share_mode=ctx.deployment_mode),
        mimeType=mime_type or "application/octet-stream",
        mtimeNs=updated_stat.st_mtime_ns,
        size=updated_stat.st_size,
    )


@router.post(Route.TRANSFER_FILE_BROWSER_ENTRY)
def route_transfer_file_browser_entry(
    x: TransferFileBrowserEntryRequest,
    ctx: RuntimeContextFromRequest,
) -> TransferFileBrowserEntryResponse:
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
        )

    workspace_root = get_setta_paths().workspace_root
    source = _resolve_workspace_entry_path(x.sourcePath)
    destination_folder = _resolve_folder_path(
        x.destinationFolderPath,
        share_mode=ctx.deployment_mode,
        deployment_root=ctx.deployment_root,
    )
    if not destination_folder.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Destination folder does not exist: {x.destinationFolderPath}",
        )
    if not destination_folder.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Destination is not a folder: {x.destinationFolderPath}",
        )
    if source.resolve(strict=False) == workspace_root.resolve(strict=False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move or copy the workspace root.",
        )
    if source.is_dir() and destination_folder.resolve(strict=False).is_relative_to(
        source.resolve(strict=False)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move or copy a folder into itself.",
        )

    if x.operation == "copy":
        destination = _resolve_copy_destination_path(source, destination_folder)
        try:
            if source.is_dir():
                shutil.copytree(source, destination)
            else:
                shutil.copy2(source, destination)
        except OSError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to copy path: {x.sourcePath}",
            ) from exc
        return TransferFileBrowserEntryResponse(
            sourcePath=_format_browser_path(source, share_mode=ctx.deployment_mode),
            destinationPath=_format_browser_path(
                destination, share_mode=ctx.deployment_mode
            ),
            operation=x.operation,
        )

    destination = destination_folder / source.name
    if destination.resolve(strict=False) == source.resolve(strict=False):
        return TransferFileBrowserEntryResponse(
            sourcePath=_format_browser_path(source, share_mode=ctx.deployment_mode),
            destinationPath=_format_browser_path(
                destination, share_mode=ctx.deployment_mode
            ),
            operation=x.operation,
        )
    if destination.exists():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Destination already exists: {destination.as_posix()}",
        )
    try:
        shutil.move(str(source), str(destination))
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to move path: {x.sourcePath}",
        ) from exc
    return TransferFileBrowserEntryResponse(
        sourcePath=_format_browser_path(source, share_mode=ctx.deployment_mode),
        destinationPath=_format_browser_path(
            destination, share_mode=ctx.deployment_mode
        ),
        operation=x.operation,
    )


@router.get(Route.FILE_BROWSER_DOWNLOAD)
def route_file_browser_download(
    token: str,
    ctx: RuntimeContextFromRequest,
):
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
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
    if ctx.deployment_mode:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="File browsing is disabled in deployment mode.",
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
    if ctx.deployment_mode:
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
    if ctx.deployment_mode:
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
    if ctx.deployment_mode:
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
    if ctx.deployment_mode:
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
    if ctx.deployment_mode:
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
    if ctx.deployment_mode:
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
