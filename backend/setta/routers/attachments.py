import mimetypes
from datetime import datetime, timezone
from urllib.parse import quote
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from setta.auth.session import load_current_session_secret
from setta.project_state.artifacts import Artifacts
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.helpers_lvl2 import ProjectNotFound
from setta.types.id import ID
from setta.types.routes import Route
from setta.utils.attachment_paths import resolve_attachment_path
from setta.utils.attachment_tokens import AttachmentTokenManager
from setta.utils.constants import CWD, C

router = SettaAPIRouter()
_TOKEN_MANAGER = AttachmentTokenManager(C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS)


class GetAttachmentDownloadUrlRequest(BaseModel):
    artifactId: str
    projectConfigId: ID | None = None


class GetAttachmentDownloadUrlsRequest(BaseModel):
    artifactIds: list[str]
    projectConfigId: ID | None = None


class GetAttachmentDownloadUrlResponse(BaseModel):
    url: str
    expiresAt: int


class AttachmentDownloadUrlEntry(BaseModel):
    artifactId: str
    url: str
    expiresAt: int


def _require_session_secret() -> bytes:
    session_info = load_current_session_secret()
    if session_info is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Attachment token secret unavailable.",
        )
    return session_info[1]


def _build_download_url(token: str, share_session_id: str | None) -> str:
    path = Route.ATTACHMENT_DOWNLOAD.value.replace("{token}", token)
    url = f"{C.BACKEND}{Route.PREFIX.value}{path}"
    if share_session_id:
        return f"{url}?shareSessionId={share_session_id}"
    return url


def _resolve_artifacts(ctx: RuntimeContextFromRequest) -> Artifacts:
    if ctx.share_mode:
        share_session_id = ctx.session_id
        if not share_session_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing share session id.",
            )
        return ctx.state.share_runtime_state.get_session_artifacts(share_session_id)
    return ctx.state.artifacts


def _resolve_artifacts_root(ctx: RuntimeContextFromRequest) -> Path:
    if ctx.share_mode:
        if ctx.deployment_root is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Share deployment root is not available.",
            )
        return (ctx.deployment_root / "artifacts").resolve()
    return (CWD / C.ARTIFACTS_FOLDER).resolve()


def _resolve_attachment_path(
    artifact_id: str,
    *,
    base_root: Path,
    artifacts_root: Path,
    allow_external: bool,
    require_exists: bool,
) -> Path:
    try:
        return resolve_attachment_path(
            artifact_id,
            base_root=base_root,
            artifacts_root=artifacts_root,
            allow_external=allow_external,
            require_exists=require_exists,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except IsADirectoryError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attachment path is a directory.",
        ) from exc
    except (FileNotFoundError, PermissionError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        ) from exc


def _validate_project_config(
    ctx: RuntimeContextFromRequest, project_config_id: ID
) -> None:
    try:
        manager = ctx.get_project_manager(project_config_id)
        if project_config_id not in manager.project_state_backend.projectConfigs:
            raise KeyError(f"Unknown project config id: {project_config_id}")
    except (KeyError, ProjectNotFound):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown project config id: {project_config_id}",
        ) from None


def _build_attachment_download_entry(
    *,
    artifact_id: str,
    ctx: RuntimeContextFromRequest,
    artifacts: Artifacts,
    secret: bytes,
    now: datetime,
    share_session_id: str | None,
    project_config_id: ID | None,
) -> AttachmentDownloadUrlEntry:
    artifacts_root = _resolve_artifacts_root(ctx)
    base_root = ctx.deployment_root if ctx.share_mode else CWD
    resolved_path = _resolve_attachment_path(
        artifact_id,
        base_root=base_root,
        artifacts_root=artifacts_root,
        allow_external=False,
        require_exists=True,
    )
    normalized_id = artifacts.normalize_artifact_id(resolved_path)
    token = _TOKEN_MANAGER.mint(
        artifact_id=normalized_id,
        secret=secret,
        project_config_id=str(project_config_id) if project_config_id else None,
        share_session_id=share_session_id,
        now=now,
    )
    return AttachmentDownloadUrlEntry(
        artifactId=artifact_id,
        url=_build_download_url(token, share_session_id),
        expiresAt=int(now.timestamp()) + C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS,
    )


def _sanitize_ascii_filename(filename: str) -> str:
    ascii_name = filename.encode("ascii", errors="ignore").decode("ascii").strip()
    if not ascii_name:
        return "attachment"
    sanitized = []
    for char in ascii_name:
        code = ord(char)
        if code < 32 or code == 127 or char in {'"', "\\"}:
            sanitized.append("_")
        else:
            sanitized.append(char)
    return "".join(sanitized)


def _build_content_disposition(filename: str) -> str:
    ascii_name = _sanitize_ascii_filename(filename)
    if filename == ascii_name:
        return f'inline; filename="{ascii_name}"'
    encoded = quote(filename, safe="")
    return f"inline; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}"


@router.post(Route.GET_ATTACHMENT_DOWNLOAD_URL)
async def route_get_attachment_download_url(
    x: GetAttachmentDownloadUrlRequest,
    ctx: RuntimeContextFromRequest,
) -> GetAttachmentDownloadUrlResponse:
    if x.projectConfigId is not None:
        _validate_project_config(ctx, x.projectConfigId)
    artifacts = _resolve_artifacts(ctx)
    now = datetime.now(timezone.utc)
    secret = _require_session_secret()
    share_session_id = ctx.share_session_id if ctx.share_mode else None
    entry = _build_attachment_download_entry(
        artifact_id=x.artifactId,
        ctx=ctx,
        artifacts=artifacts,
        secret=secret,
        now=now,
        share_session_id=share_session_id,
        project_config_id=x.projectConfigId,
    )
    return GetAttachmentDownloadUrlResponse(url=entry.url, expiresAt=entry.expiresAt)


@router.post(Route.GET_ATTACHMENT_DOWNLOAD_URLS)
async def route_get_attachment_download_urls(
    x: GetAttachmentDownloadUrlsRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AttachmentDownloadUrlEntry]:
    if not x.artifactIds:
        return []
    if x.projectConfigId is not None:
        _validate_project_config(ctx, x.projectConfigId)
    artifacts = _resolve_artifacts(ctx)
    now = datetime.now(timezone.utc)
    secret = _require_session_secret()
    share_session_id = ctx.share_session_id if ctx.share_mode else None
    entries: list[AttachmentDownloadUrlEntry] = []
    for artifact_id in x.artifactIds:
        try:
            entry = _build_attachment_download_entry(
                artifact_id=artifact_id,
                ctx=ctx,
                artifacts=artifacts,
                secret=secret,
                now=now,
                share_session_id=share_session_id,
                project_config_id=x.projectConfigId,
            )
        except HTTPException:
            continue
        entries.append(entry)
    return entries


@router.get(Route.ATTACHMENT_DOWNLOAD)
async def route_download_attachment(
    token: str,
    ctx: RuntimeContextFromRequest,
) -> Response:
    secret = _require_session_secret()
    try:
        payload = _TOKEN_MANAGER.validate(token, secret=secret)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or expired attachment token.",
        ) from exc
    if ctx.share_mode:
        if payload.shareSessionId != ctx.session_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Attachment token session mismatch.",
            )
    elif payload.shareSessionId is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Attachment token session mismatch.",
        )
    if payload.projectConfigId is not None:
        _validate_project_config(ctx, ID(payload.projectConfigId))
    artifacts_root = _resolve_artifacts_root(ctx)
    base_root = ctx.deployment_root if ctx.share_mode else CWD
    resolved_path = _resolve_attachment_path(
        payload.artifactId,
        base_root=base_root,
        artifacts_root=artifacts_root,
        allow_external=False,
        require_exists=True,
    )
    artifacts = _resolve_artifacts(ctx)
    normalized_id = artifacts.normalize_artifact_id(resolved_path)
    try:
        data = artifacts.read_file_bytes(normalized_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        ) from None
    mime_type, _ = mimetypes.guess_type(resolved_path.as_posix())
    media_type = mime_type or "application/octet-stream"
    filename = resolved_path.name
    headers = {"Content-Disposition": _build_content_disposition(filename)}
    return Response(content=data, media_type=media_type, headers=headers)
