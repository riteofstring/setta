from fastapi import Body, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from setta.auth.cookies import set_auth_cookie
from setta.auth.headers import extract_bearer_token_value
from setta.auth.manager import AUTH_COOKIE_MANAGER
from setta.auth.session import load_current_session_secret
from setta.auth.validation import consume_bootstrap_token
from setta.routers.dependencies import require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.routes import Route
from setta.utils.constants import IS_DEV_MODE, C
from setta.utils.network import format_host_for_url

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])

BOOTSTRAP_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Bootstrap</title>
    <style>
      body {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        background: #f6f4f1;
        color: #151515;
        margin: 0;
        padding: 2rem;
      }
      main {
        max-width: 640px;
      }
      label {
        display: block;
        font-weight: 600;
        margin-top: 1rem;
      }
      input {
        width: 100%;
        font-family: inherit;
        font-size: 1rem;
        padding: 0.6rem;
        margin-top: 0.4rem;
      }
      button {
        margin-top: 0.8rem;
        padding: 0.6rem 1rem;
        font-family: inherit;
        font-size: 1rem;
        cursor: pointer;
      }
      .hint {
        margin-top: 1rem;
        color: #4f4f4f;
      }
      .error {
        margin-top: 0.75rem;
        color: #b42318;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Setta Bootstrap</h1>
      <p id="status">Paste a bootstrap token to continue.</p>
      <div class="error" id="error"></div>
      <form id="bootstrap-form">
        <label for="token-input">Bootstrap token</label>
        <input id="token-input" type="text" autocomplete="off" />
        <button type="submit">Connect</button>
      </form>
      <p class="hint">
        Tip: open <code>/__setta__/bootstrap#token=...</code> to skip manual
        entry.
      </p>
    </main>
    <script>
      (function () {
        const redirectUrl = "__SETTA_REDIRECT_URL__";
        const form = document.getElementById("bootstrap-form");
        const input = document.getElementById("token-input");
        const statusEl = document.getElementById("status");
        const errorEl = document.getElementById("error");

        function setStatus(message) {
          statusEl.textContent = message;
        }

        function setError(message) {
          errorEl.textContent = message || "";
        }

        function readTokenFromUrl() {
          const hash = window.location.hash.slice(1);
          const hashToken = new URLSearchParams(hash).get("token");
          if (hashToken) {
            return hashToken;
          }
          return new URLSearchParams(window.location.search).get("token");
        }

        async function consumeToken(token) {
          setError("");
          setStatus("Setting auth cookie...");
          const response = await fetch("/__setta__/bootstrap/consume", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token }),
          });
          if (!response.ok) {
            throw new Error("Token rejected");
          }
          history.replaceState({}, "", "/__setta__/bootstrap");
          window.location.assign(redirectUrl);
        }

        form.addEventListener("submit", function (event) {
          event.preventDefault();
          const token = input.value.trim();
          if (!token) {
            setError("Paste a bootstrap token first.");
            return;
          }
          consumeToken(token).catch(function () {
            setError("Token rejected. Request a new token and try again.");
            setStatus("Paste a bootstrap token to continue.");
          });
        });

        const urlToken = readTokenFromUrl();
        if (urlToken) {
          input.value = urlToken;
          consumeToken(urlToken).catch(function () {
            setError("Token rejected. Request a new token and try again.");
            setStatus("Paste a bootstrap token to continue.");
          });
        }
      })();
    </script>
  </body>
</html>
"""


class BootstrapConsumeRequest(BaseModel):
    token: str | None = None


def _bearer_token_from_header(
    authorization: str | None = Header(default=None),
) -> str | None:
    return extract_bearer_token_value(authorization)


def _bootstrap_redirect_url() -> str:
    if not IS_DEV_MODE:
        return "/"
    host = format_host_for_url(C.HOST)
    return f"http://{host}:{C.DEV_MODE_FRONTEND_PORT}/"


def _render_bootstrap_html() -> str:
    return BOOTSTRAP_HTML_TEMPLATE.replace(
        "__SETTA_REDIRECT_URL__", _bootstrap_redirect_url()
    )


@router.get(Route.BOOTSTRAP_PAGE, response_class=HTMLResponse)
async def route_bootstrap_page() -> str:
    return _render_bootstrap_html()


@router.post(Route.BOOTSTRAP_CONSUME)
async def route_bootstrap_consume(
    request: Request,
    response: Response,
    payload: BootstrapConsumeRequest | None = Body(default=None),
    bearer_token: str | None = Depends(_bearer_token_from_header),
) -> dict[str, str]:
    token = None
    if payload and payload.token:
        token = payload.token.strip()
    if not token:
        token = bearer_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )

    session_info = load_current_session_secret()
    if session_info is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing session"
        )
    session_metadata, secret = session_info
    if consume_bootstrap_token(token, session_metadata.id, secret) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    auth_cookie = AUTH_COOKIE_MANAGER.mint(session_metadata.id, secret)
    set_auth_cookie(response, auth_cookie, request=request)
    return {"status": "ok"}
