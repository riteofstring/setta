from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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

BACKEND_ORIGIN_QUERY_PARAM = "__setta_backend_origin"

BOOTSTRAP_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Setta Bootstrap</title>
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
        --input-bg: rgba(255, 255, 255, 0.75);
        --input-border: hsl(219, 25%, 77%);
        --input-focus: #3b82f6;
        --button-bg: rgba(255, 255, 255, 0.7);
        --button-border: rgba(15, 23, 42, 0.12);
        --button-text: hsl(219, 25%, 34%);
        --button-hover: rgba(255, 255, 255, 0.9);
        --code-bg: rgba(255, 255, 255, 0.65);
        --error: #ef4444;
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
        --input-bg: rgba(10, 15, 24, 0.8);
        --input-border: rgba(148, 163, 184, 0.2);
        --input-focus: #60a5fa;
        --button-bg: rgba(8, 12, 20, 0.7);
        --button-border: rgba(148, 163, 184, 0.18);
        --button-text: hsl(219, 24%, 89%);
        --button-hover: rgba(8, 12, 20, 0.9);
        --code-bg: rgba(8, 12, 20, 0.7);
        --error: #f87171;
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
          --input-bg: rgba(10, 15, 24, 0.8);
          --input-border: rgba(148, 163, 184, 0.2);
          --input-focus: #60a5fa;
          --button-bg: rgba(8, 12, 20, 0.7);
          --button-border: rgba(148, 163, 184, 0.18);
          --button-text: hsl(219, 24%, 89%);
          --button-hover: rgba(8, 12, 20, 0.9);
          --code-bg: rgba(8, 12, 20, 0.7);
          --error: #f87171;
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

      .error {
        min-height: 16px;
        font-size: 12px;
        color: var(--error);
      }

      .form {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      label {
        text-align: left;
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .input-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      input {
        flex: 1 1 320px;
        border-radius: 12px;
        border: 1px solid var(--input-border);
        background: var(--input-bg);
        padding: 10px 12px;
        font-size: 14px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        color: var(--text-base);
      }

      input:focus {
        outline: 2px solid var(--input-focus);
        border-color: transparent;
      }

      button {
        border-radius: 999px;
        border: 1px solid var(--button-border);
        background: var(--button-bg);
        color: var(--button-text);
        font-size: 11px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        font-weight: 600;
        padding: 10px 16px;
        cursor: pointer;
      }

      button:hover {
        background: var(--button-hover);
      }

      .hint {
        margin: 0;
        font-size: 11px;
        color: var(--text-muted);
        line-height: 1.4;
      }

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        background: var(--code-bg);
        border-radius: 6px;
        padding: 2px 6px;
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

        .input-row {
          flex-direction: column;
        }

        button {
          width: 100%;
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
          <p id="status">Paste a bootstrap token to continue.</p>
        </div>
        <div class="error" id="error"></div>
        <form id="bootstrap-form" class="form">
          <label for="token-input">Bootstrap token</label>
          <div class="input-row">
            <input
              id="token-input"
              type="text"
              autocomplete="off"
              placeholder="Paste token"
            />
            <button type="submit">Connect</button>
          </div>
        </form>
        <p class="hint">
          Tip: open <code>/__setta__/bootstrap#token=...</code> to skip manual
          entry.
        </p>
      </section>
    </main>
    <script>
      (function () {
        const redirectUrl = "__SETTA_REDIRECT_URL__";
        const windowNamePrefix = "setta.workspaceHistory:";
        const historyStorageKey = "setta.workspaceHistory";

        (function hydrateWorkspaceHistoryFromWindowName() {
          // Only hydrate into localStorage when the redirect stays on this origin.
          // In dev we redirect to the Vite origin, so we must not clear the payload here.
          if (!redirectUrl || !redirectUrl.startsWith("/")) {
            return;
          }
          const rawName = window.name;
          if (!rawName || !rawName.startsWith(windowNamePrefix)) {
            return;
          }
          const raw = rawName.slice(windowNamePrefix.length);
          if (!raw) {
            return;
          }
          try {
            localStorage.setItem(historyStorageKey, raw);
          } catch (error) {
            console.warn("Failed to store workspace history from window.name", error);
          }
          try {
            window.name = "";
          } catch (error) {
            console.warn("Failed to clear workspace history from window.name", error);
          }
        })();
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


def _request_origin(request: Request) -> str:
    return f"{request.url.scheme}://{request.url.netloc}"


def _append_query_param(url: str, *, key: str, value: str) -> str:
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.append((key, value))
    return urlunsplit(
        (
            parts.scheme,
            parts.netloc,
            parts.path,
            urlencode(query),
            parts.fragment,
        )
    )


def _bootstrap_redirect_url(request: Request) -> str:
    if not IS_DEV_MODE:
        return "/"
    hostname = request.url.hostname or C.HOST
    host = format_host_for_url(hostname)
    redirect_url = f"{request.url.scheme}://{host}:{C.DEV_MODE_FRONTEND_PORT}/"
    return _append_query_param(
        redirect_url, key=BACKEND_ORIGIN_QUERY_PARAM, value=_request_origin(request)
    )


def _render_bootstrap_html(request: Request) -> str:
    return BOOTSTRAP_HTML_TEMPLATE.replace(
        "__SETTA_REDIRECT_URL__", _bootstrap_redirect_url(request)
    )


@router.get(Route.BOOTSTRAP_PAGE, response_class=HTMLResponse)
async def route_bootstrap_page(request: Request) -> str:
    return _render_bootstrap_html(request)


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
