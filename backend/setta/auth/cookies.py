from fastapi import Request, Response

from setta.utils.constants import C


def read_auth_cookie(request: Request) -> str | None:
    return request.cookies.get(C.AUTH_COOKIE_NAME)


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        C.AUTH_COOKIE_NAME,
        token,
        max_age=C.AUTH_COOKIE_MAX_AGE_SECONDS,
        httponly=True,
        samesite=C.AUTH_COOKIE_SAMESITE,
        secure=C.AUTH_COOKIE_SECURE,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(C.AUTH_COOKIE_NAME, path="/")
