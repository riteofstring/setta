# Setta CLI contract

This reference describes the CLI surface intended for agent integrations.

## `setta auth`

Emit machine-readable auth metadata for the current or selected session.

Options:
- `--workspace PATH` (`-w`) filter sessions by workspace.
- `--session ID` select a session by ID.
- `--latest` select the newest session.
- `--base-url` override the backend base URL.
- `--json` emit strict JSON only (no extra stdout).

JSON output:
```json
{
  "baseUrl": "http://127.0.0.1:8000",
  "apiBaseUrl": "http://127.0.0.1:8000/api",
  "cookieHeader": "Cookie: setta_auth=...",
  "cookie": "setta_auth=...",
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

## `setta api`

Call Setta HTTP endpoints with auto-auth.

Arguments:
- `ROUTE_OR_PATH` (Route enum key like `GET_LATEST_PROJECT_STATE` or raw path like
  `/getLatestProjectState`).

Payload options:
- `--json` inline JSON payload
- `--stdin` read JSON payload from stdin
- `--file PATH` read JSON payload from a file

Auth options (priority order):
- `--cookie-header` / `--cookie`
- `--auth-json PATH`
- `--auth-stdin`
- Auto-auth from newest session in the current workspace

Other options:
- `--base-url` override backend base URL
- `--method` override HTTP verb (default: `POST`)
- `--json-output` emit strict JSON only

Error contract (for `--json-output`):
```json
{
  "error": "HTTPError",
  "status": 403,
  "url": "http://127.0.0.1:8000/api/getLatestProjectState",
  "body": { "detail": "Unauthorized" }
}
```
