# Phase 6 Toggle Position Locks Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_show_param_display_names` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `toggle_position_locks`.

Go already owns the runtime mutation and IDE HTTP route for this section-targeted
layout-presentation toggle. The remaining gap is MCP parity over that existing
owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- `set_show_param_display_names` MCP parity is complete
- `toggle_position_locks` MCP parity is now complete
- Go already owns `toggle_position_locks` in:
  - `internal/projectstate/layout_presentation.go`
  - `internal/httpapi/project_routes.go`
- Python tags `toggle_position_locks` as a structural project-state tool with
  explicit `sectionIds` argument targeting metadata
- structural-scope, unknown-section, temporary-id, authenticated HTTP bridge,
  and IDE SSE coverage landed in the completed slice

## Scope

This focused slice covers:

- a Go MCP `toggle_position_locks` structural tool
- reuse of the existing Go `TogglePositionLocks(...)` runtime owner
- `sectionIds` argument targeting metadata for scoped denial reporting and
  temporary-id translation
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - structural-scope rejection for scoped chats
  - unscoped structural success
  - not-found handling for unknown sections
  - temporary-id translation for `projectConfigId` and `sectionIds`

## Non-Goals

- `toggle_minimized`
- `set_section_tag_color`
- `set_section_style_color`
- any broader layout-presentation MCP bundle
- compare-and-set behavior
- changing the runtime’s validate-before-apply semantics

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `internal/projectstate/layout_presentation.go`
- `internal/projectstate/layout_presentation_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/agentic_context.go`

## Current Python Behavior

Python `BaseProjectManager.toggle_position_locks(...)`:

1. resolves the single-config project state
2. validates every requested section id before applying any mutation
3. flips `positionAndSizeLocked` for each requested section
4. tags the tool as `access_type="structural"`
5. exposes `sectionIds` as section-targeting metadata for agentic tooling

The Go runtime already mirrors the same validate-before-apply semantics through
`internal/projectstate.Runtime.TogglePositionLocks(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce scope, and delegate to the
    existing Go runtime owner
- keep this tool `structural`
  - Python already treats it as structural
  - the existing MCP scope model uses `allowUnscoped` as the honest gate for
    structural mutations
- keep `sectionIds` in MCP metadata
  - even though structural calls still require unscoped access, the section-id
    paths matter for blocked-target reporting and temporary-id translation
- keep runtime-owned validation
  - unknown sections should continue to fail through the runtime owner rather
    than through an MCP-local precheck
- keep the output simple
  - return `{ status: "ok" }`

## Implementation Outline

1. Register the `toggle_position_locks` MCP tool.
   - `accessType: structural`
   - `idPathsByType.section = ["sectionIds"]`
   - input: `projectConfigId`, `sectionIds`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read required `sectionIds`
   - validate unscoped structural access
   - delegate to `projectState.TogglePositionLocks(...)`

3. Add focused tests.
   - MCP server metadata and tool-count coverage
   - structural deny behavior
   - unscoped success
   - unknown-section error mapping
   - temporary-id translation for project and section ids
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsTogglePositionLocks|TestMCPToolCallRouteTogglePositionLocksAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsTogglePositionLocksOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForTogglePositionLocksOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsTogglePositionLocks' -count=1 -timeout 420s`

## Open Questions

- none at slice start
- none after implementation

## Next Recommended Step

- move to `toggle_minimized` as the next bounded Phase 6
  layout-presentation MCP slice
- keep `set_section_tag_color` as the nearby follow-on after that

## Progress Notes

- 2026-03-07: doc created after the remaining-gap inventory moved the next
  bounded slice to `toggle_position_locks`.
- 2026-03-07: MCP now exposes `toggle_position_locks` as an unscoped
  structural tool over the existing Go layout-presentation runtime owner.
- 2026-03-07: the slice preserved Python-style `sectionIds` target metadata so
  structural denials and temporary-id translation stay source-of-truth driven
  at the MCP invocation edge.
- 2026-03-07: runtime-owned validate-before-apply behavior stayed intact;
  unknown sections still fail through the existing Go owner rather than through
  MCP-local prechecks.
