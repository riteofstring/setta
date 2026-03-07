# Phase 6 Set Watch Code Enabled Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_section_style_color` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_watch_code_enabled`.

Go already owns the runtime mutation and IDE HTTP route for this project-scoped
Watch Code structural toggle. The remaining gap is MCP parity over that
existing owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_section_style_color` MCP parity is complete
- `set_watch_code_enabled` MCP parity is the active slice
- Go already owns `set_watch_code_enabled` in:
  - `internal/projectstate/watch_code.go`
  - `internal/httpapi/project_routes.go`
- Python tags `set_watch_code_enabled` as a structural project-state tool
- enabling Watch Code requires the MCP server to pass the real workspace root
  through to the Go runtime so existing watched inputs baseline immediately

## Scope

This focused slice covers:

- a Go MCP `set_watch_code_enabled` structural tool
- reuse of the existing Go `SetWatchCodeEnabled(...)` runtime owner
- project-scoped structural invocation over the existing agentic-context
  boundary
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural rejection when scoped chat context does not allow unscoped
    project mutations
  - structural success in unscoped project context
  - temporary-id translation for `projectConfigId`
  - enabling with existing watched inputs baselining through the real Go
    runtime owner
  - watch-code workspace/input validation mapping to MCP `invalid_arguments`

## Non-Goals

- `set_watch_code_inputs`
- compare-and-set Watch Code tools
- changing Watch Code scan/diff/runtime semantics
- adding scoped section-target metadata to a project-scoped mutation
- any new Watch Code runtime owner work beyond MCP transport parity

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-5-watch-code-runtime-and-callable-refresh.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/watch-code.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/routers/project_manager.py`
- `tests/project_state/test_watch_code.py`
- `internal/projectstate/watch_code.go`
- `internal/projectstate/watch_code_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/agentic_context.go`

## Current Python Behavior

Python `BaseProjectManager.set_watch_code_enabled(...)`:

1. resolves the single-config project state
2. updates `projectConfig.watchCodeEnabled`
3. baselines existing watched inputs when toggling from disabled to enabled
4. tags the tool as `access_type="structural"`
5. persists and broadcasts through the standard project-state update path

The Go runtime already owns the same mutation through
`internal/projectstate.Runtime.SetWatchCodeEnabled(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce project-scoped structural
    access, and delegate to the existing Go runtime owner
- keep this tool `structural`
  - Python already treats it as a structural mutation rather than a write
- keep it project-scoped
  - do not invent section-target metadata for a mutation that only needs
    `projectConfigId`
- pass the real workspace root through MCP
  - enable-time baselining is runtime-owned and depends on canonical
    workspace-root resolution
- reuse runtime-owned Watch Code validation
  - workspace-root-required and invalid-input-path failures should map to MCP
    `invalid_arguments`
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_watch_code_enabled` MCP tool.
   - `accessType: structural`
   - input: `projectConfigId`, `enabled`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `enabled`
   - validate structural invocation context
   - delegate to `projectState.SetWatchCodeEnabled(...)` with `workspaceRoot`

3. Extend mutation error normalization.
   - map Watch Code workspace/input validation failures to
     `invalid_arguments`

4. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural denial behavior for scoped contexts
   - structural success and baseline-on-enable behavior
   - temporary-id translation for `projectConfigId`
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetWatchCodeEnabled|TestMCPToolCallRouteSetWatchCodeEnabledAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetWatchCodeEnabledOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetWatchCodeEnabledOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetWatchCodeEnabled|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient' -count=1 -timeout 420s`

## Open Questions

- none at slice start

## Next Recommended Step

- move to `set_watch_code_inputs` as the next bounded Go-owned Watch Code
  mutation slice after `set_watch_code_enabled`

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_watch_code_enabled`.
