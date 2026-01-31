import mimetypes
from datetime import datetime, timezone
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


class GetAttachmentDownloadUrlResponse(BaseModel):
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
        ctx.get_project_manager(project_config_id)
    except (KeyError, ProjectNotFound):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown project config id: {project_config_id}",
        ) from None


@router.post(Route.GET_ATTACHMENT_DOWNLOAD_URL)
async def route_get_attachment_download_url(
    x: GetAttachmentDownloadUrlRequest,
    ctx: RuntimeContextFromRequest,
) -> GetAttachmentDownloadUrlResponse:
    if x.projectConfigId is not None:
        _validate_project_config(ctx, x.projectConfigId)
    artifacts_root = _resolve_artifacts_root(ctx)
    base_root = ctx.deployment_root if ctx.share_mode else CWD
    resolved_path = _resolve_attachment_path(
        x.artifactId,
        base_root=base_root,
        artifacts_root=artifacts_root,
        allow_external=not ctx.share_mode,
        require_exists=True,
    )
    artifacts = _resolve_artifacts(ctx)
    normalized_id = artifacts.normalize_artifact_id(resolved_path)
    now = datetime.now(timezone.utc)
    secret = _require_session_secret()
    token = _TOKEN_MANAGER.mint(
        artifact_id=normalized_id,
        secret=secret,
        project_config_id=str(x.projectConfigId) if x.projectConfigId else None,
        share_session_id=ctx.session_id,
        now=now,
    )
    return GetAttachmentDownloadUrlResponse(
        url=_build_download_url(token, ctx.session_id),
        expiresAt=int(now.timestamp()) + C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS,
    )


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
    if payload.shareSessionId != ctx.session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Attachment token session mismatch.",
        )
    artifacts_root = _resolve_artifacts_root(ctx)
    base_root = ctx.deployment_root if ctx.share_mode else CWD
    resolved_path = _resolve_attachment_path(
        payload.artifactId,
        base_root=base_root,
        artifacts_root=artifacts_root,
        allow_external=not ctx.share_mode,
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
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=data, media_type=media_type, headers=headers)
