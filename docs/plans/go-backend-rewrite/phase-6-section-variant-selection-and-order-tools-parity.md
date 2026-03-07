# Phase 6 Section Variant Selection And Order Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed Group
layout toggle work.

The highest-leverage remaining section-variant mutation gaps are now:

- `set_section_variant`
- `set_default_section_variant`
- `set_section_variant_sort_order`

These three tools share the same section/variant ownership boundary and should
land together instead of splitting active-variant selection, default-variant
selection, and variant ordering across separate slices.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- the Group layout toggle slice is complete across the runtime, MCP server,
  HTTP tool bridge, and authenticated SSE transport
- Go already owns `create_new_section_variant`, so the next missing bounded
  section-variant work is selection and ordering rather than creation
- app-definition work remains intentionally deferred

## Scope

This focused slice should cover:

- a Go runtime owner for `set_section_variant`
- a Go runtime owner for `set_default_section_variant`
- a Go runtime owner for `set_section_variant_sort_order`
- section/variant membership validation for all three mutations
- Go MCP parity for all three tools
- focused tests for:
  - active/default variant persistence
  - sort-order validation
  - scoped write enforcement
  - temp-id translation for section and variant ids

## Non-Goals

- `set_section_param_filter`
- `set_section_variant_name`
- app-definition MCP work
- broad section-variant editor parity outside the three tools above

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/project_state/test_watch_code.py`
- `tests/routers/test_project_manager_sort_order_routes.py`
- `frontend/src/components/Panes/UiEditor/SectionVariants/VariantList.tsx`
- `internal/projectstate/section_variant_creation.go`
- `internal/projectstate/project_graph.go`
- `internal/mcpx/server.go`

## Current Python Behavior

Python keeps these mutations narrow:

1. `set_section_variant`
   - sets `projectConfig.sectionVariantMap[sectionId] = variantId`
2. `set_default_section_variant`
   - sets `sections[sectionId].defaultVariant = variantId`
3. `set_section_variant_sort_order`
   - requires the section to exist
   - requires `orderedVariantIds` to contain every section variant exactly once
   - rejects duplicates
   - rejects ids that are not members of the section

## Working Decisions

- keep these mutations explicit and data-model driven
  - no frontend-derived heuristics
  - no shadow state outside the project graph
- validate section/variant membership through the existing Go project graph
  helpers instead of trusting raw ids
- keep transport thin
  - parse args, validate scope, delegate
- keep the slice bounded to selection/order only
  - do not pull param-filter or variant-name work into this step

## Implementation Outline

1. Add the runtime owners.
   - set active variant
   - set default variant
   - persist variant ordering with complete-list validation

2. Add MCP parity.
   - scoped write access on `sectionId`
   - variant-id translation on direct and array arguments
   - project-scoped invocation

3. Add focused tests.
   - runtime selection/default/order behavior
   - MCP server, HTTP bridge, and authenticated SSE coverage

## Open Questions

- none right now

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetSectionVariant|SupportsSetDefaultSectionVariant|SupportsSetSectionVariantSortOrder)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupports(SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)|ToolCallRouteSupports(SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)|ServerSupportsTemporaryIDsFor(SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder))' -count=1 -timeout 420s`

## Next Recommended Step

- implement the runtime owners in `internal/projectstate` first
- reuse the existing `create_new_section_variant` fixture surface in tests
  instead of introducing a new variant-creation pathway

## Progress Notes

- 2026-03-07: doc created after the completed Group layout toggle slice
  reranked the remaining Phase 6 mutation gaps.
