from fastapi import status
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from setta.auth import extract_http_token, extract_websocket_token


class AuthMiddleware:
    """Enforce per-request authentication for HTTP and websocket connections."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        scope_type = scope["type"]
        if scope_type == "http":
            if scope.get("method") != "OPTIONS" and not self._is_http_authorized(scope):
                response = JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={"detail": "Unauthorized"},
                )
                await response(scope, receive, send)
                return
        elif scope_type == "websocket":
            if not self._is_websocket_authorized(scope):
                await send({"type": "websocket.close", "code": 4401})
                return
        await self.app(scope, receive, send)

    def _expected_token(self, scope: Scope) -> str:
        auth_token = getattr(scope["app"].state, "auth_token", None)
        if not auth_token:
            raise RuntimeError("Auth token missing; configure app.state.auth_token.")
        return auth_token

    def _is_http_authorized(self, scope: Scope) -> bool:
        headers = scope.get("headers", [])
        token = extract_http_token(headers)
        return token == self._expected_token(scope)

    def _is_websocket_authorized(self, scope: Scope) -> bool:
        headers = scope.get("headers", [])
        query_string = scope.get("query_string", b"")
        token = extract_websocket_token(headers, query_string)
        return token == self._expected_token(scope)
