# Remote Connection Refactor Plan (High-Level)

This document summarizes the current architecture and the refactoring work needed
to implement the remote-connection plan in `docs/remote-connection-plan.md`.

## Current Architecture Notes
- CLI entry point `setta.start:cli` starts an agent-only FastAPI server with no
  static UI serving and no browser launch (`backend/setta/start.py`,
  `backend/setta/server.py`, `backend/setta/backend_launcher.py`).
- Remote-connect CLI commands now exist and are implemented in
  `backend/setta/remote_connect.py`, wired through `backend/setta/start.py`.
- The backend is monolithic: all HTTP routes, websockets, MCP SSE endpoints, LSP,
  terminals, and project state live under one app instance (`backend/setta/server.py`).
- Auth is token-gated across HTTP, websockets, and MCP SSE (`backend/setta/middleware.py`,
  `backend/setta/websockets`, `backend/setta/mcp/server.py`).
- LSP is started from `SettaFastAPIState` with an explicit workspace root (no CWD assumptions) and settings sourced
  from typed `SettingsState.languageServer` (`LanguageServerSettings`) (`backend/setta/server_state.py`,
  `backend/setta/lsp/*`, `backend/setta/types/generated/settings_state.py`).
- The frontend now derives API + websocket base URLs from runtime config served
  by the local UI server (`/__setta__/config`) and injects auth tokens into HTTP
  + websocket connections (`frontend/src/utils/runtimeConfig.ts`,
  `frontend/src/utils/endpointUtils.ts`).
- Settings are persisted via `SettingsFile` in `setta_files/` and broadcast over websockets,
  and backend endpoints now support interpreter selection, but there is no UI workflow yet
  (`backend/setta/database/settings_file.py`).
- Workspace/storage roots are explicit runtime config; `setta_files/` resolves under the storage root and session.json records both roots.
- Listener clients now send tokens via `Sec-WebSocket-Protocol` (`backend/setta/api/listener.py`).
- Legacy CLI websocket connect handlers and routes have been removed; remote-connect CLI entrypoints exist.
- Remote-connect bootstrap now passes `--workspace-root` (required) and optional `--storage-root` to the agent.

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
- DONE: Add CLI subcommands that handle SSH bootstrap + tunnel lifecycle
  (`remote-connect`, `remote-disconnect`, `remote-status`).
- DONE: Remove the legacy websocket CLI connect command and handlers to avoid conflicts.
- DONE: Disable `--reload` for agent sessions to keep session metadata consistent.
- DONE: Store local session metadata under `~/.setta/run/<session>/local.json` as described
  in the plan.

### 4) Frontend networking rework (base URL + auth)
- DONE: Replaced static `C_ADDRESSES` usage with a runtime config store that supplies
  the remote base URL and token (legacy constants removed).
- DONE: `endpointUtils` now attaches `Authorization: Bearer <token>` for HTTP.
- DONE: Websocket creation (frontend + terminals) now includes the token
  (`Sec-WebSocket-Protocol`).
- DONE: Frontend networking continues to route through `generatedEndpoints`.

### 5) Language server environment selection
- DONE: Added a typed model for `SettingsState.languageServer` so interpreter path and
  related options are explicit (and shared with the frontend via generation).
- DONE: Added backend endpoints to list remote Python environments and to update the
  selected interpreter path.
- DONE: Persist the selected interpreter in settings and trigger LSP restart on changes.

### 6) Workspace root + storage isolation
- DONE: Replace global `CWD` assumptions with an explicit workspace root configured per session.
- DONE: Root `setta_files/` under a configurable storage root (defaults to session run dir).
- DONE: Thread workspace/storage roots through agent startup, session metadata, and remote-connect bootstrap.
- DONE: Normalize paths + LSP + Python env discovery against the configured workspace root.

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
- Backend interpreter selection (typed settings + env listing + interpreter update endpoints); UI pending.
- Session metadata on both local and remote sides.
- DONE: Workspace root + storage isolation (`setta_files/` under storage root; session metadata includes workspace/storage roots).
