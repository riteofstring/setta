from fastapi import Request, Response

from setta.utils.constants import C


def auth_cookie_name(session_id: str) -> str:
    trimmed = session_id.strip()
    if not trimmed:
        raise ValueError("session_id must be a non-empty string")
    return f"{C.AUTH_COOKIE_NAME}_{trimmed}"


def read_auth_cookie(request: Request, *, session_id: str) -> str | None:
    return request.cookies.get(auth_cookie_name(session_id))


def _is_request_secure(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if not forwarded_proto:
        return False
    return forwarded_proto.split(",", 1)[0].strip().lower() == "https"


def set_auth_cookie(
    response: Response,
    token: str,
    *,
    session_id: str,
    request: Request | None = None,
) -> None:
    secure = C.AUTH_COOKIE_SECURE
    if not secure and request is not None and _is_request_secure(request):
        secure = True
    response.set_cookie(
        auth_cookie_name(session_id),
        token,
        max_age=C.AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=C.AUTH_COOKIE_SAMESITE,
        secure=secure,
        path="/",
    )
