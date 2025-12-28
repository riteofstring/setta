# Remote Connection Refactor Plan (High-Level)

This document summarizes the current architecture and the refactoring work needed
to implement the remote-connection plan in `docs/remote-connection-plan.md`.

## Current Architecture Notes
- CLI entry point `setta.start:cli` starts an agent-only FastAPI server with no
  static UI serving and no browser launch (`backend/setta/start.py`,
  `backend/setta/server.py`, `backend/setta/backend_launcher.py`).
- The backend is monolithic: all HTTP routes, websockets, MCP SSE endpoints, LSP,
  terminals, and project state live under one app instance (`backend/setta/server.py`).
- No auth layer exists; HTTP routes, websockets, and MCP SSE are open by default
  (`backend/setta/routers`, `backend/setta/websockets`, `backend/setta/mcp/server.py`).
- LSP is started from `SettaFastAPIState` with workspace `CWD` and settings sourced
  from `SettingsState.languageServer` (a raw `dict`) (`backend/setta/server_state.py`,
  `backend/setta/lsp/*`, `backend/setta/types/generated/settings_state.py`).
- The frontend now derives API + websocket base URLs from runtime config served
  by the local UI server (`/__setta__/config`) and injects auth tokens into HTTP
  + websocket connections (`frontend/src/utils/runtimeConfig.ts`,
  `frontend/src/utils/endpointUtils.ts`).
- Settings are persisted via `SettingsFile` in `setta_files/` and broadcast over websockets,
  but there is no UI workflow for selecting a Python interpreter
  (`backend/setta/database/settings_file.py`).
- Listener clients connect using host/port only and have no token support
  (`backend/setta/api/listener.py`).

## Refactor Workstreams
### 1) Split local UI server vs. remote agent
- DONE: Backend app serves only API + websockets (static UI mounting removed).
- DONE: Added a local UI server that serves the bundled frontend and provides a
  runtime config endpoint (base URL + token).
- DONE: `backend/setta/backend_launcher.py` and `backend/setta/start.py` no longer
  open browsers or check for frontend bundles.

### 2) Add session + auth plumbing
- Add a session bootstrap layer that creates `~/.setta/run/<session>/` metadata
  (token, socket/port, pid, logs) on the remote host.
- DONE: Implement token-gated auth for all HTTP routes, websockets, and MCP SSE endpoints.
- DONE: Require a token file at backend startup; no unauthenticated fallbacks (token stored in `SETTA_AUTH_TOKEN` env var).
- DONE: Resolve the auth token during app startup to avoid import-order coupling.
- DONE: CLI and listener websocket clients now send the token via `Sec-WebSocket-Protocol`.
- DONE: Agent startup requires `--session-id` + `--token-file`, supports `--uds`/`--session-root`, and writes `session.json`, `agent.pid`, and `logs/agent.log`.

### 3) CLI refactor for remote connect flows
- Add new CLI subcommands (`setta connect`, `setta disconnect`, `setta status`)
  that handle SSH bootstrap + tunnel lifecycle.
- Keep the existing websocket CLI (`setta connect` today) but rename or re-home it
  to avoid conflict with the new remote connect command.
- DONE: Disable `--reload` for agent sessions to keep session metadata consistent.
- Store local session metadata under `~/.setta/run/<session>/local.json` as described
  in the plan.

### 4) Frontend networking rework (base URL + auth)
- DONE: Replaced static `C_ADDRESSES` usage with a runtime config store that supplies
  the remote base URL and token (legacy constants removed).
- DONE: `endpointUtils` now attaches `Authorization: Bearer <token>` for HTTP.
- DONE: Websocket creation (frontend + terminals) now includes the token
  (`Sec-WebSocket-Protocol`).
- DONE: Frontend networking continues to route through `generatedEndpoints`.

### 5) Language server environment selection
- Add a typed model for `SettingsState.languageServer` so interpreter path and
  related options are explicit (and shared with the frontend via generation).
- Add backend endpoints to list remote Python environments and to update the
  selected interpreter path.
- Persist the selected interpreter (per-session or per-project) and trigger
  LSP restart on changes.

### 6) Workspace root + storage isolation
- Replace global `CWD` assumptions in LSP and path normalization so the workspace
  root can be set per session/project.
- Ensure `setta_files/` storage can be rooted under the remote session directory
  (or per-project root) instead of the agent CWD.

### 7) Compatibility surface (listener + MCP)
- Update listener APIs to accept auth tokens and remote base URLs.
- Ensure MCP SSE endpoints are token-protected and still reachable through the
  local proxy/tunnel path.

### 8) Tests + docs scaffolding
- DONE: Add session bootstrap test to verify session.json creation and starting status.
- Add auth and tunnel smoke tests that exercise token-gated HTTP + websocket flows.
- Document manual verification steps for remote connect and LSP interpreter
  selection (per repo test guidance).

## Deliverables (High-Level)
- New agent-mode backend start path (no static UI).
- DONE: Local UI server/proxy with runtime config endpoint.
- Token-gated HTTP, websocket, and MCP SSE routes.
- DONE: Runtime-configurable frontend networking.
- Runtime-configurable interpreter selection UX.
- Session metadata on both local and remote sides.
