# Setta CLI Commands

This doc covers the commands exposed by the `setta` CLI (implemented in
`backend/setta/start.py`). Local commands read/write `setta_files/` in the
current working directory, so run `setta`, `setta status`, or `setta stop`
from the workspace you want to manage. `setta connect` can be run from anywhere
because it targets a remote workspace via `--workspace`.

There are two types of CLI commands: local commands that operate on the
workspace where they are executed, and remote helpers that use SSH to target
another host.

| Command | Local workspace | Remote helper | Notes |
| --- | --- | --- | --- |
| `setta` | yes | no | Start the server in the current workspace. |
| `setta version` | yes | no | Prints the local install version. |
| `setta export-db` | yes | no | Placeholder export command. |
| `setta status` | yes | no | Reads local session registry; SSH in to run remotely. |
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
