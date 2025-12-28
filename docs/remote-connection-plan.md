# Plan: Remote Client + Agent (Approach 2)

## Goals
- Let users run the UI locally while running compute and filesystem work on a remote host.
- Hide SSH, port forwarding, and tokens behind a simple remote-connect flow.
- Keep the remote surface area private by default (loopback or Unix socket).
- Make sessions per-user and per-session, not a shared server.

## Non-goals
- Multi-tenant security across users with root access.
- Replacing SSH with a new transport.
- Maintaining backward compatibility with the current remote UI workflow.

## Progress (Done)
- Backend now runs as an agent-only app: no static UI mounting and no HTML serving.
- Startup paths no longer open a browser or require bundled frontend assets (CLI + background launcher).
- Auth is now token-gated across HTTP, websockets, and MCP SSE; the backend requires a token file and websocket clients send the token.
- Agent startup now requires `--session-id` + `--token-file` and writes `~/.setta/run/<session>/` metadata (pid, logs, session.json).
- Agent startup supports `--uds` and `--session-root`, and updates session metadata once the server is bound.
- Agent startup disables `--reload` to keep session metadata consistent.
- Local UI server now serves the bundled frontend and exposes a runtime config endpoint (`/__setta__/config`).
- Frontend networking now pulls base URL + token from runtime config for HTTP + websockets (legacy static address constants removed).
- Legacy CLI websocket connect command and handlers removed; no CLI remote-connect entrypoint exists yet.

## User Experience
- A remote-connect command starts or reuses a remote session and opens the local UI.
- A disconnect command tears down the tunnel and asks the agent to exit.
- A status command shows active sessions and local tunnels.
- The user never copies ports or tokens by hand.

## Architecture Overview

### Local Client (new)
- CLI entrypoint that:
  - boots the local UI (browser or local webview)
  - bootstraps a remote agent over SSH
  - establishes an SSH tunnel
  - injects the auth token into local UI requests
- Stores local session metadata in `~/.setta/run/<session>/local.json`.

### Remote Agent (new or split)
- Runs under the remote Unix user account.
- Provides API endpoints and websockets for project state, filesystem, and remote compute.
- Must support:
  - `--session-id`
  - `--token-file`
  - `--uds` (preferred) or `--host 127.0.0.1 --port 0`
  - `--project-root` (optional)
- Writes remote session metadata in `~/.setta/run/<session>/`.

### Transport
- SSH is the only transport.
- Preferred: SSH forwards to a Unix domain socket owned by the user.
- Fallback: SSH forwards to `127.0.0.1:<ephemeral-port>`.

### Auth
- Per-session token stored in a remote file with `0600`.
- Token required for all HTTP routes and websocket upgrades.
- Local UI reads the token from a local cache and sends `Authorization: Bearer <token>`.

## Session Layout (Remote)
```
~/.setta/run/<session>/
  agent.sock            # Unix socket (if used)
  agent.pid             # PID of remote agent
  token                 # 0600 token file
  session.json          # metadata: version, ports, start time
  logs/agent.log
```

## Connection Flow
1. Local client chooses a session id and a local port.
2. Local client SSHes in and:
   - creates `~/.setta/run/<session>` with 0700
   - writes token file with umask 077
   - starts the remote agent with `--uds` or `--host 127.0.0.1 --port 0`
   - returns the chosen port or socket path
3. Local client establishes SSH forwarding to the remote UDS or port.
4. Local UI points to `http://127.0.0.1:<localport>` and sends the token on every request.
5. If the tunnel drops, the client reconnects and either reuses the same session or mints a new one.

## CLI Design
- Provide commands for remote-connect, disconnect, and status (names TBD).
- Optional command to list remote sessions and last activity.
- No CLI commands are implemented yet; the new flow will arrive in Phase 2.

## Remote Agent Design
- Option A: split the current FastAPI app into:
  - "agent" app with only remote endpoints and websockets
  - "local" app or UI server for local use
- Option B: keep one app but allow a mode that disables static UI serving.
- Add authentication middleware for HTTP and websocket routes.
- Keep endpoint names aligned with frontend `generatedEndpoints`.

## Local UI Design
- DONE: Serve the existing frontend bundle locally:
  - production: static assets packaged into the Python install
  - development: allow a flag to use Vite dev server
- DONE: Provide a local config endpoint that stores the remote base URL and token in memory.
- Provide a Python environment selector for the remote host and persist the chosen interpreter path for language server startup.
- Allow listing available remote environments and accept a manual path (similar to VSCode).

## Authentication Details
- HTTP: require `Authorization: Bearer <token>`.
- Websocket: send token as `Sec-WebSocket-Protocol` or query param and validate on connect.
- No token fallback.

## Phase Plan

### Phase 0: Design and Validation
- Decide between split app vs single app with modes.
- Decide whether to prefer UDS by default and on which platforms.
- Confirm how to package the local UI with the Python distribution.

### Phase 1: Remote Agent Core
- DONE: Add auth middleware and websocket auth checks.
- DONE: Add agent startup options for token file, UDS or loopback, and session metadata.
- DONE: Add basic session directory creation, pid/log file creation, and metadata writing.

### Phase 2: Local Client and SSH Bootstrap
- Build the remote-connect CLI flow:
  - SSH bootstrap script that starts the agent and prints listen info
  - local tunnel setup
  - local session metadata tracking
- Build the disconnect and status commands.

### Phase 3: Local UI Wiring
- DONE: Add a local UI server that serves the built frontend and exposes a runtime config endpoint.
- DONE: Store token in memory only (no disk) and inject into HTTP + websocket calls.
- DONE: Frontend networking now relies on runtime config and still routes via `generatedEndpoints`.

### Phase 4: Reliability and Lifecycle
- Reconnect behavior for dropped tunnels.
- Idle timeout and cleanup options.
- Explicit sessions cleanup command for old remote run dirs.

### Phase 5: Docs and Release
- Update docs for the new workflow.
- Add a migration guide for users coming from the old remote UI flow.

## Testing and Verification
- Manual:
  - Connect to a remote host, confirm local UI works.
  - Attempt to curl the remote loopback port without token, expect 401.
  - Open a websocket without token, expect refusal.
  - Restart the local client and reattach to an existing session.
- Automated:
  - Session bootstrap test verifies session.json creation and starting status.
- Automated (later):
  - Integration test that boots an agent and verifies token-gated routes.

## Open Questions
- Should we allow multiple concurrent sessions per user?
- How should Windows handle UDS (fallback to loopback TCP)?
- How do we want to store local session metadata if multiple remotes are active?
- Do we want to support remote project root selection at connect time?
- Should the remote Python interpreter selection be per-session or per-project, and should we auto-detect a default (for example, a local .venv on the remote)?
