# Phase 6 Section Name Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
code-object write parity work.

Go already owns the source-of-truth section-name and rename-refactor
semantics from the earlier project-route migration:

- authoritative section-name validation in `internal/projectstate`
- rename-refactor mode lookup and changed-value planning in `internal/app`
- websocket delivery for frontend rename prompts on the route-backed path

What Go MCP does not yet own is the product-facing `set_section_name` tool
that reuses those semantics through the scoped MCP invocation boundary.

## Status

This slice is now complete.

Current repo status as of 2026-03-07:

- `internal/mcpx` owns scoped read/write invocation, metadata-driven target
  extraction, and temp-id translation
- `internal/projectstate` already owns section-name validation and mutation
- `internal/app` already owns the rename-refactor service used by the IDE HTTP
  route
- Go MCP now exposes `set_section_name`
- `internal/app` now wires the existing rename-refactor service into IDE MCP
- invalid section-name validation failures now surface as structured MCP
  `invalid_arguments` errors
- the stale broader-name follow-on docs have been corrected
  - `set_callable_name` remains an internal rename-apply helper, not an
    existing product-facing MCP tool boundary

## Scope

This focused slice covers:

- a Go MCP `set_section_name` tool
- reuse of the existing Go rename-refactor owner instead of a second rename
  path in MCP
- scoped write enforcement and temp-id translation for section-targeted rename
  calls
- focused MCP, authenticated HTTP bridge, and IDE-mode app coverage for:
  - allowed scoped rename
  - blocked scoped rename
  - invalid-name tool errors
  - temporary-id rename calls

## Non-Goals

- `acceptRenameRefactor` / `declineRenameRefactor` MCP tools
- `set_code_obj_name`
- structural create/delete/move tools
- frontend rename-modal behavior changes
- a new product-facing `set_callable_name` tool

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-codeobj-write-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-4-section-name-validation-and-rename-refactor.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/mcp/system_prompt.md`
- `tests/agentic/test_agentic_scope_violation_tool_result.py`
- `tests/project_state/test_rename_refactor_broadcast.py`
- `tests/routers/test_name_validation_routes.py`
- `internal/projectstate/section_names.go`
- `internal/app/rename_refactors.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice should stay on `set_section_name` only.

The high-leverage missing behavior is not generic name mutation. It is MCP
parity for the existing section-rename product path. The important dependency
is the rename-refactor owner:

1. direct `projectstate.SetSectionName` is insufficient for product semantics
   because it skips rename-mode planning and websocket project-state updates
2. `internal/app.renameRefactorService` already owns the source-of-truth
   section-rename path for the IDE route
3. MCP should reuse that owner through a narrow interface instead of creating a
   second rename implementation

For MCP calls without `frontendOpId`, `ALWAYS_ASK` mode should continue to
rename the section without storing a pending prompt result. That matches the
current Python behavior, which only stores/broadcasts prompt results when a
`frontendOpId` exists.

## Working Decisions

- reuse the existing rename-refactor service
  - MCP should call the same Go owner that powers `setSectionName`
  - do not call `projectstate.SetSectionName` directly from MCP
- keep the tool metadata simple and explicit
  - `AccessTypeWrite`
  - `IDPathsByType[section] = ["sectionId"]`
- keep rename input raw at the transport edge
  - let `internal/projectstate` remain authoritative for trim/validation rules
- keep the slice bounded to the actual product-facing tool
  - do not broaden to `set_code_obj_name`
  - do not invent a user-facing `set_callable_name` tool

## Proposed Go Boundaries

### `internal/app`

Own:

- section-rename mutation semantics
- rename-mode planning and dependent-value application policy
- websocket broadcast side effects

Expose to MCP only through a narrow interface.

### `internal/mcpx`

Own:

- tool registration and schema
- scoped write enforcement
- temp-id translation
- tool-error shaping

Do not own:

- section-name validation rules
- rename-refactor planning
- websocket prompt policy

## Implementation Steps

1. Add a narrow section-rename service dependency to the MCP server.
   - keep the dependency interface local to `internal/mcpx`
   - wire the app-owned rename-refactor service into IDE MCP setup

2. Register `set_section_name`.
   - discoverable write tool
   - section-target metadata via `IDPathsByType`
   - raw `name` argument passed through to the rename owner

3. Normalize rename errors.
   - map invalid section names to structured MCP `invalid_arguments`
   - keep missing-project/section handling consistent with existing MCP writes

4. Expand focused tests.
   - MCP server allowed/blocked rename tests
   - invalid-name tool error test
   - temp-id translation test
   - authenticated HTTP bridge and IDE app tests for the new tool count and
     persisted rename effect

## Acceptance

- Go MCP exposes `set_section_name`
- scoped writes enforce section-target access for rename calls
- temp-id translation rewrites `sectionId` for rename calls
- MCP rename calls reuse the existing rename-refactor owner instead of a second
  rename path
- invalid section names return structured MCP tool errors

## Completed

- updated `internal/mcpx/server.go`
  - added a narrow section-name mutation dependency for MCP
  - registered `set_section_name` as a discoverable write tool with
    `IDPathsByType[section] = ["sectionId"]`
  - normalized invalid section-name failures into MCP `invalid_arguments`
    results
- updated `internal/app/app.go`
  - IDE MCP setup now passes the existing rename-refactor service into the MCP
    server
  - `set_section_name` therefore reuses the same Go owner as the IDE HTTP
    route
- expanded focused coverage in:
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`
  - existing `internal/projectstate/section_names_test.go` remains the
    validation authority used by this MCP slice

## Decisions

- keep section-rename semantics owned by the existing rename-refactor service
  - MCP does not call `projectstate.SetSectionName` directly in the app wiring
  - no second rename-planning path was added
- keep invalid-name validation authoritative in `internal/projectstate`
  - MCP passes the raw `name` argument through
  - trim and validation semantics stay in the existing project-state owner
- keep `set_callable_name` non-user-facing
  - it remains an internal helper for rename-refactor changed-value application
  - no new product-facing MCP tool was added for it
- keep Python parity for missing `frontendOpId`
  - MCP rename calls without `frontendOpId` do not create pending
    rename-refactor prompts in `ALWAYS_ASK` mode
  - this matches the current Python rename flow

## Open Questions

- none at this slice boundary

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute|TestRegisterLSPRoutesMutesCodeSectionDiagnostics' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestProjectSetSectionName' -count=1 -timeout 180s`

## Recommended Follow-On

- Slice 9 is complete.
- Structural follow-on slices through `create_new_section_variant` are now
  complete.
- `set_code_obj_name` is now complete over the Go-owned rename-validation
  boundary.
- `set_param_name_and_value` is now complete over the Go-owned combined
  rename/value boundary.
- `set_callable` is now complete over the Go-owned callable/signature-help
  boundary.
- The next recommended step is a focused `add_kwarg` slice so new param
  creation lands on the completed callable selection and combined rename/value
  boundaries.
- Keep broader structural move/reparent semantics deferred until a dedicated
  structural plan narrows them into a bounded owner.
