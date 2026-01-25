from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from setta.auth.cookies import read_auth_cookie, set_auth_cookie
from setta.auth.headers import extract_bearer_token
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.auth.validation import consume_bootstrap_token, validate_auth_cookie
from setta.types.routes import Route

AUTH_EXEMPT_PATHS = {Route.BOOTSTRAP_PAGE.value, Route.BOOTSTRAP_CONSUME.value}

UNAUTHORIZED_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Unauthorized</title>
  </head>
  <body>
    <main>
      <h1>Unauthorized</h1>
      <p>This Setta session requires a bootstrap token.</p>
      <p>
        Open <a href="/__setta__/bootstrap">/__setta__/bootstrap</a> and paste a
        token to continue.
      </p>
    </main>
  </body>
</html>
"""


class AuthMiddleware:
    """Auth gate implemented as pure ASGI middleware to support streaming responses."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        if request.method == "OPTIONS" or _is_auth_exempt_path(request.url.path):
            await self.app(scope, receive, send)
            return

        session_info = load_current_session_secret()
        if session_info is None:
            response = _unauthorized_response(request)
            await response(scope, receive, send)
            return

        session_metadata, secret = session_info
        cookie_value = read_auth_cookie(request)
        if cookie_value:
            cookie_payload = validate_auth_cookie(
                cookie_value, session_metadata.id, secret
            )
            if cookie_payload is not None:
                await self.app(scope, receive, send)
                return

        bearer_token = extract_bearer_token(request.headers)
        if bearer_token:
            token_payload = consume_bootstrap_token(
                bearer_token, session_metadata.id, secret
            )
            if token_payload is not None:
                auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)

                async def send_wrapper(message: Message) -> None:
                    if message["type"] == "http.response.start":
                        headers = list(message.get("headers", []))
                        cookie_headers = _build_auth_cookie_headers(
                            auth_cookie, request
                        )
                        if cookie_headers:
                            headers.extend(cookie_headers)
                            message["headers"] = headers
                    await send(message)

                await self.app(scope, receive, send_wrapper)
                return

        response = _unauthorized_response(request)
        await response(scope, receive, send)


def _unauthorized_response(request: Request) -> Response:
    if request.url.path.startswith(Route.PREFIX.value):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return HTMLResponse(UNAUTHORIZED_HTML, status_code=401)


def _is_auth_exempt_path(path: str) -> bool:
    if path in AUTH_EXEMPT_PATHS:
        return True
    if path.endswith("/"):
        return path.rstrip("/") in AUTH_EXEMPT_PATHS
    return False


def _build_auth_cookie_headers(
    token: str, request: Request
) -> list[tuple[bytes, bytes]]:
    response = Response()
    set_auth_cookie(response, token, request=request)
    return [
        header for header in response.raw_headers if header[0].lower() == b"set-cookie"
    ]
