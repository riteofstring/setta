# Phase 6 Set Top Level Section Layout Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_code` MCP work.

The next highest-leverage remaining MCP mutation gap with an existing Go owner
is `set_top_level_section_layout`.

Go already owns the runtime mutation and IDE HTTP route for top-level layout
persistence. The remaining gap is MCP parity over that completed owner.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity is still the active phase
- this slice is complete
- Go already owns top-level layout persistence in:
  - `internal/projectstate/view_modes.go`
  - `internal/httpapi/project_routes.go`
- MCP already had the required map-key id extraction primitives for
  `topLevelSections`
- this slice added the missing map-key id rewrite path for temporary-id
  translation
- Go MCP now exposes `set_top_level_section_layout` as a scoped write tool over
  the existing layout runtime owner

## Scope

This focused slice covers:

- a Go MCP `set_top_level_section_layout` write tool
- reuse of the existing Go `SetTopLevelSectionLayout(...)` runtime owner
- scoped section targeting through `topLevelSections` map keys
- temporary-id translation for `topLevelSections` keys
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - allowed scoped layout persistence
  - out-of-scope rejection when blocked section ids appear in the layout map
  - temporary-id translation for section-keyed layouts

## Non-Goals

- `auto_layout_top_level_sections`
- view-mode lifecycle MCP tools
- layout packing or placement heuristics
- section creation, deletion, move, or reparent transport
- batching multiple view/layout mutations into one MCP tool

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `docs/plans/go-backend-rewrite/phase-4-project-view-mode-and-top-level-layout-mutation-transport.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `tests/project_state/test_project_config_view_modes.py`
- `internal/projectstate/view_modes.go`
- `internal/projectstate/view_modes_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`
- `internal/mcpx/translation.go`
- `internal/mcpx/id_paths_test.go`

## Current Python Behavior

Python `BaseProjectManager.set_top_level_section_layout(...)`:

1. resolves the active view mode
2. filters the authoritative top-level section set from current project state
3. drops deleted or reparented ids from the stored layout
4. accepts valid top-level sections that are currently missing from the stored
   layout
5. persists the merged layout to both the project-level and active-view-mode
   snapshots

The Go rewrite already owns that behavior through
`internal/projectstate.Project.SetTopLevelSectionLayout(...)`.

## Working Decisions

- keep MCP transport thin
  - the tool should validate arguments, enforce scope, and delegate to the
    existing Go runtime owner
- classify this tool as `write`, not `structural`
  - Python tagged it as structural, but in the Go rewrite this mutation edits
    existing top-level layout state rather than changing project shape
  - that keeps the access model aligned with the existing scoped write
    boundary instead of widening structural permissions
- keep top-level section filtering runtime-authored
  - do not trust frontend or MCP callers to decide which section ids are still
    valid top-level members
- keep the output simple
  - return `{ status: "ok" }`
- use `idPathsByType.section = ["topLevelSections"]`
  - the MCP boundary extracts ids from dict keys for scope checks
  - this slice also adds dict-key rewrite support so temporary ids translate at
    invocation time
- keep this slice separate from `auto_layout_top_level_sections`
  - layout persistence is state transport; auto-layout widens into policy and
    packing behavior

## Implementation Outline

1. Register the `set_top_level_section_layout` MCP tool.
   - `accessType: write`
   - `idPathsByType.section = ["topLevelSections"]`
   - input: `projectConfigId`, `topLevelSections`
   - output: `status`

2. Add the MCP handler.
   - read `projectConfigId`
   - read `topLevelSections` as a section-id keyed map of layout payloads
   - delegate to `projectState.SetTopLevelSectionLayout(...)`

3. Reuse existing mutation error mapping.
   - preserve current project-not-found and section-not-found handling
   - avoid adding route-local or MCP-local layout filtering

4. Add focused tests.
   - MCP server metadata and tool-count coverage
   - scoped allow/deny behavior using `topLevelSections` map keys
   - temporary-id translation for keyed layout maps
   - authenticated `__setta__/tools/call` coverage
   - IDE app SSE coverage

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRouteSupportsSetTopLevelSectionLayout|TestMCPToolCallRouteSetTopLevelSectionLayoutAcceptsTemporaryIDs' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsSetTopLevelSectionLayoutOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsForSetTopLevelSectionLayoutOverAuthenticatedSSE|TestAppIDEMCPToolCallRouteSupportsSetTopLevelSectionLayout' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- use `auto_layout_top_level_sections` as the next bounded MCP layout slice
- keep that slice separate from this completed layout-persistence work
  - `set_top_level_section_layout` now owns direct layout persistence over
    scoped section targets
  - `auto_layout_top_level_sections` widens into settings-backed packing
    policy and should be planned explicitly rather than folded into this slice

## Progress Notes

- 2026-03-07: doc created after `set_code` MCP parity completed and the
  remaining-gap inventory moved the next bounded slice to
  `set_top_level_section_layout`.
- 2026-03-07: `set_top_level_section_layout` MCP parity completed over the
  existing Go top-level layout owner.
- 2026-03-07: Go classified the tool as `write` instead of `structural`
  because this slice mutates existing layout state rather than project shape.
- 2026-03-07: generic MCP id-path translation gained dict-key rewrite support
  so `topLevelSections` temporary ids now translate at both the scope and
  invocation boundary.
