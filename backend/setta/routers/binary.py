from fastapi import File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from setta.binary import BinaryStore
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.binary_content import BinaryContentRef
from setta.types.routes import Route

router = SettaAPIRouter()


@router.post(Route.BINARY_UPLOAD)
async def route_binary_upload(
    ctx: RuntimeContextFromRequest,
    file: UploadFile = File(...),
) -> BinaryContentRef:
    if file is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Binary upload requires a file field.",
        )
    store = BinaryStore.from_dbe(ctx.state.dbe)
    try:
        ref = store.store_stream(
            file.file,
            mime_type=file.content_type,
            durable=True,
        )
    finally:
        await file.close()
    return ref


@router.get(Route.BINARY_DOWNLOAD)
def route_binary_download(
    contentId: str,
    ctx: RuntimeContextFromRequest,
):
    store = BinaryStore.from_dbe(ctx.state.dbe)
    store.cleanup_expired()
    path = store.resolve_content(contentId)
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
