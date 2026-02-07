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

## `setta tools`

Emit the MCP tool list (JSON only). Tool names are bare (no `setta__` prefix).

Output shape:
- JSON array of MCP `Tool` objects (`name`, `description`, `inputSchema`, etc).

## `setta api`

Call Setta MCP tools with auto-auth.

Arguments:
- `TOOL_NAME` (bare MCP tool name; see `setta tools`).

Argument options:
- `--json` inline JSON arguments
- `--stdin` read JSON arguments from stdin
- `--file PATH` read JSON arguments from a file

Auth options (priority order):
- `--cookie-header` / `--cookie`
- `--auth-json PATH`
- `--auth-stdin`
- Auto-auth from newest session in the current workspace

Other options:
- `--base-url` override backend base URL
- `--agentic-project-config-id` set `x-setta-project-config-id` (required for agentic scope enforcement; temporary or canonical id).
- `--agentic-chat-id` set `x-setta-chat-id` (optional; temporary or canonical id).
- `--agentic-section-id` set `x-setta-section-id` (optional; omit for Project Chat / full access; temporary or canonical id).
- `--json-output` emit strict JSON only

Output:
- MCP `CallToolResult` JSON with `content`, `structuredContent`, `isError`.

Error contract (for `--json-output`):
```json
{
  "error": "HTTPError",
  "status": 403,
  "tool": "get_latest_project_state_summary",
  "body": { "detail": "Unauthorized" }
}
```
