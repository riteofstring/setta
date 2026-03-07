# Phase 6 Set Project Config Codegen Targets Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_watch_code_inputs` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_project_config_codegen_targets`.

Go already owns the runtime mutation, validator boundary, Python generated
section reconciler boundary, and IDE HTTP route for this project-scoped
structural update. The remaining gap is MCP parity over that existing owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_watch_code_inputs` MCP parity is complete
- `set_project_config_codegen_targets` MCP parity is now complete
- Go already owns `set_project_config_codegen_targets` in:
  - `internal/projectstate/codegen_targets.go`
  - `internal/httpapi/project_routes.go`
  - `internal/codegen`
  - `internal/plugins`
- Python tags `set_project_config_codegen_targets` as a structural
  project-state tool
- Go MCP now exposes `set_project_config_codegen_targets` as an unscoped
  structural tool over that existing owner
- focused MCP server, authenticated HTTP bridge, and IDE SSE/route coverage
  landed for structural denial, temporary-id translation, raw target-object
  decoding, plugin-target validation wiring, and Python generated-section
  reconciliation through the real app runtime

## Scope

This focused slice covers:

- a Go MCP `set_project_config_codegen_targets` structural tool
- reuse of the existing Go `SetProjectCodegenTargets(...)` runtime owner
- reuse of the existing Go codegen-target validator boundary for plugin targets
- reuse of the existing Go Python generated-section reconciler boundary for
  Python target enablement and mutation
- project-scoped structural invocation over the existing agentic-context
  boundary
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural rejection when scoped chat context does not allow unscoped
    project mutations
  - structural success in unscoped project context
  - temporary-id translation for `projectConfigId`
  - pass-through of ordered `codegenTargets` payload objects without MCP-local
    target-shape heuristics
  - plugin target validation failures surfacing as MCP `invalid_arguments`
  - Python target generated-section reconciliation over the real app/runtime
    wiring

## Non-Goals

- broad codegen runtime changes
- new plugin worker/runtime work
- redesigning Python codegen generated-section reconciliation
- compare-and-set codegen target tools
- app-definition MCP work
- broad frontend mutation-transport changes outside this MCP slice

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-4-codegen-targets-mutation-transport.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/codegen-targets.md`
- `docs/reference/codegen-section-policy-and-metadata.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/routers/project_manager.py`
- `tests/project_state/test_codegen_targets.py`
- `internal/projectstate/codegen_targets.go`
- `internal/projectstate/codegen_targets_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/app/app.go`
- `internal/app/app_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/agentic_context.go`

## Current Python Behavior

Python `BaseProjectManager.set_project_config_codegen_targets(...)`:

1. resolves the single-config project state
2. rejects duplicate target languages
3. validates plugin targets against active registrations
4. stores ordered `projectConfig.codegenTargets`
5. removes or recreates Python generated sections and bindings as needed
6. clears `entryCodeBlockId` if disabling Python codegen removed the generated
   entry section
7. tags the tool as `access_type="structural"`
8. persists and broadcasts through the standard project-state update path

The Go runtime already owns the same source-of-truth mutation through
`internal/projectstate.Runtime.SetProjectCodegenTargets(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate top-level argument shapes, enforce project-scoped
    structural access, and delegate to the existing Go runtime owner
- keep this tool `structural`
  - Python already treats it as a structural mutation rather than a write
- keep it project-scoped
  - do not invent section-target metadata for a mutation that only needs
    `projectConfigId`
- pass ordered target objects through after shape validation only
  - target normalization, duplicate-language checks, plugin validation, and
    Python generated-section reconciliation stay runtime-owned
- reuse the existing validator and reconciler dependencies
  - MCP should not fork codegen-target validation or Python generated-section
    mutation logic
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `set_project_config_codegen_targets` MCP tool.
   - `accessType: structural`
   - input: `projectConfigId`, `codegenTargets`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `codegenTargets` as an array of objects
   - validate structural invocation context
   - delegate to `projectState.SetProjectCodegenTargets(...)` with the existing
     validator and Python reconciler dependencies

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural denial behavior for scoped contexts
   - structural success with temporary-id translation
   - invalid target payload or validation failures surface as
     `invalid_arguments`
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage using real app-level validator/reconciler wiring

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetProjectConfigCodegenTargets|TestMCPToolCallRouteSetProjectConfigCodegenTargetsAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetProjectConfigCodegenTargetsOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetProjectConfigCodegenTargetsOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetProjectConfigCodegenTargets|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient' -count=1 -timeout 420s`

## Open Questions

- none at slice start
- none after implementation

## Next Recommended Step

- rerank the remaining mutation inventory now that the codegen-target slice is
  complete instead of guessing the next cluster in advance

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `set_project_config_codegen_targets`.
- 2026-03-07: Go MCP now exposes `set_project_config_codegen_targets` as a
  structural tool over the existing codegen-target runtime owner.
- 2026-03-07: the MCP handler passes ordered target objects through after
  top-level shape validation only; duplicate-language checks, plugin
  validation, and Python generated-section reconciliation stay runtime-owned.
- 2026-03-07: app-level MCP coverage now exercises both real plugin target
  validation/materialization and Python generated-section reconciliation
  through the IDE server wiring.
