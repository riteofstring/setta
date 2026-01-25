import mimetypes
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from setta.auth.session import load_current_session_secret
from setta.project_state.artifacts import Artifacts
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.id import ID
from setta.types.routes import Route
from setta.utils.attachment_tokens import AttachmentTokenManager
from setta.utils.constants import C

router = SettaAPIRouter()
_TOKEN_MANAGER = AttachmentTokenManager(C.CHAT_ATTACHMENTS_TOKEN_TTL_SECONDS)


class GetAttachmentDownloadUrlRequest(BaseModel):
    artifactId: str
    projectConfigId: ID | None = None


class GetAttachmentDownloadUrlResponse(BaseModel):
    url: str


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


@router.post(Route.GET_ATTACHMENT_DOWNLOAD_URL)
async def route_get_attachment_download_url(
    x: GetAttachmentDownloadUrlRequest,
    ctx: RuntimeContextFromRequest,
) -> GetAttachmentDownloadUrlResponse:
    secret = _require_session_secret()
    token = _TOKEN_MANAGER.mint(
        artifact_id=x.artifactId,
        secret=secret,
        project_config_id=str(x.projectConfigId) if x.projectConfigId else None,
        share_session_id=ctx.session_id,
    )
    return GetAttachmentDownloadUrlResponse(
        url=_build_download_url(token, ctx.session_id)
    )


@router.get(Route.ATTACHMENT_DOWNLOAD)
async def route_download_attachment(
    token: str,
    ctx: RuntimeContextFromRequest,
) -> Response:
    secret = _require_session_secret()
    payload = _TOKEN_MANAGER.validate(token, secret=secret)
    if ctx.share_mode and payload.shareSessionId != ctx.session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Attachment token session mismatch.",
        )
    artifacts = _resolve_artifacts(ctx)
    data = artifacts.read_file_bytes(payload.artifactId)
    mime_type, _ = mimetypes.guess_type(payload.artifactId)
    media_type = mime_type or "application/octet-stream"
    filename = Path(payload.artifactId).name
    headers = {"Content-Disposition": f'inline; filename="{filename}"'}
    return Response(content=data, media_type=media_type, headers=headers)
