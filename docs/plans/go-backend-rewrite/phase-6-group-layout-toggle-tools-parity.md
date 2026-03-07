# Phase 6 Group Layout Toggle Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_section_sizes` work.

The highest-leverage remaining group-layout mutation gaps are now:

- `toggle_group_orientation`
- `set_group_overflow_mode`

These two tools share the same group-section runtime surface and should move as
one bounded cluster instead of reopening the group subsystem twice.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- `set_section_sizes` is now complete across the runtime, MCP server, HTTP
  tool bridge, and authenticated SSE transport
- Go still does not own explicit runtime mutations for:
  - toggling group orientation
  - setting group overflow mode
- frontend code already treats overflow-mode size materialization as a separate
  concern by pairing `route_set_group_overflow_mode` with an explicit
  `route_set_section_sizes` call when needed

## Scope

This focused slice should cover:

- a Go runtime owner for `toggle_group_orientation`
- a Go runtime owner for `set_group_overflow_mode`
- group-type validation for both mutations
- Go MCP parity for both tools
- focused tests for:
  - group-only validation
  - boolean payload persistence
  - structural scope enforcement
  - temp-id translation

## Non-Goals

- inferring concrete group sizes from frontend DOM state
- piggybacking implicit `set_section_sizes` behavior onto overflow-mode writes
- generic section-variant parity
- app-definition MCP work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `frontend/src/components/Section/Header/ChangeOrientationButton.tsx`
- `frontend/src/components/Section/Header/MenuButton/ToggleGroupOverflowMode.tsx`
- `internal/mcpx/server.go`
- `internal/projectstate/layout_presentation.go`

## Current Python Behavior

Python keeps both mutations narrow:

1. `toggle_group_orientation`
   - requires a Group section
   - toggles `isHorizontalOrientation`
2. `set_group_overflow_mode`
   - requires a Group section
   - sets `overflowMode` to the requested boolean

The current frontend flow makes one important boundary explicit:

- enabling overflow mode may also trigger a separate `set_section_sizes` call
  first when the current size still contains `"auto"`

## Working Decisions

- keep these mutations boolean-only
  - do not infer or synthesize group size changes inside the Go runtime owner
- reuse existing payload-write patterns from layout-presentation mutations
- keep MCP transport thin
  - parse args, validate scope, delegate
- keep the slice clustered
  - orientation and overflow live on the same section type and should land
    together

## Implementation Outline

1. Add the runtime owners.
   - toggle group orientation
   - set group overflow mode
   - reject non-Group targets

2. Add MCP parity.
   - structural access
   - project-scoped invocation
   - temp-id translation

3. Add focused tests.
   - runtime validation and payload persistence
   - MCP server, HTTP bridge, and authenticated SSE coverage

## Open Questions

- none right now

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'Test(Runtime|Document).*(ToggleGroupOrientation|SetGroupOverflowMode)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|ToggleGroupOrientation|SetGroupOverflowMode)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsToggleGroupOrientation|SupportsSetGroupOverflowMode)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsToggleGroupOrientation|ServerSupportsSetGroupOverflowMode|ToolCallRouteSupportsToggleGroupOrientation|ToolCallRouteSupportsSetGroupOverflowMode)' -count=1 -timeout 420s`

## Next Recommended Step

- implement the group-only runtime owners in `internal/projectstate` first
- keep overflow-mode writes strictly separate from size writes

## Progress Notes

- 2026-03-07: doc created immediately after the completed
  `set_section_sizes` slice reranked the remaining Phase 6 mutation gaps.
