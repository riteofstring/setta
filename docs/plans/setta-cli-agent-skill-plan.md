# Setta CLI agent skill plan

## Goal
Provide a CLI-first, non-MCP integration surface that yields the best results for agent frameworks (Codex, Claude Code, OpenCode) by giving them a consistent, machine-readable way to authenticate and call Setta APIs. The CLI surface should match what MCP exposes to the LLM.

## Why CLI-first
- All three agent frameworks can reliably run shell commands.
- CLI avoids Python dependencies, HTTP client boilerplate, and MCP server requirements.
- A stable JSON contract enables tooling-agnostic integrations and skill documents.

## Scope
- Add CLI commands that expose auth + MCP-parity tool calls as pure JSON.
- Publish a skill document that instructs agents to use these CLI commands.
- Update docs to formalize the contract and examples.
- Optimize the LLM experience so one command is enough for most API calls.
- Follow the skills specification at https://agentskills.io/ for packaging and metadata.

## Non-goals
- Replace MCP or SettaRunner for existing users.
- Build a full SDK or CLI-based query language.
- Support share-mode auth flows beyond existing public endpoints.

## Current state (relevant pieces)
- `setta status --connect-info --json` returns bootstrap URLs + session metadata.
- Bootstrap token can be exchanged for an auth cookie via `POST /__setta__/bootstrap/consume`.
- MCP tools are registered via `setta.mcp.tool_setup` and exposed in `setta.mcp.server`.
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

### 2) `setta tools`
Return the exact MCP tool list (schemas + descriptions) that the LLM sees, but
expose **bare tool names** (no `setta__` prefix) for CLI ergonomics.

Behavior:
- Outputs strict JSON only.
- Includes the same schemas and descriptions as MCP, but uses bare tool names.
- Hidden MCP args (settaMcpHidden) are omitted.

### 3) `setta api`
Call Setta MCP tools with **auto-auth** for the lowest-friction LLM experience.

Behavior:
- **Auto-auth default**: resolve auth from the newest local session in the current
  workspace (same logic as SettaRunner). This makes a single command sufficient
  in the common case.
- Optional explicit auth sources override auto-auth (in priority order):
  - `--cookie-header` / `--cookie`
  - `--auth-json PATH` (file produced by `setta auth --json`)
  - `--auth-stdin` (reads JSON from stdin)
- Accept a bare MCP tool name (e.g. `getLatestProjectState`), and resolve it
  internally to the namespaced MCP tool name.
- Sends JSON payload via `--json` or `--stdin`/`--file`.
- Emits only raw JSON on stdout when `--json-output` is set.

Examples:
```
setta api getLatestProjectState --json '{"projectConfigId":"..."}'
```

Error contract (for `--json-output`):
```
{
  "error": "HTTPError",
  "status": 403,
  "tool": "getLatestProjectState",
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

### Phase 1: Tool-call backend + CLI
- Add a generic HTTP endpoint to invoke MCP tools by name.
- Add `setta tools` to emit the MCP tool list (schemas + descriptions).
- Add `setta auth` and `setta api` commands in `backend/setta/start.py`.
- `setta api` must accept bare MCP tool names only and call the tool-invocation endpoint.
- Reuse session selection helpers already used by `setta status`.
- Reuse bootstrap token flow and auth cookie minting logic (same as SettaRunner).
- Ensure JSON output is strict JSON with no extra logs.
- Implement `setta api` auto-auth using the local session registry by default.
- Avoid duplicate logic: if MCP-specific code needs to be reused for CLI/tool discovery,
  move it into shared helpers and have both MCP and CLI consume the shared logic.

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
  - `setta tools --json` parity with MCP registration.
  - `setta api` tool resolution and error contract.
- Add a lightweight integration test that starts a local session, calls `setta auth`,
  then uses `setta api` against `getLatestProjectState`.

### Implementation details (carry-forward)
- Tool list source: generate from MCP registry (SETTA_MCP_TOOLS / SETTA_INIT_MCP_TOOLS)
  using the same FastMCP tool metadata pipeline; output bare names.
- Tool call endpoint: define a single HTTP route (e.g. `/__setta__/tools/call`) that
  accepts `{ "tool": "<bare_name>", "arguments": { ... } }`, resolves the MCP tool,
  invokes it, and returns the result. On error, return a JSON error contract.
- Name resolution: CLI accepts bare tool names only; internally prefix with `setta__`
  to match MCP namespacing; reject unknown names with a clear JSON error.
- Parity rule: merge init + discoverable tools, omit hidden args (settaMcpHidden),
  keep descriptions from tool docstrings.
- No MCP client dependency: CLI uses backend HTTP endpoint + local registry only.

## Open questions
- Should `setta auth` support remote sessions via SSH (or defer to `setta connect`)?
- Should `setta auth --json` redact cookies by default unless `--show-cookie` is set?
- Should `setta api` fall back to prompting for session selection when multiple
  sessions exist, or error with guidance for agents?
- Do we need an explicit `--no-mcp` flag for server startup, or is this strictly for
  agent integrations that choose not to use MCP?
