from fastapi import Request, Response

from setta.utils.constants import C


def read_auth_cookie(request: Request) -> str | None:
    return request.cookies.get(C.AUTH_COOKIE_NAME)


def _is_request_secure(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if not forwarded_proto:
        return False
    return forwarded_proto.split(",", 1)[0].strip().lower() == "https"


def set_auth_cookie(
    response: Response, token: str, *, request: Request | None = None
) -> None:
    secure = C.AUTH_COOKIE_SECURE
    if not secure and request is not None and _is_request_secure(request):
        secure = True
    response.set_cookie(
        C.AUTH_COOKIE_NAME,
        token,
        max_age=C.AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=C.AUTH_COOKIE_SAMESITE,
        secure=secure,
        path="/",
    )
