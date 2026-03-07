# Phase 6 Set Watch Code Inputs Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_watch_code_enabled` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_watch_code_inputs`.

Go already owns the runtime mutation and IDE HTTP route for this project-scoped
Watch Code structural input update. The remaining gap is MCP parity over that
existing owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_watch_code_enabled` MCP parity is complete
- `set_watch_code_inputs` MCP parity is the active slice
- Go already owns `set_watch_code_inputs` in:
  - `internal/projectstate/watch_code.go`
  - `internal/httpapi/project_routes.go`
- Python tags `set_watch_code_inputs` as a structural project-state tool
- runtime-owned Watch Code input normalization already handles repo-relative
  path resolution, dedupe, and baseline-for-new-inputs behavior

## Scope

This focused slice covers:

- a Go MCP `set_watch_code_inputs` structural tool
- reuse of the existing Go `SetWatchCodeInputs(...)` runtime owner
- project-scoped structural invocation over the existing agentic-context
  boundary
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural rejection when scoped chat context does not allow unscoped
    project mutations
  - structural success in unscoped project context
  - temporary-id translation for `projectConfigId`
  - passing both `watchCodeFolders` and `watchCodeFiles` through to the Go
    runtime without MCP-local normalization heuristics
  - baseline-only-new-inputs behavior when Watch Code is already enabled
  - watch-code workspace/input validation mapping to MCP `invalid_arguments`

## Non-Goals

- compare-and-set Watch Code tools
- changing Watch Code normalization or baseline semantics
- adding scoped section-target metadata to a project-scoped mutation
- any new Watch Code runtime owner work beyond MCP transport parity
- app-definition MCP work

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

Python `BaseProjectManager.set_watch_code_inputs(...)`:

1. resolves the single-config project state
2. snapshots the previous Watch Code config inputs
3. normalizes and stores `watchCodeFolders`
4. normalizes and stores `watchCodeFiles`
5. when Watch Code is already enabled, baselines only the new additions
6. tags the tool as `access_type="structural"`
7. persists and broadcasts through the standard project-state update path

The Go runtime already owns the same mutation through
`internal/projectstate.Runtime.SetWatchCodeInputs(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate argument shapes, enforce project-scoped
    structural access, and delegate to the existing Go runtime owner
- keep this tool `structural`
  - Python already treats it as a structural mutation rather than a write
- keep it project-scoped
  - do not invent section-target metadata for a mutation that only needs
    `projectConfigId`
- pass folder/file inputs through verbatim after shape validation
  - repo-relative normalization, dedupe, blank-path skipping, and outside-root
    rejection stay runtime-owned
- pass the real workspace root through MCP
  - input normalization and baseline-for-new-inputs depend on canonical
    workspace-root resolution
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_watch_code_inputs` MCP tool.
   - `accessType: structural`
   - input: `projectConfigId`, `watchCodeFolders`, `watchCodeFiles`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `watchCodeFolders`
   - read required `watchCodeFiles`
   - validate structural invocation context
   - delegate to `projectState.SetWatchCodeInputs(...)` with `workspaceRoot`

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural denial behavior for scoped contexts
   - structural success and baseline-only-new-inputs behavior
   - temporary-id translation for `projectConfigId`
   - invalid folder/file paths surface as `invalid_arguments`
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetWatchCodeInputs|TestMCPToolCallRouteSetWatchCodeInputsAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetWatchCodeInputsOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetWatchCodeInputsOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetWatchCodeInputs|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient' -count=1 -timeout 420s`

## Open Questions

- none at slice start

## Next Recommended Step

- re-evaluate the remaining Go-owned mutation surface after
  `set_watch_code_inputs` lands instead of assuming the next subsystem cluster

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_watch_code_inputs`.
