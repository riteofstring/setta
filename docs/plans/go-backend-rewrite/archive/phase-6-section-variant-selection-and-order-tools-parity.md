# Phase 6 Section Variant Selection And Order Tools Parity

## Purpose

This doc recorded the bounded Phase 6 slice that closed the remaining
section-variant selection and ordering parity gap after the completed Group
layout toggle work.

The slice covered:

- `set_section_variant`
- `set_default_section_variant`
- `set_section_variant_sort_order`

These three tools share the same section/variant ownership boundary, so they
landed together instead of splitting active-variant selection, default-variant
selection, and variant ordering across separate slices.

## Status

Current repo status as of 2026-03-07:

- Phase 6 MCP parity remains the active phase
- this section-variant selection/order slice is complete across the runtime,
  MCP server, HTTP tool bridge, and authenticated SSE transport
- app-definition work remains intentionally deferred
- the remaining highest-leverage non-app-definition gap moved on to the
  section filter and MetaControl title cluster

## Scope

This focused slice covered:

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

- `docs/plans/go-backend-rewrite/archive/phase-6-remaining-mcp-mutation-gap-inventory.md`
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

## Completed Work

1. Added the runtime owners in `internal/projectstate`.
   - `Runtime.SetSectionVariant`
   - `Runtime.SetDefaultSectionVariant`
   - `Runtime.SetSectionVariantSortOrder`
   - active/default selection now validates section/variant membership through
     the project graph instead of trusting raw ids

2. Added MCP transport parity in `internal/mcpx/server.go`.
   - `set_section_variant`
   - `set_default_section_variant`
   - `set_section_variant_sort_order`
   - all three tools use scoped write access on `sectionId`
   - direct and array variant ids translate through temporary ids

3. Added bridge and end-to-end coverage.
   - runtime tests
   - MCP server tests
   - HTTP tool-call route tests
   - authenticated SSE app tests

## Open Questions

- none after implementation

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SetSectionVariant|SetDefaultSectionVariant|SetSectionVariantSortOrder)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsSetSectionVariant|SetSectionVariantAcceptsTemporaryIDs|SupportsSetDefaultSectionVariant|SetSectionVariantSortOrderAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsSetSectionVariant|ServerSupportsTemporaryIDsForSetSectionVariant|ServerSupportsSetDefaultSectionVariant|ServerSupportsTemporaryIDsForSetDefaultSectionVariant|ServerSupportsSetSectionVariantSortOrder|ServerSupportsTemporaryIDsForSetSectionVariantSortOrder|ToolCallRouteSupportsSetSectionVariant|ToolCallRouteSupportsSetDefaultSectionVariant|ToolCallRouteSupportsSetSectionVariantSortOrder|SupportsAuthenticatedSSECalls)' -count=1 -timeout 420s`

## Next Recommended Step

- use `phase-6-section-filter-and-meta-control-title-tools-parity.md` as the
  next bounded Phase 6 slice
- keep the remaining non-app-definition writes separate from deferred
  app-definition transport work

## Progress Notes

- 2026-03-07: doc created after the completed Group layout toggle slice
  reranked the remaining Phase 6 mutation gaps.
- 2026-03-07: runtime owners landed for active/default section variant
  selection and full variant ordering validation.
- 2026-03-07: MCP, HTTP tool-route, and authenticated SSE parity landed for
  all three section-variant selection/order tools.
- 2026-03-07: temporary-id translation now covers both direct `variantId`
  arguments and `orderedVariantIds` arrays for section-variant writes.
