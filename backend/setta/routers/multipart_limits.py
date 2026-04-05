from fastapi import HTTPException, Request, status
from starlette.exceptions import HTTPException as StarletteHTTPException

MULTIPART_CONTENT_LENGTH_SLACK_BYTES = 64 * 1024
_MULTIPART_TOO_LARGE_DETAIL_PREFIX = "Part exceeded maximum size"


def _parse_content_length(request: Request) -> int | None:
    raw_content_length = request.headers.get("content-length")
    if raw_content_length is None:
        return None
    try:
        parsed = int(raw_content_length)
    except ValueError:
        return None
    if parsed < 0:
        return None
    return parsed


def _is_multipart_request(request: Request) -> bool:
    content_type = request.headers.get("content-type")
    if not isinstance(content_type, str):
        return False
    return content_type.lower().startswith("multipart/form-data")


async def enforce_multipart_max_part_size(
    request: Request,
    *,
    max_part_size: int,
    too_large_detail: str,
    content_length_slack_bytes: int = MULTIPART_CONTENT_LENGTH_SLACK_BYTES,
) -> None:
    if max_part_size <= 0 or not _is_multipart_request(request):
        return

    content_length = _parse_content_length(request)
    if (
        content_length is not None
        and content_length > max_part_size + content_length_slack_bytes
    ):
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=too_large_detail,
        )

    try:
        await request.form(max_part_size=max_part_size)
    except StarletteHTTPException as exc:
        if (
            exc.status_code == status.HTTP_400_BAD_REQUEST
            and isinstance(exc.detail, str)
            and exc.detail.startswith(_MULTIPART_TOO_LARGE_DETAIL_PREFIX)
        ):
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=too_large_detail,
            ) from exc
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
