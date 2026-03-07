# Phase 6 Group Layout Toggle Tools Parity

## Purpose

This doc recorded the bounded Phase 6 slice that closed the remaining Group
layout toggle parity gap after `set_section_sizes`.

The slice covered:

- `toggle_group_orientation`
- `set_group_overflow_mode`

Both tools share the same Group-section runtime surface, so they landed as one
cluster instead of reopening the group subsystem twice.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- this Group-layout toggle slice is complete across the runtime, MCP server,
  MCP HTTP tool bridge, and authenticated SSE transport
- the remaining highest-leverage mutation gap moved on to the section-variant
  selection and ordering cluster

## Scope

This focused slice covered:

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

## Completed Work

1. Added the Group-only runtime owners in `internal/projectstate`.
   - `Runtime.ToggleGroupOrientation`
   - `Runtime.SetGroupOverflowMode`
   - shared validation rejects non-Group sections with
     `ErrGroupSectionRequired`

2. Added MCP transport parity in `internal/mcpx/server.go`.
   - `toggle_group_orientation`
   - `set_group_overflow_mode`
   - both tools use scoped structural access on `sectionId`
   - mutation errors map Group-type violations to `invalid_arguments`

3. Added bridge and end-to-end coverage.
   - MCP server tests
   - HTTP tool-call route tests
   - authenticated SSE app tests

## Open Questions

- none after implementation

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(ToggleGroupOrientation|SetGroupOverflowMode|GroupLayoutMutationsRejectNonGroupSections)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetGroupOverflowMode|ToggleGroupOrientation)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsToggleGroupOrientation|SetGroupOverflowModeAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupports(ToggleGroupOrientation|SetGroupOverflowMode)|ToolCallRouteSupports(ToggleGroupOrientation|SetGroupOverflowMode)|ServerSupportsTemporaryIDsFor(ToggleGroupOrientation|SetGroupOverflowMode))' -count=1 -timeout 420s`

## Next Recommended Step

- use `phase-6-section-variant-selection-and-order-tools-parity.md` as the
  next bounded Phase 6 slice
- keep section-variant selection/order work separate from param-filter and
  app-definition parity

## Progress Notes

- 2026-03-07: doc created immediately after the completed
  `set_section_sizes` slice reranked the remaining Phase 6 mutation gaps.
- 2026-03-07: runtime owners landed for `toggle_group_orientation` and
  `set_group_overflow_mode`, with Group-only validation at the
  project-state boundary.
- 2026-03-07: MCP, HTTP tool-route, and authenticated SSE parity landed for
  both Group-layout toggles.
- 2026-03-07: overflow-mode writes stayed explicitly separate from
  `set_section_sizes`; the frontend remains responsible for issuing both
  writes when a size materialization is needed.
