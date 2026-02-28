from datetime import datetime, timezone

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from setta.auth.cookies import read_auth_cookie, set_auth_cookie
from setta.auth.headers import extract_bearer_token
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.auth.validation import consume_bootstrap_token, validate_auth_cookie
from setta.trusted_frontend_origins import (
    TrustedFrontendOriginStoreError,
    refresh_trusted_frontend_origins_for_session,
)
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.frontend_origin_policy import has_trusted_frontend_origin

AUTH_EXEMPT_PATHS = {Route.BOOTSTRAP_PAGE.value, Route.BOOTSTRAP_CONSUME.value}

UNAUTHORIZED_HTML = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Unauthorized</title>
    <script>
      (function () {
        try {
          const stored = localStorage.getItem("setta_data");
          if (!stored) {
            return;
          }
          const parsed = JSON.parse(stored);
          if (parsed && parsed.state && parsed.state.darkMode) {
            document.documentElement.classList.add("dark");
          } else {
            document.documentElement.classList.remove("dark");
          }
        } catch {
          /* ignore */
        }
      })();
    </script>
    <style>
      :root {
        --app-shell-bg: linear-gradient(
          135deg,
          hsl(222, 28%, 95%),
          hsl(219, 24%, 89%),
          hsl(219, 25%, 77%)
        );
        --text-base: hsl(219, 25%, 34%);
        --text-accent: hsl(220, 25%, 45%);
        --text-muted: hsl(220, 25%, 57%);
        --spinner-color: rgba(87, 110, 148, 0.7);
        --panel-border: rgba(15, 23, 42, 0.08);
        --panel-bg: rgba(255, 255, 255, 0.55);
        --button-bg: rgba(255, 255, 255, 0.7);
        --button-border: rgba(15, 23, 42, 0.12);
        --button-text: hsl(219, 25%, 34%);
        --button-hover: rgba(255, 255, 255, 0.9);
      }

      html.dark {
        --app-shell-bg: linear-gradient(
          135deg,
          hsl(220, 27%, 6%),
          hsl(220, 24%, 4.5%),
          hsl(220, 25%, 3%)
        );
        --text-base: hsl(219, 24%, 89%);
        --text-accent: hsl(219, 25%, 77%);
        --text-muted: hsl(220, 25%, 57%);
        --spinner-color: hsl(219, 25%, 34%);
        --panel-border: rgba(148, 163, 184, 0.12);
        --panel-bg: rgba(8, 12, 20, 0.65);
        --button-bg: rgba(8, 12, 20, 0.7);
        --button-border: rgba(148, 163, 184, 0.18);
        --button-text: hsl(219, 24%, 89%);
        --button-hover: rgba(8, 12, 20, 0.9);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --app-shell-bg: linear-gradient(
            135deg,
            hsl(220, 27%, 6%),
            hsl(220, 24%, 4.5%),
            hsl(220, 25%, 3%)
          );
          --text-base: hsl(219, 24%, 89%);
          --text-accent: hsl(219, 25%, 77%);
          --text-muted: hsl(220, 25%, 57%);
          --spinner-color: hsl(219, 25%, 34%);
          --panel-border: rgba(148, 163, 184, 0.12);
          --panel-bg: rgba(8, 12, 20, 0.65);
          --button-bg: rgba(8, 12, 20, 0.7);
          --button-border: rgba(148, 163, 184, 0.18);
          --button-text: hsl(219, 24%, 89%);
          --button-hover: rgba(8, 12, 20, 0.9);
        }
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        height: 100%;
      }

      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto",
          "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans",
          "Helvetica Neue", sans-serif;
        color: var(--text-base);
        background-image: var(--app-shell-bg);
        background-size: cover;
        background-repeat: no-repeat;
        background-position: center;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 24px;
      }

      main {
        width: 100%;
        max-width: 640px;
      }

      .panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        text-align: center;
        padding: 28px 24px;
        border-radius: 24px;
        border: 1px solid var(--panel-border);
        background: var(--panel-bg);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.18);
        backdrop-filter: blur(10px);
      }

      .spinner {
        height: 48px;
        width: 48px;
        border-radius: 999px;
        border: 2px solid var(--spinner-color);
        border-top-color: transparent;
        animation: spin 1s linear infinite;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: var(--text-accent);
      }

      .status {
        color: var(--text-accent);
        font-size: 12px;
        line-height: 1.4;
      }

      .status p {
        margin: 0;
      }

      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        text-decoration: none;
        border-radius: 999px;
        border: 1px solid var(--button-border);
        background: var(--button-bg);
        color: var(--button-text);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-weight: 600;
        padding: 10px 16px;
      }

      .cta:hover {
        background: var(--button-hover);
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 520px) {
        .panel {
          padding: 24px 18px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <div class="spinner"></div>
        <div class="eyebrow">Preparing setta</div>
        <div class="status">
          <p>This Setta session requires a bootstrap token.</p>
          <p>Open the bootstrap page and paste a token to continue.</p>
        </div>
        <a class="cta" href="/__setta__/bootstrap">Open bootstrap page</a>
      </section>
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
        cookie_value = read_auth_cookie(request, session_id=session_metadata.id)
        if cookie_value:
            cookie_payload = validate_auth_cookie(
                cookie_value, session_metadata.id, secret
            )
            if cookie_payload is not None:
                if request.url.path.startswith(
                    Route.PREFIX.value
                ) and _should_refresh_auth_cookie(cookie_payload.exp):
                    auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
                    _refresh_session_trusted_frontend_origins(
                        session_id=session_metadata.id,
                        exp=_minted_auth_cookie_exp(),
                    )
                    await self.app(
                        scope,
                        receive,
                        _build_send_with_auth_cookie(
                            send,
                            auth_cookie,
                            request,
                            session_id=session_metadata.id,
                        ),
                    )
                    return

                await self.app(scope, receive, send)
                return

        if _should_auto_auth_dev_request(request, session_id=session_metadata.id):
            auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
            _refresh_session_trusted_frontend_origins(
                session_id=session_metadata.id,
                exp=_minted_auth_cookie_exp(),
            )
            await self.app(
                scope,
                receive,
                _build_send_with_auth_cookie(
                    send,
                    auth_cookie,
                    request,
                    session_id=session_metadata.id,
                ),
            )
            return

        bearer_token = extract_bearer_token(request.headers)
        if bearer_token:
            token_payload = consume_bootstrap_token(
                bearer_token, session_metadata.id, secret
            )
            if token_payload is not None:
                auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
                _refresh_session_trusted_frontend_origins(
                    session_id=session_metadata.id,
                    exp=_minted_auth_cookie_exp(),
                )
                await self.app(
                    scope,
                    receive,
                    _build_send_with_auth_cookie(
                        send,
                        auth_cookie,
                        request,
                        session_id=session_metadata.id,
                    ),
                )
                return

        response = _unauthorized_response(request)
        await response(scope, receive, send)


def _unauthorized_response(request: Request) -> Response:
    if _is_json_unauthorized_path(request.url.path):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return HTMLResponse(UNAUTHORIZED_HTML, status_code=401)


def _should_refresh_auth_cookie(exp: int) -> bool:
    timestamp = int(datetime.now(timezone.utc).timestamp())
    return exp - timestamp <= C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS


def _minted_auth_cookie_exp() -> int:
    timestamp = int(datetime.now(timezone.utc).timestamp())
    return timestamp + C.AUTH_COOKIE_MAX_AGE_SECONDS


def _refresh_session_trusted_frontend_origins(*, session_id: str, exp: int) -> None:
    try:
        refresh_trusted_frontend_origins_for_session(session_id=session_id, exp=exp)
    except TrustedFrontendOriginStoreError:
        return


def _build_send_with_auth_cookie(
    send: Send, auth_cookie: str, request: Request, *, session_id: str
) -> Send:
    async def send_wrapper(message: Message) -> None:
        if message["type"] == "http.response.start":
            headers = list(message.get("headers", []))
            cookie_headers = _build_auth_cookie_headers(
                auth_cookie, request, session_id=session_id
            )
            if cookie_headers:
                headers.extend(cookie_headers)
                message["headers"] = headers
        await send(message)

    return send_wrapper


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
    if path.startswith(f"{Route.PREFIX.value}/attachments/"):
        return True
    if path in AUTH_EXEMPT_PATHS:
        return True
    if path.endswith("/"):
        return path.rstrip("/") in AUTH_EXEMPT_PATHS
    return False


def _build_auth_cookie_headers(
    token: str, request: Request, *, session_id: str
) -> list[tuple[bytes, bytes]]:
    response = Response()
    set_auth_cookie(response, token, session_id=session_id, request=request)
    return [
        header for header in response.raw_headers if header[0].lower() == b"set-cookie"
    ]


def _should_auto_auth_dev_request(request: Request, *, session_id: str) -> bool:
    if not IS_DEV_MODE:
        return False
    client = request.client
    if not client or client.host not in {"127.0.0.1", "::1"}:
        return False
    return has_trusted_frontend_origin(request, session_id=session_id)
