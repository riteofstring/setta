# Phase 6 Create New Section Variant Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`delete_child_sections_via_decrementer` structural tool work.

Go now owns:

- authenticated MCP transport and scoped structural access
- bounded top-level/direct child/incrementer child construction
- bounded recursive/decrementer section deletion
- bounded single-section variant duplication

The next explicit structural follow-on is `create_new_section_variant`, which
stays bounded because it duplicates variant state for one section without
pulling in move/reparent geometry or broad route migration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `create_new_section_variant`
- the IDE HTTP `createNewSectionVariant` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for duplicating the active variant of
  one section
- explicit cloning of section variant state, including:
  - new section variant id
  - cloned non-preset section impl when required
  - copied edge input/output port state for param-bearing sections
  - duplicated code-object variants referenced by the active section variant
- bounded edge copying for edges that target the duplicated variant and still
  point at active edge ports/params
- a Go MCP `create_new_section_variant` structural tool
- argument/result temp-id translation for:
  - `sectionId`
  - returned `variantId`
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- IDE HTTP route migration for `createNewSectionVariant`
- deleting or reordering variants
- move/reparent/group structural semantics
- heuristic copying of arbitrary edge-like payload fields outside the canonical
  edge and section/code-object variant maps
- broad variant-management parity beyond creating one new variant from the
  active variant

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-delete-child-sections-via-decrementer-structural-tool.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/project_state/test_watch_code.py`
- `tests/types/test_edge_ports_variants.py`
- `tests/routers/test_project_manager_sort_order_routes.py`
- `internal/projectstate/project_graph.go`
- `internal/projectstate/callable.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice does not need new transport or deletion boundaries.

This slice landed by:

1. cloning the active section variant into a new section variant slot
2. duplicating code-object variants referenced by the duplicated section
   variant when the section carries a `codeObjVariantMap`
3. copying matching edges for the duplicated section variant using canonical
   edge port/input metadata
4. exposing the new MCP tool metadata and temp-id translation paths

The high-leverage move is therefore:

- add one bounded project-state variant-duplication owner
- keep the actual semantics on standardized section/code-object/edge fields
- keep transport surface bounded to MCP

## Working Decisions

- keep this slice MCP-first
  - do not migrate the IDE HTTP route in the same slice
- keep variant duplication source-of-truth based
  - derive the source variant from the active `SectionVariantMap`
  - do not add a caller-specified source variant selector in this slice
- clone only standardized variant-owned state
  - section impl identity when non-preset
  - code-object variants from `codeObjVariantMap`
  - edge input params and edge output ports
  - matching edges in `Project.Edges`
- return explicit ids from MCP
  - return only the created section variant id
  - keep duplicated code-object variant ids internal to the mutation boundary
    for this slice so result metadata stays bounded
- keep failure explicit
  - missing section/variant/impl/code-object state should hard-fail through the
    normal project-state errors
  - do not silently skip broken graph state

## Implementation Outline

1. Add the bounded project-state variant-duplication owner.
   - Introduce `CreateNewSectionVariantInput` / result.
   - Resolve the active section variant explicitly.
   - Clone the base impl when non-preset.
   - Duplicate code-object variants for `codeObjVariantMap`.
   - Copy eligible edges for the new variant.

2. Wire the MCP structural tool.
   - Register `create_new_section_variant`.
   - Add input schema for `projectConfigId` and `sectionId`.
   - Add result schema with `variantId`.
   - Add argument/result id metadata for temp-id translation.

3. Add focused tests.
   - project-state: variant append/activation, edge-port isolation, edge
     copying, preset/non-preset impl behavior
   - MCP server: tool metadata, structural deny path, unscoped allow path,
     result temp-id translation
   - HTTP/app: authenticated route/SSE coverage

## Verification Plan

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Open Questions

- none for this bounded slice

## Next Recommended Step

- `set_code_obj_name` has now landed as the next completed rename/refactor
  slice
- `set_param_name_and_value` has now landed as the next completed combined
  code-object write slice
- `set_callable` has now landed as the callable selection/refetch follow-on
- the next bounded Phase 6 slice should move to `add_kwarg`
- it is the highest-leverage remaining prompt-visible param-creation workflow
  gap over the completed callable and combined rename/value boundaries
- keep move/reparent semantics deferred until a dedicated structural plan
  narrows them into a bounded owner

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with Go-owned section-variant duplication,
  code-object variant cloning, bounded edge copying, MCP registration,
  `sectionVariant` temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: kept the MCP result bounded to `variantId`; duplicated
  code-object variant ids remain internal mutation state for this slice.
- 2026-03-07: follow-on `set_code_obj_name` slice completed; next recommended
  step moved to `set_param_name_and_value`.
- 2026-03-07: follow-on `set_param_name_and_value` slice completed; next
  recommended step moved to `set_callable`.
- 2026-03-07: follow-on `set_callable` slice completed; next recommended step
  moved to `add_kwarg`.
