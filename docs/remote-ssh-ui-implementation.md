# Remote SSH UI Implementation Plan

This document translates `docs/remote-ssh-ui-plan.md` into concrete code changes for the current repo. The goal is a deliberate refactor (breakage is OK) that removes old flows and builds the new secure SSH-first UX.

## Refactor Stance
- No backward compatibility: we will remove/replace existing CLI commands and flows instead of keeping shims.
- It is acceptable for the app to be broken mid-refactor; remove old code as soon as it is superseded.
- Keep runtime metadata under `setta_files/`; do not commit new runtime files.

## Progress Summary
Done:
- Session registry + secret handling is in place, with helper accessors and tests (`backend/setta/sessions/registry.py`, `backend/setta/auth/session.py`, `tests/sessions/test_registry.py`).
- Token/cookie signing and validation helpers are implemented, plus tests (`backend/setta/auth/tokens.py`, `backend/setta/auth/manager.py`, `backend/setta/auth/cookies.py`, `backend/setta/auth/validation.py`, `tests/auth/test_tokens.py`, `tests/auth/test_validation.py`).
- HTTP auth middleware and websocket auth gating are wired (`backend/setta/middleware/auth.py`, `backend/setta/routers/websocket.py`, `backend/setta/server.py`).
- Bootstrap page + consume endpoint are live and wired (`backend/setta/routers/bootstrap.py`, `backend/setta/types/routes.py`).
- Server startup behavior refactor landed (random port when omitted, loopback default, session metadata + bootstrap token output, best-effort local auto-open).
- CLI `status --connect-info` implemented with base64 JSON payload and new tests (`backend/setta/start.py`, `tests/setta/test_start_status.py`).
- SSH-based `setta connect` implemented with remote start, session selection, and tunnel handling (`backend/setta/start.py`).
- `status --list-sessions --json` and `status --delete-session` added to support connect session selection and cleanup (`backend/setta/start.py`).
- Legacy websocket CLI `setta connect` removed (`backend/setta/websockets/connect.py`).
- Frontend endpoints/types regenerated to include bootstrap routes (`frontend/src/utils/generatedEndpoints.ts`, `frontend/src/utils/generatedTypes.ts`).
- Frontend auth handling wired for fetch and websocket auth loss, with auth-loss notifications pointing to the full bootstrap URL for cross-origin dev (`frontend/src/utils/endpointUtils.ts`, `frontend/src/state/actions/websocketReceive.ts`, `frontend/src/utils/c_addresses.ts`).

Not started yet:
- None.

## Current Code Touchpoints (What Exists Today)
- CLI entrypoint: `backend/setta/start.py` (Click group, startup prints bootstrap URL, `--no-open` for local-only).
- Server: `backend/setta/server.py` (FastAPI app, static frontend mount, auth middleware).
- Constants: `backend/setta/utils/constants.py` (host/port, frontend origins).
- Backend state: `backend/setta/server_state.py` (no session metadata).
- Frontend boot: `frontend/src/components/Pages/GlobalWrapper.tsx` (polls `backendInitStatus`).
- Fetch helpers: `frontend/src/utils/endpointUtils.ts` (sends cookies with `credentials: "include"`).
- Websockets: `frontend/src/state/actions/websocketReceive.ts` (auth-close handling points to bootstrap URL).
- Endpoint generation: `frontend/generation/convert_endpoints.py`, `frontend/src/utils/generatedEndpoints.ts`.

## New Runtime Artifacts
- `setta_files/run/` (new): per-session runtime metadata + secrets.
  - `setta_files/run/sessions/<session_id>/session.json`
  - `setta_files/run/sessions/<session_id>/secret`
  - `setta_files/run/logs/nohup.out` (only when `setta connect` starts Setta with `nohup`)
  - No on-disk used-tokens file; nonce tracking stays in memory only.
  - Rationale: keep sessions scoped to the workspace so `setta status` and `setta connect` can read metadata directly from the project folder (no global registry).
  - Example `session.json`:
    ```json
    {
      "id": "9f2c4b",
      "workspacePath": "/work/my-project",
      "host": "127.0.0.1",
      "port": 61234,
      "pid": 48219,
      "startedAt": "2025-02-20T10:05:32.111Z",
      "secretPath": "setta_files/run/sessions/9f2c4b/secret"
    }
    ```
- Example flow: `ssh dev@host "bash -lc 'cd /work/my-project && setta status --connect-info --json'"` returns a base64-encoded JSON payload (prefixed with `__SETTA_JSON_B64__`) containing the session + a fresh bootstrap token based on the on-disk secret.

## Backend Implementation Plan

### 1) Session Registry + Metadata
Status: DONE

Create a small session registry that is initialized at server startup and stored on disk for discovery by `setta status` and `setta connect`.

New module(s):
- `backend/setta/sessions/registry.py` (or `backend/setta/run/registry.py`)
  - `SessionMetadata` (Pydantic): `id`, `workspacePath`, `host`, `port`, `pid`, `startedAt`, `secretPath`.
  - `SessionRegistry`:
    - `create_session(...) -> SessionMetadata`
    - `load_sessions() -> list[SessionMetadata]`
    - `find_sessions_by_workspace(path) -> list[SessionMetadata]`
    - `delete_session(session_id)`

Implementation details:
- Canonicalize `workspacePath` using `Path.resolve()` and store as string.
- Session id: short hex (`secrets.token_hex(3)`) or memorable string (no collision checks beyond existence).
- Store PID; use `psutil` to identify stale sessions for CLI list/cleanup.
  - Conservative auto-prune: if PID is missing or clearly not a Setta process, delete session metadata + secret.
  - If PID exists but the host/port is not listening, flag as suspicious but do not delete.
- Create secret file alongside session metadata, chmod `0600` on POSIX.

### 2) Token Model + Auth Manager
Status: DONE

Create a token signer/validator using the per-session secret.

New module(s):
- `backend/setta/auth/tokens.py`
  - Token format: base64url-encoded JSON payload + HMAC signature.
  - Payload fields: `sessionId`, `exp`, `nonce` (random).
  - Validate HMAC, expiration, and single-use nonce (in-memory set per session).
- `backend/setta/auth/cookies.py`
  - Cookie name + settings read from constants.
  - Helper to set and clear cookie values.
  - Set `HttpOnly`, `SameSite=Lax`, `Path=/`; set `Secure` only when running behind HTTPS.

Constants (add to `backend/setta/utils/constants.py`):
- `AUTH_COOKIE_NAME` (`"setta_auth"`)
- `AUTH_COOKIE_MAX_AGE_SECONDS` (12 hours)
- `AUTH_COOKIE_SAMESITE` (`"lax"`)
- `AUTH_COOKIE_SECURE` (default false; true when HTTPS)
- `BOOTSTRAP_TOKEN_TTL_SECONDS` (10 minutes)
- `SESSION_SECRET_BYTES`

### 3) Auth Enforcement for HTTP + Websockets
Status: DONE

Add a global auth guard.

New module(s):
- `backend/setta/middleware/auth.py`
  - `AuthMiddleware` for HTTP:
    - Allowlist `/__setta__/bootstrap` and `/__setta__/bootstrap/consume`.
    - Accept either auth cookie or `Authorization: Bearer <bootstrap token>` on all HTTP routes.
    - When a bootstrap token is used on HTTP, set the auth cookie on the response and mark the token consumed.
  - Helper to extract cookie and validate token (cookie or bootstrap token).
- WebSocket auth:
  - Extend `backend/setta/routers/websocket.py` to validate auth cookie or `Authorization: Bearer` before accepting.
  - Bearer tokens do not set cookies over WebSocket; they only grant the socket access.
  - Close unauthenticated sockets with a clear close code (e.g., 4401).

### 4) Bootstrap Page + Token Consumption
Status: DONE

Serve a minimal HTML bootstrap page directly from the backend.

New router:
- `backend/setta/routers/bootstrap.py`
  - `GET /__setta__/bootstrap`: HTML response with inline script:
    - Read `#token=` fragment or `?token=`.
    - POST token to `/__setta__/bootstrap/consume`.
    - On success: `history.replaceState` to scrub URL and `window.location = "/"`.
    - If no token: show a simple prompt to paste it.
  - `POST /__setta__/bootstrap/consume`:
    - Validate token and set auth cookie.
    - Accept token via JSON body or `Authorization: Bearer`.
    - Reject empty or missing tokens with 401; never accept an empty payload.

Server wiring:
- Import and include router in `backend/setta/server.py` before the catch-all static route.

### 5) Server Startup Behavior
Status: DONE

Refactor `backend/setta/start.py` to:
- Allocate a random port when `--port` is not provided.
- Force host default to `127.0.0.1`.
- Defer UDS support; TCP only for this implementation.
- Write session metadata + secret before uvicorn start.
- Print a ready-to-copy connect hint:
  - Always: session id, bind address, port.
  - If local auto-open is allowed: print bootstrap URL (`/__setta__/bootstrap#token=...`) and open it.
  - If remote or `--no-open`: always print the full manual tunnel snippet (LOCAL_PORT assignment, `ssh -N -L` command, bootstrap URL with fragment token, plain bootstrap URL + token prompt, optional `open`/`xdg-open`/`start`/`python -m webbrowser` hints), plus a `setta connect` example.
- Auto-open browser only when:
  - `stdin` is a TTY
  - no `SSH_*` env vars
  - GUI env is available (`DISPLAY`, `WAYLAND_DISPLAY`, or macOS check).
- Always pass `--no-open` when started remotely via `setta connect`.

Remove or rename the existing websocket-based `setta connect`:
- Deleted `backend/setta/websockets/connect.py`.
- CLI `connect` is reserved for the new SSH helper.

### 6) CLI: `setta status --connect-info`
Status: DONE

Add a `status` subcommand that prints connection info (human-readable or JSON).

New CLI flow (Click) in `backend/setta/start.py`:
- `setta status --connect-info [--json] [--workspace PATH] [--session ID] [--latest]`
  - Reads session metadata from `setta_files/run/`.
  - Optionally filters by workspace path.
  - Canonicalize `--workspace` with `Path.resolve()` before filtering so it matches stored `workspacePath`.
  - Mints a bootstrap token with the session secret.
  - If multiple sessions match:
    - In TTY mode and without `--json`, prompt the user to pick a session (or `--latest`).
    - In non-TTY or when `--json` is used, require `--session` or `--latest` and exit non-zero otherwise.
  - Outputs:
    - session id
    - bind address + port
    - remote start command (copy/paste on host, if needed)
    - bootstrap URL with fragment token
    - plain bootstrap URL (no token)
    - `setta connect` example line (with `--workspace`)
    - manual tunnel snippet (includes `LOCAL_PORT=...`, `ssh -N -L ... -o ExitOnForwardFailure=yes`, fragment URL, plain bootstrap URL + token, and optional `open`/`xdg-open`/`start`/`python -m webbrowser` hints)
  - JSON output should include: `session`, `bootstrapUrlFragment`, `bootstrapUrlPlain`, `sshTunnelCommand`.
  - For robustness over SSH, `--json` prints a single line prefixed with `__SETTA_JSON_B64__` followed by base64-encoded JSON, so banners/MOTDs do not break parsing.

### 7) CLI: `setta connect user@host --workspace /path`
Status: DONE

Replace `setta connect` with an SSH orchestration helper.

Implementation outline:
- Accept `ssh_target` as `user@host` (or `host`) and require `--workspace /path`.
  - For IPv6, use bracketed hosts like `user@[2001:db8::1]`.
  - Optional `--ssh-args` appends SSH flags to every SSH invocation (start, status, tunnel), for example `--ssh-args "-p 2222 -J bastion"`.
- Resolve the remote workspace path (from `--workspace`) to a canonical path (`~`, env vars, symlinks) via SSH (for example, `bash -lc 'cd <path> && pwd -P'`), then use that path for session matching and for `--workspace` when polling `setta status --connect-info`.
- Resolve remote start command:
  - Prefer `--remote-cmd`.
  - Else search `./.venv/bin/activate`, `./venv/bin/activate`, `./env/bin/activate`.
  - Else fall back to `poetry run setta` or `uv run setta` if available.
  - If `CONDA_PREFIX` is set, run `setta`.
  - Else `setta` on PATH.
- Shell fallback: prefer `bash -lc`. If `bash` is missing, try `sh -lc` and use POSIX `.` for activation (`. .venv/bin/activate`). If neither shell is available, exit with a clear error and a `--remote-cmd` example.
- Start remote setta if no session:
  - Run `ssh <ssh_args> target "bash -lc 'cd <path> && <cmd> --no-open'"` (detached).
  - Use `nohup` + background: `mkdir -p setta_files/run/logs && nohup <cmd> --no-open > setta_files/run/logs/nohup.out 2>&1 &`
  - If `nohup` is missing, fall back to `setsid`; if neither exists, exit with a clear error suggesting `--remote-cmd`.
- Poll `ssh <ssh_args> target "bash -lc 'cd <path> && <resolved_cmd> status --connect-info --json --session <id>'"` (or `--latest`) and parse the `__SETTA_JSON_B64__` payload.
- If multiple sessions:
  - Interactive selection when TTY.
  - Allow `d<number>` to delete a session (confirm, stop server, remove metadata).
  - Non-TTY requires `--session` or `--latest`.
- Tunnel + open:
  - Use `ssh <ssh_args> -N -L local_port:127.0.0.1:<remote_port> -o ExitOnForwardFailure=yes`.
  - For `--detach`, background the tunnel and print the PID.
  - For `--print-only`, emit the tunnel command + bootstrap URL and exit.
  - For default, open browser to `/__setta__/bootstrap#token=...` and keep tunnel in foreground.
  - Support `--local-port` to force the local bind port.
  - Support `--no-open` to skip browser launch.

## Frontend Implementation Plan

### 1) Fetch + Websocket Auth
Status: DONE

Update frontend networking to send cookies and handle auth loss.

Files to change:
- `frontend/src/utils/endpointUtils.ts`
  - Add `credentials: "include"` on `fetch` calls.
- `frontend/src/state/actions/websocketReceive.ts`
  - Detect auth-close (e.g., 4401) and notify; point users to `/__setta__/bootstrap`.
- `frontend/src/utils/c_addresses.ts`
  - Add backend origin helper for non-API routes.

### 2) Boot Flow Handling
Status: DONE

`GlobalWrapper` currently polls `backendInitStatus`. With strict auth, `/` and static assets are protected, so the UI only loads after the auth cookie is set via `/__setta__/bootstrap`.

Chosen approach:
- Do not add a frontend 401 redirect. The bootstrap page is the only unauthenticated entrypoint.
- Direct visits to `/` without a cookie should return 401 with a minimal HTML body that points users to `/__setta__/bootstrap` (no redirect). `setta connect` and manual instructions must open `/__setta__/bootstrap` (fragment token preferred).

## Generated Endpoints + Types
Status: DONE

Add new routes + types, then regenerate TS bindings.

Backend:
- `backend/setta/types/routes.py`
  - `BOOTSTRAP_PAGE`, `BOOTSTRAP_CONSUME`, optional `STATUS_CONNECT_INFO` if exposed as HTTP.
- New Pydantic models in `backend/setta/types/auth.py` (or `types/session.py`).

Frontend:
- Run `pnpm generate` (after `source activate.sh && cd frontend`).
- Update uses of new endpoints only through `frontend/src/utils/generatedEndpoints.ts`.

## Code Removal (Explicit)
- Removed legacy websocket CLI `setta connect` and its helper `backend/setta/websockets/connect.py`.
- Open-browser behavior now targets the bootstrap URL and is local-only (TTY + GUI, no SSH).

## Documentation Notes (Manual Alternatives)
- Include the optional single-SSH-session example when a known remote port is available.
- Include the optional single-terminal suggestions for no-local-install workflows (detach remote or background the tunnel).
- These are documentation-only; no extra flags or new commands required.

## Verification Checklist (Manual + Minimal Tests)
- Start `setta` locally, ensure it binds to loopback + random port.
- Confirm `/` returns 401 without cookie.
- Open `/__setta__/bootstrap#token=...`, verify cookie set + redirect.
- Verify websocket connection requires auth cookie.
- Run `setta status --connect-info`, ensure snippet prints with fresh token.
- Run `setta connect user@host --workspace /path`, ensure tunnel + browser open.

## Sequencing (Recommended)
1) DONE: Session registry + token signer + constants.
2) DONE: Auth middleware + bootstrap routes.
3) DONE: CLI refactor (`status`, `connect`).
4) DONE: Frontend auth handling (cookies + websocket auth loss notification).
5) DONE: Endpoint generation + cleanup.
