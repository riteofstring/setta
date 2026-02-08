# Setta CLI Commands

This doc covers the commands exposed by the `setta` CLI (implemented in
`backend/setta/start.py`). Most local commands read/write `setta_files/` in the
current working directory, so run them from the workspace you want to manage.

Deployment commands (`setta share`, `setta app`) serve a published deployment
snapshot:
- With `--deployment-name`, deployments are resolved under
  `setta_files/deployments/` relative to the current working directory (so run
  from the workspace).
- With `--deployment-root`, you can point at an absolute deployment folder and
  run from anywhere.

Only IDE mode sessions started via `setta` are recorded in the session
registry, so `setta status`, `setta auth`, `setta stop`, and `setta connect`
apply to those sessions (not `setta share` / `setta app` servers).

There are two types of CLI commands: local commands that operate on the
workspace where they are executed, and remote helpers that use SSH to target
another host.

| Command | Local workspace | Remote helper | Notes |
| --- | --- | --- | --- |
| `setta` | yes | no | Start the server in the current workspace. |
| `setta share` | yes | no | Start the server in share deployment mode. |
| `setta app` | yes | no | Start the server in app deployment mode. |
| `setta version` | yes | no | Prints the local install version. |
| `setta export-db` | yes | no | Placeholder export command. |
| `setta status` | yes | no | Reads local session registry; SSH in to run remotely. |
| `setta auth` | yes | no | Emit machine-readable auth info for API calls. |
| `setta tools` | yes | no | Emit the MCP tool list (JSON only). |
| `setta api` | yes | no | Call Setta MCP tools with auto-auth. |
| `setta stop` | yes | yes | Remote stop requires an SSH target. |
| `setta connect` | no | yes | SSH helper for remote sessions. |

## `setta` (start the server)

Starts the backend server in the current workspace, creates a session entry,
prints a bootstrap URL + token, and (when possible) auto-opens the browser.

Options:
- `--reload` enables live-reload (Uvicorn).
- `--host` sets the bind host (default: `127.0.0.1`).
- `--port` sets the bind port (random if omitted).
- `--log-level` overrides logging (`critical`, `error`, `warning`, `info`, `debug`).
- `--no-open` skips auto-opening the browser.

Examples:
```sh
setta
setta --host 127.0.0.1 --port 8000 --no-open
```

## `setta share` (serve a share deployment)

Starts the backend server in share deployment mode. In deployment mode, auth is
disabled and all stateful routes require a `shareSessionId` (created via
`POST /share/deployments/current/session`).

Options:
- `--deployment-root PATH` uses an explicit deployment root (must contain
  `manifest.json` + `project.json` + `policy.json`).
- `--deployment-name NAME` selects a deployment under `setta_files/deployments/`.
  Pair this with:
  - `--version vN` or `--latest`.
- `--reload` is rejected in deployment mode.
- Global options are shared with `setta`: `--host`, `--port`, `--log-level`,
  `--no-open`.

Examples:
```sh
setta share --deployment-name demo-share --latest
setta share --deployment-name demo-share --version v3 --host 0.0.0.0 --port 8000 --no-open
setta share --deployment-root /opt/setta/deployments/demo-share/v5 --host 0.0.0.0 --port 8000
```

## `setta app` (serve an app deployment)

Starts the backend server in app deployment mode. App mode serves an app
deployment snapshot (AppSpec + theme + assets) using the same session + policy
model as share mode.

Options:
- `--deployment-root PATH` uses an explicit app deployment root.
- `--deployment-name NAME` selects a deployment under `setta_files/deployments/`.
  Pair this with:
  - `--version vN` or `--latest`.
- `--reload` is rejected in deployment mode.
- Global options are shared with `setta`: `--host`, `--port`, `--log-level`,
  `--no-open`.

Examples:
```sh
setta app --deployment-name demo-app --latest
setta app --deployment-name demo-app --version v2 --host 0.0.0.0 --port 8000 --no-open
setta app --deployment-root /opt/setta/deployments/demo-app/v2 --host 0.0.0.0 --port 8000
```

## `setta version`

Prints the installed Setta version.

Example:
```sh
setta version
```

## `setta export-db`

Reserved for exporting the database. The handler is currently a placeholder
(`TODO` in the code), so this command does not produce output yet.

Options:
- `--readable` exports in a human-readable format.
- `--readable-with-variants` includes variants in the readable export.
- `--output PATH` writes the readable export to a custom path (default: `setta_files/project.readable.yaml`).

## `setta status`

Reads the local session registry and prints connection info for running
sessions. This is also what `setta connect` calls on the remote host to fetch
bootstrap tokens and session metadata.

Required usage:
- `--connect-info` prints the bootstrap URLs, token, and tunnel hints.

Other options:
- `--workspace PATH` (`-w` works too) filters sessions by workspace (default: all sessions).
- `--session ID` selects a specific session.
- `--latest` selects the newest session.
- `--json` emits a base64 JSON payload prefixed with `__SETTA_JSON_B64__`.
- `--list-sessions` lists sessions (requires `--json`).
- `--delete-session ID` stops and removes the session (local only).

Examples:
```sh
setta status --connect-info --workspace /path/to/project --latest
setta status --connect-info --json -w /path/to/project
setta status --list-sessions --json
```

## `setta auth`

Emit machine-readable auth metadata for the selected session. This is meant for
agents or scripts that need a stable JSON contract.

Options:
- `--workspace PATH` (`-w` works too) filters sessions by workspace (default: current).
- `--session ID` selects a specific session.
- `--latest` selects the newest session.
- `--base-url` overrides the backend base URL for the output.
- `--json` emits strict JSON only (no extra stdout).

JSON output schema:
```json
{
  "baseUrl": "http://127.0.0.1:8000",
  "apiBaseUrl": "http://127.0.0.1:8000/api",
  "cookieHeader": "Cookie: setta_auth=....",
  "cookie": "setta_auth=....",
  "cookieName": "setta_auth",
  "session": {
    "id": "...",
    "workspacePath": "...",
    "host": "127.0.0.1",
    "port": 8000,
    "pid": 12345,
    "startedAt": "2025-01-01T12:00:00.000000"
  },
  "bootstrapUrlFragment": "http://127.0.0.1:8000/__setta__/bootstrap#token=...",
  "bootstrapUrlPlain": "http://127.0.0.1:8000/__setta__/bootstrap",
  "source": "bootstrap"
}
```

Example:
```sh
setta auth --json --latest > /tmp/setta_auth.json
```

## `setta tools`

Emit the MCP tool list (JSON only). Use this to discover tool names, schemas,
and descriptions. Tool names are bare (no `setta__` prefix).

Example:
```sh
setta tools > /tmp/setta_tools.json
```

## `setta api`

Call Setta MCP tools with auto-auth for the current workspace.

Inputs:
- `TOOL_NAME` (bare MCP tool name; see `setta tools`)
- `--json` inline JSON arguments
- `--stdin` read JSON arguments from stdin
- `--file PATH` read JSON arguments from a file

Auth sources (highest priority first):
- `--cookie-header` / `--cookie`
- `--auth-json PATH` (from `setta auth --json`)
- `--auth-stdin`
- Auto-auth from the newest session in the current workspace

Other options:
- `--base-url` override backend base URL
- `--json-output` emit raw JSON only on stdout

Output:
- MCP `CallToolResult` JSON (includes `content`, `structuredContent`, `isError`).

Examples:
```sh
setta api getProjectConfigNamesAndIds --json-output
setta api get_latest_project_state_summary --json '{"projectConfigId":"..."}' --json-output
setta api get_latest_project_state_summary --auth-json /tmp/setta_auth.json \
  --json '{"projectConfigId":"..."}' --json-output
```

Error contract (for `--json-output`):
```json
{
  "error": "HTTPError",
  "status": 403,
  "tool": "get_latest_project_state_summary",
  "body": { "detail": "Unauthorized" }
}
```

## `setta stop`

Stops one or more Setta sessions, either locally (default) or on a remote host.

Local stop:
- `setta stop --workspace /path` (or `-w`) selects sessions by workspace.
- Use `--session`, `--latest`, or `--all` to choose the target set.

Remote stop:
- Provide an SSH target to stop remote sessions:
  `setta stop user@host --workspace /path` (or `-w`).
- Use `--ssh-args` to pass extra SSH options.
- Use `--remote-cmd` to override how `setta` is invoked remotely.

Examples:
```sh
setta stop -w /path/to/project --latest
setta stop user@host -w /path/to/project --all
```

## `setta connect`

SSH helper for remote Setta sessions. It resolves the remote workspace, starts
Setta if needed, selects a session, opens a local SSH tunnel, and optionally
opens the browser to the bootstrap URL.

Required:
- `ssh_target` (e.g., `user@host`)
- `--workspace PATH` (`-w` works too)
  - Remote paths can use `~` (e.g., `~/work/project`).

Options:
- `--session ID` selects a specific session.
- `--latest` selects the newest session.
- `--ssh-args` passes extra SSH options.
- `--remote-cmd` overrides the remote Setta command.
- `--local-port` pins the local tunnel port.
- `--detach` backgrounds the tunnel process.
- `--print-only` prints the tunnel command and URLs without running them.
- `--no-open` skips auto-opening the browser.
- `--verbose` prints SSH + resolution details.

Examples:
```sh
setta connect user@host --workspace /path/to/project
setta connect user@host --workspace /path/to/project --local-port 61000 --detach
setta connect user@host --workspace /path/to/project --print-only
setta c user@host -w /path/to/project
```
