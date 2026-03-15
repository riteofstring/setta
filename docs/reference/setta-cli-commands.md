# Setta CLI Commands

This doc covers the commands exposed by the shipped `setta` CLI. The published
entrypoint now uses `backend/setta/entrypoint.py` as a thin dispatcher to the
packaged Go binary for the current shipped command surface. The old
source-only Python `backend/setta/start.py` CLI has been removed. Root help,
bare `setta plugins` / `setta plugins lock` navigation, and invalid root argv
all resolve through the packaged Go CLI boundary.
Local commands operate on a workspace root (code operations) and a
`setta_files` root (state/runtime). By default both roots follow the current
working directory and the default Setta home, but you can override runtime
identity and roots with:
`--workspace`, `--profile`, `--profile-lookup-home`, `--setta-home`,
`--setta-files-root`, `--setta-files-location`, and `--runtime-root`
(or matching env vars).
`setta_files` resolution still follows local/global rules from
`docs/reference/setta-files.md`.

Deployment commands (`setta share`, `setta app`) serve published deployment
snapshots. With `--deployment-name`, deployments are resolved under
`setta_files/deployments/` (relative to the active `setta_files` root); with
`--deployment-root`, you can point at an explicit deployment folder and run from
anywhere.

Only IDE mode sessions started via `setta` / `setta launch` are recorded in the
session registry, so `setta status`, `setta auth`, `setta stop`, and
`setta connect` apply to those sessions (not `setta share` / `setta app` servers).

There are two types of CLI commands: local commands that operate on the
workspace where they are executed, and remote helpers that use SSH to target
another host.

| Command | Local workspace | Remote helper | Notes |
| --- | --- | --- | --- |
| `setta` | yes | no | Start the server in the current workspace. |
| `setta paths` | yes | no | Resolve the active workspace/runtime paths without starting the server. |
| `setta share` | yes | no | Start the server in share deployment mode. |
| `setta app` | yes | no | Start the server in app deployment mode. |
| `setta version` | yes | no | Prints the local install version. |
| `setta export-db` | yes | no | Write a readable YAML export of the current project state. |
| `setta backups` | yes | no | List and restore local project backups. |
| `setta plugins` | yes | no | Fully Go-owned packaged plugin command cluster. |
| `setta status` | yes | no | Reads local session registry; SSH in to run remotely. |
| `setta auth` | yes | no | Emit machine-readable auth info for API calls. |
| `setta mcp` | yes | no | Run the stdio bridge for external MCP clients. |
| `setta tools` | yes | no | Emit the MCP tool list (JSON only). |
| `setta api` | yes | no | Call Setta MCP tools with auto-auth. |
| `setta launch` | yes | no | Start (or reuse) a local session and emit bootstrap JSON. |
| `setta launcher` | yes | no | Desktop-launch entrypoint with installer metadata + workspace picker fallback. |
| `setta stop` | yes | yes | Remote stop requires an SSH target. |
| `setta connect` | no | yes | SSH helper for remote sessions. |

## Global runtime path flags

These options can be passed before subcommands (for example,
`setta --profile dev status --connect-info`):

- `--workspace PATH` selects the workspace root.
- `--profile NAME` selects `<setta_home>/profiles/<NAME>.json`.
- `--profile-lookup-home PATH` overrides where runtime profiles are resolved.
- `--setta-home PATH` overrides runtime Setta home.
- `--setta-files-root PATH` forces a specific state root.
- `--setta-files-location {auto,local,global}` requests local/global resolution mode.
- `--runtime-root PATH` overrides runtime root (sessions/logs/secrets).

Rules:

- `--setta-files-root` conflicts with `--setta-files-location`.
- Canonical naming constraints apply to resolved roots (see `docs/reference/setta-files.md`).

Env equivalents:

- `SETTA_WORKSPACE_ROOT`
- `SETTA_PROFILE`
- `SETTA_PROFILE_LOOKUP_HOME`
- `SETTA_HOME`
- `SETTA_FILES_ROOT`
- `SETTA_FILES_LOCATION`
- `SETTA_RUNTIME_ROOT`

## `setta` (start the server)

Starts the backend server in the current workspace, creates a session entry,
prints a bootstrap URL + token, and (when possible) auto-opens the browser.

Options:
- `--host` sets the bind host (default: `127.0.0.1`).
- `--port` sets the bind port (random if omitted).
- `--log-level` overrides logging (`critical`, `error`, `warning`, `info`, `debug`).
- `--no-open` skips auto-opening the browser.
- `--workspace PATH` sets the workspace root.
- `--profile NAME` selects a runtime profile.
- `--profile-lookup-home PATH` overrides profile lookup home.
- `--setta-home PATH` overrides Setta home.
- `--setta-files-root PATH` forces an explicit `setta_files` root.
- `--setta-files-location {auto,local,global}` controls local/global resolution
  mode when no explicit root is set.
- `--runtime-root PATH` overrides runtime root.
- `--reload` is not supported by the shipped Go CLI.
Env equivalents:
`SETTA_WORKSPACE_ROOT`, `SETTA_PROFILE`, `SETTA_PROFILE_LOOKUP_HOME`,
`SETTA_HOME`, `SETTA_FILES_ROOT`, `SETTA_FILES_LOCATION`, and
`SETTA_RUNTIME_ROOT`.

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
- omitted `--host` / `--port` values default to `127.0.0.1` and an OS-assigned
  port.
- binding to a non-loopback host prints a warning because share mode disables
  auth.
- `--reload` is rejected in deployment mode.
- Global options are shared with `setta`: `--host`, `--port`, `--log-level`,
  `--no-open`, plus runtime path flags (`--workspace`, `--profile`,
  `--profile-lookup-home`, `--setta-home`, `--setta-files-root`,
  `--setta-files-location`, `--runtime-root`).

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
- omitted `--host` / `--port` values default to `127.0.0.1` and an OS-assigned
  port.
- binding to a non-loopback host prints a warning because app mode disables
  auth.
- `--reload` is rejected in deployment mode.
- Global options are shared with `setta`: `--host`, `--port`, `--log-level`,
  `--no-open`, plus runtime path flags (`--workspace`, `--profile`,
  `--profile-lookup-home`, `--setta-home`, `--setta-files-root`,
  `--setta-files-location`, `--runtime-root`).

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

## `setta paths`

Resolves the active workspace/runtime paths using the same config/profile/env
logic as normal startup, but does not start the server.

Options:
- `--env` emits `KEY=value` lines for scripts.
- `--json` emits JSON explicitly (default output is JSON when no mode flag is passed).
- Global runtime path flags are shared with `setta`: `--workspace`, `--profile`,
  `--profile-lookup-home`, `--setta-home`, `--setta-files-root`,
  `--setta-files-location`, and `--runtime-root`.

Examples:
```sh
setta paths
setta paths --env --setta-files-location local
```

## `setta export-db`

Exports the current project state in readable YAML form.

If neither `--readable` nor `--readable-with-variants` is provided, the command
defaults to `--readable-with-variants`.

Options:
- `--readable` exports a readable YAML payload without section variant names.
- `--readable-with-variants` includes section variant names in the readable
  export.
- `--output PATH` writes the readable export to a custom path (default:
  `setta_files/project.readable.yaml`).

Output:
- writes YAML to the selected path
- prints `Wrote readable export to <path>` on success

Examples:
```sh
setta export-db
setta export-db --readable
setta export-db --output /tmp/project.readable.yaml
```

## `setta backups`

Manage local backups stored in `setta_files/backups/`.
Backups are byte-for-byte copies of `setta_files/project.json` created during project
saves when `settings.backend.autobackup` is enabled (default: `true`). Frequency and
retention are controlled by `settings.backend.autobackupFreq` (seconds) and
`settings.backend.autobackupKeepLastN` (count). Restore stashes created by
`setta backups restore` are named `restore_stash_*.json` and are not shown by
`setta backups list`.

### `setta backups list`

Lists backups in descending timestamp order (most recent first).

Options:
- `--json` emits machine-readable JSON:

  ```json
  [
    { "index": 1, "path": "...", "timestamp": "..." }
  ]
  ```

- `--limit N` limits output entries (must be `>= 1`).

Examples:
```sh
setta backups list
setta backups list --json
setta backups list --limit 20
```

### `setta backups restore`

Restores a backup by overwriting `setta_files/project.json`.

Exactly one selector is required:
- `--latest` restores the most recent backup.
- `--index N` restores the Nth item from `setta backups list` (1-based).
- `--path PATH` restores a specific backup file.

Safety:
- Refuses to restore if a Setta session appears to be running for the current workspace.
- Use `--force` to bypass the active-session check.
- Creates a `restore_stash_*.json` copy of the existing `project.json` before overwriting it (when the file exists).
- Use `--yes` to skip the confirmation prompt.

Examples:
```sh
setta backups restore --latest
setta backups restore --index 3 --yes
setta backups restore --path /abs/path/to/backup_20260101_120000_123456.json --force --yes
```

## `setta plugins`

Manages plugin authoring, install state, and runtime activation.

Source scopes:

- `workspace`: `<workspace>/.setta_plugins`
- `setta_files`: `<setta_files_root>/plugins`
- `global`: `<setta_home>/plugins`

Source specs for install/update flows:

- `github:<owner>/<repo>[#ref]` (also accepts `@ref`)
- `pypi:<package>[==version]`

Scope selection notes:

- Many mutation commands accept `--scope`.
- Shortcuts `--global` and `--setta-files` are also supported.
- Use exactly one selector per command (`--scope` or one shortcut).

Subcommands:

- `setta plugins init <plugin_id> [--template frontend|backend|full|content] [--out PATH]`
  - Scaffold a plugin package with `setta.plugin.json`, `pyproject.toml`, and template files.
  - `backend` scaffolds `backend/go.mod` plus `backend/main.go`.
  - `full` scaffolds backend + frontend + content files.
  - Ownership: Go.
- `setta plugins validate <plugin_folder>`
  - Validate a plugin manifest/folder contract.
  - Backend plugins must also pass Go command validation and `go build`.
  - Ownership: Go.
- `setta plugins list [--json]`
  - List discovered plugin runtime status entries.
  - Ownership: Go.
- `setta plugins install <source_spec> [--scope ...] [--installer auto|pip|uv] [--no-enable] [--force] [--json]`
  - Install plugin source into a selected scope.
  - Ownership: Go.
- `setta plugins link <local_plugin_root> [--scope ...] [--no-enable] [--force] [--json]`
  - Link a local folder as an installed plugin (development workflow).
  - Ownership: Go.
- `setta plugins uninstall <plugin_id> [--scope ...] [--json]`
  - Remove a plugin from a scope.
  - Ownership: Go.
- `setta plugins enable <plugin_id> [--json]`
- `setta plugins disable <plugin_id> [--json]`
  - Toggle enablement for the highest-precedence discovered plugin id.
  - Ownership: Go.
- `setta plugins rescan [--json]`
  - Rebuild plugin discovery/runtime status without restarting Setta.
  - Ownership: Go.
- `setta plugins update <plugin_id> [--scope ...] [--to <source_spec_or_version>] [--json]`
  - Update an installed plugin to latest or to a pinned target.
  - Ownership: Go.
- `setta plugins pin <plugin_id> <source_spec_or_version> [--scope ...] [--json]`
  - Shortcut for targeted update/pin.
  - Ownership: Go.
- `setta plugins rollback <plugin_id> [--scope ...] [--json]`
  - Restore previous installed version from plugin history snapshots.
  - Ownership: Go.
- `setta plugins lock write [--json]`
  - Write lockfile at `<workspace>/.setta_plugins/plugins.lock.json`.
  - Ownership: Go.
- `setta plugins lock apply [--check] [--json]`
  - Compare/apply lockfile desired state against current installs.
  - Ownership: Go.
- `setta plugins restart [--json]`
  - Request programmatic backend restart when available.
  - Ownership: Go.
- `setta plugins restart-required [--json]`
  - List plugins pending backend restart and restart capability details.
  - Ownership: Go.

Examples:
```sh
setta plugins init setta-my-plugin --template full --out .
setta plugins validate ./setta-my-plugin

setta plugins install github:owner/repo#v0.1.0 --scope workspace
setta plugins install pypi:setta-my-plugin==0.1.0 --scope setta_files

setta plugins link ./my-local-plugin --scope workspace --force
setta plugins rescan
setta plugins list
setta plugins restart-required

setta plugins lock write
setta plugins lock apply --check
```

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
- `--server-mode ide|launcher` filters by mode. For `--connect-info`, default mode is `ide` unless explicitly overridden.
- `--launcher-origin ORIGIN` optionally includes launcher-origin handoff metadata in `--json --connect-info` output (must be an absolute `http(s)` origin).
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
  "cookieHeader": "Cookie: setta_auth_<sessionId>=....",
  "cookie": "setta_auth_<sessionId>=....",
  "cookieName": "setta_auth_<sessionId>",
  "session": {
    "id": "...",
    "workspacePath": "...",
    "workspacePathCanonical": "...",
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

## `setta mcp`

Start a local stdio bridge that forwards MCP JSON-RPC on stdin/stdout to the
Go-owned `/mcp` SSE endpoint. `setta mcp bridge` is an equivalent explicit
form.

Options:
- `--backend URL` full MCP endpoint URL (default: `http://127.0.0.1:8000/mcp`)
- `--token TOKEN` bootstrap token for auth
- `--bootstrap-url URL` extract the bootstrap token from a URL fragment/query
- `--verbose` emit bridge debug logs on stderr

Auth behavior:
- If `--token` or `--bootstrap-url` is provided, the bridge consumes the
  bootstrap token at `/__setta__/bootstrap/consume` and forwards the returned
  auth cookie to `/mcp`.
- Otherwise it mints the current-session auth cookie from `SETTA_SESSION_ID`.
  If you are running outside the session workspace, also set
  `SETTA_SESSIONS_ROOT`.

Examples:
```sh
setta mcp --backend http://127.0.0.1:8000/mcp
setta mcp --backend http://127.0.0.1:8000/mcp --bootstrap-url http://127.0.0.1:8000/__setta__/bootstrap#token=abc
```

## `setta launch`

Starts or reuses a local session for a workspace and emits JSON output that the
frontend can consume. This command requires `--json`.

Options:
- `--workspace PATH` sets the workspace root (required for detached workspaces).
- `--profile NAME` selects a runtime profile.
- `--profile-lookup-home PATH` overrides where named profiles are resolved.
- `--setta-home PATH` overrides Setta home.
- `--setta-files-root PATH` forces an explicit `setta_files` root.
- `--setta-files-location {auto,local,global}` requests local/global resolution
  mode when no explicit root is set.
- `--runtime-root PATH` overrides runtime root.
- `--timeout SECONDS` overrides the default launch timeout (30s).
- `--json` emits strict JSON only (required).

You can pass these path flags globally (`setta --profile dev launch --json ...`)
or on the `launch` subcommand itself. If both are provided, values must match.

Success payload:
```json
{
  "ok": true,
  "bootstrapUrlFragment": "http://127.0.0.1:8000/__setta__/bootstrap#token=...",
  "workspaceRoot": "/path/to/workspace",
  "settaFilesLocation": "local",
  "settaFilesRoot": "/path/to/workspace/setta_files",
  "runtimeRoot": "/path/to/workspace/setta_files/runtime",
  "settaHome": "/Users/example/.setta",
  "profile": null,
  "sessionId": "...",
  "startedNew": true,
  "session": {
    "id": "...",
    "workspacePath": "...",
    "workspacePathCanonical": "...",
    "host": "127.0.0.1",
    "port": 8000,
    "pid": 12345,
    "startedAt": "2025-01-01T12:00:00.000000"
  }
}
```

Error payload:
```json
{
  "ok": false,
  "error": { "code": "InvalidWorkspace", "message": "..." }
}
```

## `setta launcher`

Desktop-launch entrypoint for OS launchers (`Setta.app`, desktop shortcuts).
It can run directly (`setta launcher`) or manage launcher metadata via
subcommands (`setta launcher setup|status|repair|remove|update`).

Desktop distribution defaults:
- Recommended global install path: `uv tool install setta`
- Upgrade path: `uv tool upgrade setta`
- Uninstall path: `uv tool uninstall setta`
- Convenience installer entrypoints:
  - macOS/Linux shell: `./scripts/install_desktop_launcher.sh`
  - Windows PowerShell: `./scripts/install_desktop_launcher.ps1`
- OS launcher artifact scripts:
  - macOS app bundle: `./scripts/install_macos_launcher.sh` / `./scripts/uninstall_macos_launcher.sh`
  - Windows shortcuts: `./scripts/install_windows_launcher.ps1` / `./scripts/uninstall_windows_launcher.ps1`
  - Linux desktop entry: `./scripts/install_linux_launcher.sh` / `./scripts/uninstall_linux_launcher.sh`
- macOS icon support: `./scripts/install_macos_launcher.sh --icon-path /path/to/Setta.icns`

Advanced `pip install` path remains supported.
When binding launcher metadata from a specific virtual environment, invoke
that environment's `setta` executable explicitly (for example
`/path/to/venv/bin/setta launcher setup --channel pip-venv`).

### `setta launcher` (run)

Starts or reuses a Setta session and optionally opens it.

Workspace resolution order:
- Explicit `--workspace`
- Saved launcher `lastUsedWorkspace`
- Fallback launcher runtime context at the user's home directory (and requests workspace switcher UI)

Run options:
- `--workspace PATH` chooses the workspace.
- `--open-mode {browser,chrome-app}` overrides launcher open mode (default: `chrome-app`).
- `--no-open` skips auto-open.
- `--timeout SECONDS` launch timeout (default: `30`).
- `--json` emits machine-readable payload and never auto-opens.
- `chrome-app` falls back to browser mode automatically when app-mode launch is unavailable.

Success JSON includes:
- `ok`, `bootstrapUrl`, `workspaceRoot`, `sessionId`
- `startedNew`, `reusedSession`
- `sessionServerMode`, `settaHome`, `profile`
- `openMode`, `workspaceBehavior`, `openWorkspaceSwitcher`

Error JSON includes:
- `ok: false`
- `error.code` and `error.message`

Exit codes:
- `0` success
- `2` user-fixable/configuration errors
- `1` unexpected/internal errors

### `setta launcher setup`

Writes launcher metadata under `<setta_home>/launcher/launcher-install.json`.
This is primarily installer-facing (scripts/package-manager hooks).

Options:
- `--channel NAME` install channel label (optional; omitted preserves existing metadata)
- `--install-source {uv-tool,installer-managed,unsupported}` canonical install-source classification
- `--open-mode {browser,chrome-app}` default launcher mode (optional; omitted preserves existing metadata)
- `--workspace-behavior {last-used-or-prompt,always-prompt}` workspace fallback preference
- `--artifact-option NAME=VALUE` configures platform artifact generation (for example `app_name`, `icon_path`, `desktop_shortcut`)
- `--clear-artifact-options` clears previously stored launcher artifact options
- `--install-artifacts` / `--no-install-artifacts` controls managed platform artifact installation; omit both to preserve current behavior
- `--json` emits machine-readable payload

The metadata stores:
- schema version
- explicit launcher target command
- channel + Setta version
- open mode + workspace behavior
- last used workspace
- canonical artifact options
- managed artifact paths

### `setta launcher status`

Reports launcher metadata and health:
- installation state
- target command validity
- managed artifacts present/missing
- update capability (`in_app`, `installer_managed`, `unsupported`)

Options:
- `--json` emits machine-readable payload

### `setta launcher repair`

Rebinds launcher metadata to the current Setta target and preserves launcher
preferences (`openMode`, `workspaceBehavior`, `lastUsedWorkspace`).

Options:
- `--json` emits machine-readable payload

### `setta launcher remove`

Removes launcher metadata and managed artifacts registered in the metadata file.

Options:
- `--json` emits machine-readable payload

### `setta launcher update`

Performs an in-app Setta upgrade for supported channels (`uv`-managed installs),
then re-runs launcher setup against the upgraded executable.

Options:
- `--package SPEC` package spec passed to `uv tool install --upgrade` (default: `setta`)
- `--json` emits machine-readable payload

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
- `--agentic-project-config-id` set `x-setta-project-config-id` (required for most scope-enforced tools; temporary or canonical id).
- `--agentic-chat-id` set `x-setta-chat-id` (optional; temporary or canonical id).
- `--agentic-section-id` set `x-setta-section-id` (required for most scope-enforced tools; temporary or canonical id).
- `--json-output` emit raw JSON only on stdout

Agentic scope notes:
- Most tools return a `CallToolResult` scope error unless you provide at least
  `--agentic-project-config-id` and `--agentic-section-id`.
- A small set of init/utility tools (for example `list_mcp_tools`,
  `search_mcp_tools`, `getProjectConfigNamesAndIds`) are allowed without agentic
  context.

Output:
- MCP `CallToolResult` JSON (includes `content`, `structuredContent`, `isError`).

Examples:
```sh
setta api getProjectConfigNamesAndIds --json-output
setta api get_latest_project_state_summary \
  --agentic-project-config-id "..." \
  --agentic-section-id "..." \
  --json '{"projectConfigId":"..."}' --json-output
setta api get_latest_project_state_summary --auth-json /tmp/setta_auth.json \
  --agentic-project-config-id "..." \
  --agentic-section-id "..." \
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
- `--server-mode ide|launcher` selects stop targets by mode (default: `ide`).

Remote stop:
- Provide an SSH target to stop remote sessions:
  `setta stop user@host --workspace /path` (or `-w`).
- Use `--ssh-args` to pass extra SSH options.
- Use `--remote-cmd` to override how `setta` is invoked remotely.
- To control remote runtime roots/identity, pass global path flags before
  `stop` (for example: `--profile`, `--profile-lookup-home`, `--setta-home`,
  `--setta-files-root`, `--setta-files-location`, `--runtime-root`). These are
  forwarded to remote `setta` calls.

Examples:
```sh
setta stop -w /path/to/project --latest
setta stop user@host -w /path/to/project --all
setta --setta-files-location global stop user@host -w '~/work/project' --latest
setta --profile dev --setta-home '~/.setta-development' stop user@host -w '~/work/project' --latest
```

## `setta connect`

SSH helper for remote Setta sessions. It resolves the remote workspace, starts
Setta if needed, selects a session, opens a local SSH tunnel, and optionally
opens the browser to the bootstrap URL.

Required:
- `ssh_target` (e.g., `user@host`)
- `--workspace PATH` (`-w` works too)
  - Remote paths can use `~`, but quote it so your local shell does not expand it
    (e.g., `-w '~/work/project'`).

Options:
- `--session ID` selects a specific session.
- `--latest` selects the newest session.
- `--ssh-args` passes extra SSH options.
- `--remote-cmd` overrides the remote Setta command.
- Remote root/identity options are passed globally before the subcommand:
  `--profile`, `--profile-lookup-home`, `--setta-home`, `--setta-files-root`,
  `--setta-files-location`, `--runtime-root` (all forwarded to remote `setta`
  calls).
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
setta --setta-files-location global connect user@host -w '~/work/project' --latest
setta --profile dev --setta-files-root '~/state/setta_files_dev' connect user@host -w '~/work/project'
setta c user@host -w /path/to/project
```
