from typing import Any

from fastapi import Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from setta.binary import BinaryPayloadTooLargeError, BinaryStore
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.multipart_limits import enforce_multipart_max_part_size
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.binary_content import BinaryContentRef
from setta.types.routes import Route
from setta.utils.constants import C

router = SettaAPIRouter()


def _build_binary_payload_too_large_detail(max_bytes: int) -> str:
    return f"Binary payload is too large. Maximum size is {max_bytes} bytes."


async def _enforce_binary_upload_multipart_limit(request: Request) -> None:
    max_bytes = C.BINARY_UPLOAD_MAX_BYTES
    await enforce_multipart_max_part_size(
        request,
        max_part_size=max_bytes,
        too_large_detail=_build_binary_payload_too_large_detail(max_bytes),
    )


@router.post(Route.BINARY_UPLOAD)
async def route_binary_upload(
    ctx: RuntimeContextFromRequest,
    _multipart_limit_guard: None = Depends(_enforce_binary_upload_multipart_limit),
    file: UploadFile = File(...),
    durable: str | bool | None = Form(default=True),
) -> BinaryContentRef:
    try:
        durable_flag = _coerce_form_bool(durable, default=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    file.file.seek(0)
    store = BinaryStore.from_dbe(ctx.state.dbe)
    try:
        ref = store.store_stream(
            file.file,
            mime_type=file.content_type,
            durable=durable_flag,
            max_bytes=C.BINARY_UPLOAD_MAX_BYTES,
        )
    except BinaryPayloadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    finally:
        await file.close()
    return ref


@router.get(Route.BINARY_DOWNLOAD)
async def route_binary_download(
    contentId: str,
    ctx: RuntimeContextFromRequest,
):
    await ctx.enforce_download_allowed()
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
