from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

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


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method == "OPTIONS":
            return await call_next(request)
        if _is_auth_exempt_path(request.url.path):
            return await call_next(request)

        session_info = load_current_session_secret()
        if session_info is None:
            return _unauthorized_response(request)

        session_metadata, secret = session_info
        cookie_value = read_auth_cookie(request)
        if cookie_value:
            cookie_payload = validate_auth_cookie(
                cookie_value, session_metadata.id, secret
            )
            if cookie_payload is not None:
                return await call_next(request)

        bearer_token = extract_bearer_token(request.headers)
        if bearer_token:
            token_payload = consume_bootstrap_token(
                bearer_token, session_metadata.id, secret
            )
            if token_payload is not None:
                response = await call_next(request)
                auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
                set_auth_cookie(response, auth_cookie, request=request)
                return response

        return _unauthorized_response(request)


def _unauthorized_response(request: Request) -> Response:
    if _is_json_unauthorized_path(request.url.path):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return HTMLResponse(UNAUTHORIZED_HTML, status_code=401)


def _is_json_unauthorized_path(path: str) -> bool:
    if path.startswith(Route.PREFIX.value):
        return True
    return _path_matches_route(path, Route.TOOLS_CALL.value)


def _path_matches_route(path: str, route: str) -> bool:
    if path == route:
        return True
    if path.endswith("/"):
        return path.rstrip("/") == route
    return False


def _is_auth_exempt_path(path: str) -> bool:
    if path in AUTH_EXEMPT_PATHS:
        return True
    if path.endswith("/"):
        return path.rstrip("/") in AUTH_EXEMPT_PATHS
    return False
