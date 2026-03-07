# Phase 6 Section Filter And MetaControl Title Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
section-variant selection and ordering work.

The highest-leverage remaining non-app-definition mutation gaps are now:

- `set_section_param_filter`
- `set_meta_control_show_section_title`

These two tools share the same narrow runtime shape:

- scoped section writes
- frontend-owned section payload fields
- active effective section-impl mutation

They should land together instead of being left behind as unrelated one-off
payload writes before the final app-definition slice.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- section-variant selection and ordering is complete across the runtime, MCP
  server, HTTP tool bridge, and authenticated SSE transport
- the remaining mutation gaps are now these two section-payload writes plus
  the deferred app-definition pair
- app-definition work remains intentionally deferred

## Scope

This focused slice should cover:

- a Go runtime owner for `set_section_param_filter`
- a Go runtime owner for `set_meta_control_show_section_title`
- the required section-type validation for both mutations
- Go MCP parity for both tools
- focused tests for:
  - exact payload persistence
  - section-type validation
  - scoped write enforcement
  - temp-id translation

## Non-Goals

- `set_section_variant_name`
- app-definition MCP work
- broader frontend section-type ownership beyond the two fields above

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_helpers_lvl2.py`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `frontend/src/components/Section/Container/MetaControlMenuButton.tsx`
- `internal/projectstate/layout_presentation.go`
- `internal/projectstate/project_graph.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python keeps both mutations narrow:

1. `set_section_param_filter`
   - writes the raw `paramFilter` string onto the current effective section
     impl
   - whitespace-only filters still persist as written
   - downstream reorder logic treats whitespace-only filters as inactive by
     trimming at read time, not by normalizing the stored value away

2. `set_meta_control_show_section_title`
   - requires a MetaControl section
   - writes `showSectionTitle` onto the current effective section impl

## Working Decisions

- keep both mutations as direct source-of-truth payload writes
  - no heuristic trimming or boolean inference in the transport layer
- preserve the stored param-filter string exactly as written
  - downstream consumers can trim when they need behavior decisions
- validate section type at the runtime owner boundary
  - `BaseSectionWithParams` for param filters
  - `MetaControl` for title visibility
- keep transport thin
  - parse args, validate scope, delegate
- keep the slice bounded
  - do not pull app-definition work into this step

## Implementation Outline

1. Add the runtime owners.
   - param-filter payload write
   - MetaControl title-visibility payload write
   - section-type validation for both

2. Add MCP parity.
   - scoped write access on `sectionId`
   - project-scoped invocation
   - temp-id translation

3. Add focused tests.
   - runtime payload persistence and validation
   - MCP server, HTTP bridge, and authenticated SSE coverage

## Open Questions

- none right now

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(SetSectionParamFilter|SetMetaControlShowSectionTitle)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetSectionParamFilter|SetMetaControlShowSectionTitle)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetSectionParamFilter|SupportsSetMetaControlShowSectionTitle)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetSectionParamFilter|ServerSupportsSetMetaControlShowSectionTitle|ToolCallRouteSupportsSetSectionParamFilter|ToolCallRouteSupportsSetMetaControlShowSectionTitle|SupportsAuthenticatedSSECalls)' -count=1 -timeout 420s`

## Next Recommended Step

- implement the runtime owners in `internal/projectstate` first
- keep these frontend-payload writes separate from the deferred app-definition
  slice

## Progress Notes

- 2026-03-07: doc created after the completed section-variant selection/order
  slice reranked the remaining Phase 6 mutation gaps.
