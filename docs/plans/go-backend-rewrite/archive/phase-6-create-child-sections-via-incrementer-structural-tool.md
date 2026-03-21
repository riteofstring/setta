# Phase 6 Create Child Sections Via Incrementer Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`create_child_sections` structural tool work.

Go now owns:

- authenticated MCP transport and scoped structural access
- bounded top-level and direct child section construction
- result id translation for structural tool outputs

The next missing structural follow-on is
`create_child_sections_via_incrementer`, which is smaller than delete/move
semantics because it only adds caller-to-parent/index resolution above the
already-landed child-construction owner.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `create_child_sections_via_incrementer`
- Go reuses the landed `create_child_sections` owner for actual construction
- the IDE HTTP `createChildSectionsViaIncrementer` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for incrementer-style child creation
- explicit `calledBy -> (parentId, startIdx)` resolution
- a Go MCP `create_child_sections_via_incrementer` structural tool
- argument/result temp-id translation for:
  - `calledBy`
  - returned `sectionIds`
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- IDE HTTP route migration for `createChildSectionsViaIncrementer`
- delete/move/decrementer semantics
- hidden/default-child-type heuristics beyond the explicit Python reference rule
- broad section-type support beyond what `create_child_sections` already owns
- `set_code_obj_name`

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-create-child-sections-structural-tool.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `tests/types/test_helpers_lvl2.py`
- `internal/projectstate/child_section_creation.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice does not need a new construction boundary.

Current inspection shows the missing work is:

1. Resolve `calledBy` to either:
   - `(parentId=calledBy, startIdx=0)` when the caller is itself a parent
     section, or
   - `(parentId=caller.parent, startIdx=index(calledBy)+1)` when the caller is
     an existing child section
2. Reuse the landed `create_child_sections` owner once that target is known
3. Expose the new MCP tool metadata and temp-id translation paths

The high-leverage move is therefore:

- add a small project-state resolution layer
- keep the actual section construction delegated to the existing owner
- keep transport surface bounded to MCP

## Working Decisions

- keep this slice MCP-first
  - do not migrate the IDE HTTP route in the same slice
- keep the Python helper semantics exactly where they are already explicit
  - parent caller inserts at `startIdx=0`
  - leaf caller inserts immediately after the caller inside its parent
- keep child type explicit
  - `implType` remains required
  - do not infer default child type from `defaultChildSectionType`
- return explicit created ids from MCP
  - keep `{sectionIds: [...]}` for the same reasons as `create_child_sections`
- keep target metadata explicit
  - use `Metadata.IDPathsByType.section = ["calledBy"]`
- fail explicitly on bad caller state
  - `calledBy` must resolve to either a parent section or a child with a
    parent that contains it in `children`
  - do not silently guess a fallback parent/index

## Implementation Outline

1. Add the bounded project-state incrementer owner.
   - Introduce `CreateChildSectionsViaIncrementerInput`.
   - Resolve caller section and active payload.
   - Compute `parentId` / `startIdx` explicitly.
   - Delegate to `CreateChildSections`.

2. Wire the MCP structural tool.
   - Register `create_child_sections_via_incrementer`.
   - Add input schema for `projectConfigId`, `calledBy`, `implType`,
     `numChildren`.
   - Reuse output schema `{sectionIds: string[]}`.
   - Add argument/result id metadata for temp-id translation.

3. Add focused tests.
   - project-state: parent-caller prepend, child-caller insert-after, invalid
     caller state
   - MCP server: tool metadata, unscoped structural call, result-id translation
   - HTTP/app: authenticated structural tool coverage

## Verification Plan

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Completed

- added `internal/projectstate/child_section_incrementer_creation.go` with a
  bounded incrementer owner on `Document`, `Runtime`, and `Project`
- kept caller resolution explicit instead of heuristic:
  - parent caller resolves to `(parentId=calledBy, startIdx=0)`
  - non-parent caller resolves to `(parentId=caller.parent, startIdx=index+1)`
- failed explicitly on unsupported caller state instead of guessing a fallback
  parent or insertion point
- reused the existing `CreateChildSections(...)` owner for all child
  construction, terminal sizing, and code-parent rules
- registered the MCP `create_child_sections_via_incrementer` tool with:
  - `IDPathsByType.section = ["calledBy"]`
  - `ResultIDPathsByType.section = ["sectionIds"]`
- normalized incrementer caller errors to structured MCP `invalid_arguments`
  failures
- added focused coverage in:
  - `internal/projectstate/child_section_incrementer_creation_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'Test(MCPToolCallRoute|RegisterLSPRoutesMutesCodeSectionDiagnostics)' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Next Recommended Step

- `delete_sections` has now landed as the next completed structural slice
- `delete_child_sections_via_decrementer` has now landed as the decrementer
  deletion follow-on
- `create_new_section_variant` has now landed as the section-variant follow-on
- `set_code_obj_name` has now landed as the next completed rename/refactor
  slice
- `set_param_name_and_value` has now landed as the next completed combined
  code-object write slice
- `set_callable` has now landed as the callable selection/refetch follow-on
- the next bounded Phase 6 slice should move to `add_kwarg`
- keep `add_kwarg` scoped to one coherent param-creation boundary
- keep move/reparent semantics deferred until a dedicated structural plan
  slices them into a bounded owner

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with Go-owned incrementer caller resolution,
  MCP registration, temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: follow-on `delete_sections` slice completed; next recommended
  step moved to `delete_child_sections_via_decrementer`.
- 2026-03-07: follow-on `delete_child_sections_via_decrementer` slice
  completed; next recommended step moved to `create_new_section_variant`.
- 2026-03-07: follow-on `create_new_section_variant` slice completed; next
  recommended step moved to `set_code_obj_name`.
- 2026-03-07: follow-on `set_code_obj_name` slice completed; next recommended
  step moved to `set_param_name_and_value`.
- 2026-03-07: follow-on `set_param_name_and_value` slice completed; next
  recommended step moved to `set_callable`.
- 2026-03-07: follow-on `set_callable` slice completed; next recommended step
  moved to `add_kwarg`.
