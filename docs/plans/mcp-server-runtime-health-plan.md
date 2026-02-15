# MCP Server Runtime Health Plan

## Problem

The Skills/MCP pane currently lists configured servers, not runtime health.

Current behavior:
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` builds the MCP list from `allLLMConfigs.mcpServers`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts` only formats static config fields (`transport`, `url`/`command`).
- No backend route returns per-server connection state from `MultiMCPClient`.

Result: invalid, disconnected, retrying, or missing-env servers look the same as healthy servers.

## Goals

- Show runtime truth for each MCP server (`connected`, `connecting`, `retrying`, `error`, `disabled`, `unknown`).
- Keep config visibility (server id, transport, endpoint, config path).
- Show actionable failure detail without opening backend logs.
- Keep skills behavior unchanged.
- Support external-agent MCP status where the active runtime exposes status APIs/events.

## Non-Goals

- Building full transport diagnostics/traces in v1.
- Changing MCP connection policy (still connect in backend as today).
- Replacing existing backend log events.
- Merging user MCP config files with Setta-injected MCP config entries.

## Proposed UX

In the MCP Servers section, each server row should include:
- `serverId`
- `transport` + endpoint (`url` or `command`)
- status badge (`Connected`, `Connecting`, `Retrying`, `Error`, `Disabled`, `Unknown`)
- optional detail text (`last error`, `last connected`, `tool count`)

Section-level additions:
- summary line (`X connected / Y retrying / Z error`)
- loading state and error state specific to runtime status fetch
- manual refresh continues to work; refreshes both skills and MCP runtime status

## Backend Plan

### 1) Track runtime status inside `MultiMCPClient`

File: `backend/setta/mcp/client.py`

Add an internal per-server status map (key: `server_id`) and update it at each lifecycle transition.

Suggested fields per server:
- `serverId`
- `transport`
- `endpoint`
- `state` (`connecting|connected|retrying|error|disabled|unknown`)
- `lastAttemptAt`
- `lastConnectedAt`
- `lastFailureAt`
- `consecutiveFailures`
- `lastError`
- `missingEnvVar`
- `toolCount`

Transition points:
- before each connect attempt -> `connecting`
- after successful initialize + `list_tools()` -> `connected`
- on handled failures (including `MissingMCPEnvVarError`) -> `error` then `retrying`
- on cleanup/disconnect while loop continues -> `retrying`
- on `stop()` -> `disabled`

Implementation detail:
- add a snapshot method on client (for example `get_server_runtime_statuses()`) that returns plain models/dicts safe for API responses.

### 2) Expose status via API route

Add route constant in `backend/setta/types/routes.py`:
- `GET_MCP_SERVER_RUNTIME_STATUS = "/mcpServerRuntimeStatus"`

Add route handler in `backend/setta/routers/status.py` (IDE-only):
- returns MCP runtime statuses from `state.mcp_client`
- includes config-path context needed by this pane (`llmConfigPath`, `activeSettaFilesLocation`) so frontend can drop a separate `settaHomeInfo` call for MCP display
- accepts optional query params (`chatId`, `engineConfigId`) to resolve external runtime status for the active external run context

Suggested response shape:
- `llmConfigPath: str`
- `activeSettaFilesLocation: str | None`
- `servers: list[MCPServerRuntimeStatus]`
- `externalServers: list[MCPServerRuntimeStatus]` (chat/run scoped)

### 3) Add external-engine MCP getter logic (runtime-scoped)

Primary files:
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/claude_sdk.py`
- `backend/setta/agentic/external_adapters/codex_app_server.py`
- `backend/setta/agentic/external_adapters/opencode_sdk.py`

Collector behavior:
- Attach runtime MCP status snapshots to the active external run/chat context.
- Normalize provider-specific payloads into shared states:
  - `connected`, `connecting`, `retrying`, `error`, `disabled`, `unknown`
- Surface these in `externalServers` from `/mcpServerRuntimeStatus`.

Provider-specific getters:
- Claude SDK (`toolType=claude_code`, `runMode=sdk`):
  - read MCP status from Claude stream init/system payload (`mcp_servers`) while processing run events.
- Codex (`toolType=codex`, `runMode=app_server`):
  - query app-server method `mcpServerStatus/list` from the active session and map returned statuses.
- OpenCode (`toolType=opencode`):
  - `runMode=server`: call OpenCode server `GET /mcp` and map statuses.
  - `runMode=sdk`: if no reliable status endpoint is available for the active run, mark external MCP entries as `unknown`.
- Plugin adapters:
  - default `unknown` unless plugin provides explicit MCP status payloads.

Behavior rules:
- External MCP status is best-effort and scoped to active run/chat.
- If there is no active external run, return an empty `externalServers` list.
- Do not infer `connected` purely from config presence.

### 4) Generated endpoint/types sync

After backend route/type changes:
- `source activate.sh && cd frontend && pnpm generate`

## Frontend Plan

### 1) Consume runtime status endpoint

File: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`

- add MCP runtime status fetch state (`loading`, `error`, `data`)
- fetch on mount
- fetch on manual refresh
- optional polling every 5s while pane is visible
- combine `servers` and `externalServers` into grouped UI sections

### 2) Replace static-only grouping logic

File: `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.ts`

- replace/extend `groupMcpServersByConfigPath` to operate on runtime status entries
- add helpers:
  - badge label/style mapping by runtime state
  - summary counts
  - stable sorting (`error`/`retrying` first, then `connected`, then `serverId`)

### 3) Render runtime health in MCP section

File: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx`

- add status badge per server
- show detail line:
  - connected: `toolCount` + last connected timestamp
  - error/retrying: last error text (truncate with tooltip)
- visually distinguish source:
  - `Setta MCP` (from `MultiMCPClient`)
  - `External Runtime` (from Claude/Codex/OpenCode getters)
- keep existing path copy/reveal controls

## Testing Plan

### Backend

- Extend `tests/mcp/test_multi_mcp_client.py`:
  - status transitions for success, retry loop, missing env var, and stop
  - status snapshot includes expected metadata (`toolCount`, timestamps, error fields)
- Add route test (new file recommended):
  - `tests/routers/test_mcp_server_runtime_status_route.py`
  - verifies route shape and IDE-mode restriction behavior
- Add external-run status tests:
  - Claude init/event payload -> normalized MCP status entries
  - Codex `mcpServerStatus/list` mapping
  - OpenCode server `/mcp` mapping
  - OpenCode sdk fallback -> `unknown`

### Frontend (Vitest)

- Update/add tests for MCP status utilities in:
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSkillsMcpViewerUtils.test.ts`
- Add component-level viewer test for:
  - loading state
  - mixed statuses rendering
  - error detail display
  - refresh behavior

### Frontend (Playwright)

- Add/update e2e coverage in `frontend/tests/e2e/` to assert MCP runtime status badges render and update after refresh.

## Rollout Phases

1. Backend status tracking + route + generated types.
2. External-agent getter wiring for Claude/Codex/OpenCode.
3. Frontend MCP section consumes route and renders status badges (including source labels).
4. Polling + richer details (timestamps/tool counts), then docs updates.

## Acceptance Criteria

- MCP pane no longer implies configured servers are healthy by default.
- At least one misconfigured/unreachable server displays `Error` or `Retrying` with actionable detail.
- Connected servers display `Connected` with non-empty runtime metadata.
- Skills list behavior and SKILL.md preview remain unchanged.
- During active external runs, external MCP statuses are shown when provider runtime exposes them.
- When provider runtime does not expose reliable MCP status, UI shows `Unknown` (not a false healthy signal).

## Documentation Follow-up

After implementation, update:
- `docs/reference/mcp-system-overview.md`
- `docs/reference/setta-files.md` (MCP pane data sources)
- route reference docs (if maintained separately)
