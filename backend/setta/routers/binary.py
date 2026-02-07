from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import FileResponse
from starlette.datastructures import UploadFile

from setta.binary import BinaryStore
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.binary_content import BinaryContentRef
from setta.types.routes import Route
from setta.utils.constants import C

router = SettaAPIRouter()


@router.post(Route.BINARY_UPLOAD)
async def route_binary_upload(
    ctx: RuntimeContextFromRequest,
    request: Request,
) -> BinaryContentRef:
    file, durable = await _extract_binary_upload(request)
    store = BinaryStore.from_dbe(ctx.state.dbe)
    try:
        ref = store.store_stream(
            file.file,
            mime_type=file.content_type,
            durable=durable,
        )
    finally:
        await file.close()
    return ref


@router.get(Route.BINARY_DOWNLOAD)
def route_binary_download(
    contentId: str,
    ctx: RuntimeContextFromRequest,
):
    if ctx.share_mode and not ctx.policy.allowFileDownloads:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Share policy disallows file downloads.",
        )
    store = BinaryStore.from_dbe(ctx.state.dbe)
    store.cleanup_expired()
    try:
        path = store.resolve_content(contentId)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Binary payload not found: {contentId}",
        )
    metadata = store.resolve_metadata(contentId)
    media_type = "application/octet-stream"
    if metadata and metadata.mimeType:
        media_type = metadata.mimeType
    return FileResponse(path, media_type=media_type)


def _coerce_form_bool(value: Any, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    raise ValueError(f"Invalid boolean value: {value!r}")


async def _extract_binary_upload(request: Request) -> tuple[UploadFile, bool]:
    max_part_size = C.BINARY_UPLOAD_MAX_BYTES
    if max_part_size > 0:
        try:
            form = await request.form(max_part_size=max_part_size)
        except TypeError:
            form = await request.form()
    else:
        form = await request.form()
    raw_file = form.get("file")
    if isinstance(raw_file, list):
        raw_file = raw_file[0] if raw_file else None
    if not isinstance(raw_file, UploadFile):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Binary upload requires a file field.",
        )
    raw_durable = form.get("durable")
    if isinstance(raw_durable, list):
        raw_durable = raw_durable[0] if raw_durable else None
    try:
        durable = _coerce_form_bool(raw_durable, default=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    raw_file.file.seek(0)
    return raw_file, durable
