from urllib.parse import urlparse

from fastapi import Request

from setta.auth.session import load_current_session_secret
from setta.trusted_frontend_origins import is_trusted_frontend_origin
from setta.utils.launcher_origin_handoff import normalize_launcher_origin


def resolve_request_origin(
    request: Request | None,
    *,
    allow_client_origin_header: bool = False,
) -> str | None:
    if request is None:
        return None
    if allow_client_origin_header:
        header_origin = request.headers.get("origin")
        normalized_header_origin = normalize_launcher_origin(header_origin)
        if normalized_header_origin is not None:
            return normalized_header_origin
    return normalize_launcher_origin(f"{request.url.scheme}://{request.url.netloc}")


def is_return_origin_allowed(
    *,
    return_origin: str,
    request_origin: str | None,
    session_id: str | None,
) -> bool:
    if request_origin is None:
        return True
    if return_origin == request_origin:
        return True
    return is_trusted_frontend_origin(return_origin, session_id=session_id)


def is_origin_allowed_for_current_session(origin: str) -> bool:
    session_info = load_current_session_secret()
    if session_info is None:
        return False
    session_metadata, _ = session_info
    return is_trusted_frontend_origin(origin, session_id=session_metadata.id)


def has_trusted_frontend_origin(request: Request, *, session_id: str) -> bool:
    request_origin = request.headers.get("origin")
    if is_trusted_frontend_origin(request_origin, session_id=session_id):
        return True
    referer_origin = _resolve_referer_origin(request.headers.get("referer"))
    return is_trusted_frontend_origin(referer_origin, session_id=session_id)


def _resolve_referer_origin(raw_referer: str | None) -> str | None:
    if raw_referer is None:
        return None
    parsed = urlparse(raw_referer)
    if not parsed.scheme or not parsed.netloc:
        return None
    return normalize_launcher_origin(f"{parsed.scheme}://{parsed.netloc}")
