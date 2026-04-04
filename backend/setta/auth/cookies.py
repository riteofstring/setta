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


def _resolve_auth_cookie_secure(request: Request | None) -> bool:
    secure = C.AUTH_COOKIE_SECURE
    if not secure and request is not None and _is_request_secure(request):
        secure = True
    return secure


def list_stale_auth_cookie_names(
    cookie_names: list[str], *, session_id: str
) -> list[str]:
    current_cookie_name = auth_cookie_name(session_id)
    session_cookie_prefix = f"{C.AUTH_COOKIE_NAME}_"
    stale_cookie_names: list[str] = []
    for cookie_name in cookie_names:
        if cookie_name == current_cookie_name:
            continue
        if cookie_name == C.AUTH_COOKIE_NAME or cookie_name.startswith(
            session_cookie_prefix
        ):
            stale_cookie_names.append(cookie_name)
    return stale_cookie_names


def clear_stale_auth_cookies(
    response: Response, request: Request, *, session_id: str
) -> None:
    secure = _resolve_auth_cookie_secure(request)
    for cookie_name in list_stale_auth_cookie_names(
        list(request.cookies.keys()),
        session_id=session_id,
    ):
        response.delete_cookie(
            cookie_name,
            path="/",
            secure=secure,
            httponly=True,
            samesite=C.AUTH_COOKIE_SAMESITE,
        )


def set_auth_cookie(
    response: Response,
    token: str,
    *,
    session_id: str,
    request: Request | None = None,
) -> None:
    secure = _resolve_auth_cookie_secure(request)
    response.set_cookie(
        auth_cookie_name(session_id),
        token,
        max_age=C.AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=C.AUTH_COOKIE_SAMESITE,
        secure=secure,
        path="/",
    )
