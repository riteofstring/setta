# Setta CLI agent skill plan

## Goal
Provide a CLI-first, non-MCP integration surface that yields the best results for agent frameworks (Codex, Claude Code, OpenCode) by giving them a consistent, machine-readable way to authenticate and call Setta APIs.

## Why CLI-first
- All three agent frameworks can reliably run shell commands.
- CLI avoids Python dependencies, HTTP client boilerplate, and MCP server requirements.
- A stable JSON contract enables tooling-agnostic integrations and skill documents.

## Scope
- Add CLI commands that expose auth + API calls as pure JSON.
- Publish a skill document that instructs agents to use these CLI commands.
- Update docs to formalize the contract and examples.
 - Optimize the LLM experience so one command is enough for most API calls.

## Non-goals
- Replace MCP or SettaRunner for existing users.
- Build a full SDK or CLI-based query language.
- Support share-mode auth flows beyond existing public endpoints.

## Current state (relevant pieces)
- `setta status --connect-info --json` returns bootstrap URLs + session metadata.
- Bootstrap token can be exchanged for an auth cookie via `POST /__setta__/bootstrap/consume`.
- All API routes are exposed under `/api/*` (OpenAPI at `/api/openapi.json`).
- CLI lives in `backend/setta/start.py` with Click commands.

## Proposed CLI surface

### 1) `setta auth`
Return machine-readable auth info for the current or selected session.

Behavior:
- Works locally by default (current workspace).
- Supports `--workspace`, `--session`, `--latest` (align with `setta status`).
- Supports `--json` to emit JSON only (no extra output).
- Uses bootstrap flow to mint an auth cookie.
- Optional: `--base-url` override for non-default host/port.

JSON output contract (no extra text on stdout):
```
{
  "baseUrl": "http://127.0.0.1:8000",
  "apiBaseUrl": "http://127.0.0.1:8000/api",
  "cookieHeader": "Cookie: setta_session=....",
  "cookie": "setta_session=....",
  "cookieName": "setta_session",
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

Notes:
- `cookieHeader` is ready to paste into HTTP tools.
- `cookieName` should use `C.AUTH_COOKIE_NAME`.
- `source` indicates how auth was minted (bootstrap, session-secret, env).

### 2) `setta api`
Call Setta HTTP endpoints with **auto-auth** for the lowest-friction LLM experience.

Behavior:
- **Auto-auth default**: resolve auth from the newest local session in the current
  workspace (same logic as SettaRunner). This makes a single command sufficient
  in the common case.
- Optional explicit auth sources override auto-auth (in priority order):
  - `--cookie-header` / `--cookie`
  - `--auth-json PATH` (file produced by `setta auth --json`)
  - `--auth-stdin` (reads JSON from stdin)
- Accept either:
  - a route key (maps to `Route` enum, ex: `GET_LATEST_PROJECT_STATE`)
  - a raw path (ex: `/getLatestProjectState`)
- Sends JSON payload via `--json` or `--stdin`/`--file`.
- Emits only raw JSON on stdout when `--json-output` is set.

Examples:
```
setta api GET_LATEST_PROJECT_STATE --json '{"projectConfigId":"..."}'

setta api /getLatestProjectState --stdin
```

Error contract (for `--json-output`):
```
{
  "error": "HTTPError",
  "status": 403,
  "url": "http://127.0.0.1:8000/api/getLatestProjectState",
  "body": { ... }
}
```

## Skill document strategy (CLI-first)

### Skill contents
- New skill folder (suggested): `skills/setta-cli/`
- `SKILL.md`:
  - Description: "Use Setta CLI to authenticate and call Setta APIs without MCP."
  - Quickstart: **single-command flow** with `setta api ...`
  - Fallback: run `setta auth --json` only when auto-auth fails.
  - Common workflows: get project state, run detached, read artifacts.
  - Warnings: only use CLI output when `--json` is set; do not parse human output.
- `references/cli.md`: CLI contract + examples.
- `references/http-api.md`: essential routes and payloads, link to OpenAPI.

### Agent-specific usage
- Codex/OpenCode: rely on SKILL.md and CLI commands.
- Claude Code: include a short CLAUDE.md snippet pointing to `setta auth` + `setta api`.

## Implementation plan

### Phase 1: CLI commands
- Add `setta auth` and `setta api` commands in `backend/setta/start.py`.
- Reuse session selection helpers already used by `setta status`.
- Reuse bootstrap token flow and auth cookie minting logic (same as SettaRunner).
- Ensure `--json` output is strict JSON with no extra logs.
- Implement `setta api` auto-auth using the local session registry by default.

### Phase 2: Docs
- Update `docs/setta-cli-commands.md` with new commands and JSON contracts.
- Add a short `docs/agent-cli-integration.md` (optional) describing CLI-only flows.

### Phase 3: Skill packaging
- Add new skill folder with `SKILL.md` + references.
- Keep SKILL.md concise, push detail into references.
- Include minimal example commands that use `setta auth` + `setta api`.

### Phase 4: Tests
- Add tests under `tests/start/` for:
  - `setta auth --json` output schema.
  - `setta api` route resolution and error contract.
- Add a lightweight integration test that starts a local session, calls `setta auth`,
  then uses `setta api` against `GET_LATEST_PROJECT_STATE`.

## Open questions
- Should `setta api` accept route keys only, raw paths only, or both?
- Should `setta auth` support remote sessions via SSH (or defer to `setta connect`)?
- Should `setta auth --json` redact cookies by default unless `--show-cookie` is set?
- Should `setta api` fall back to prompting for session selection when multiple
  sessions exist, or error with guidance for agents?
- Do we need an explicit `--no-mcp` flag for server startup, or is this strictly for
  agent integrations that choose not to use MCP?
