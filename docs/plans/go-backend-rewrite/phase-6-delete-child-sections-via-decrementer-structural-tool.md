# Phase 6 Delete Child Sections Via Decrementer Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`delete_sections` structural tool work.

Go now owns:

- authenticated MCP transport and scoped structural access
- bounded top-level/direct child/incrementer child construction
- bounded recursive section deletion and cleanup

The next missing structural follow-on is
`delete_child_sections_via_decrementer`, which is smaller than move/reparent
semantics because it only resolves `calledBy -> sectionIds` above the
completed deletion owner.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `delete_child_sections_via_decrementer`
- Go reuses the landed `delete_sections` owner for actual cleanup
- the IDE HTTP `deleteChildSectionsViaDecrementer` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for decrementer-style child deletion
- explicit `calledBy -> []sectionIds` resolution
- delegation to the landed `delete_sections` owner for actual cleanup
- a Go MCP `delete_child_sections_via_decrementer` structural tool
- argument/result temp-id translation for:
  - `calledBy`
  - returned `sectionIds`
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- IDE HTTP route migration for `deleteChildSectionsViaDecrementer`
- new recursive deletion cleanup semantics beyond `delete_sections`
- move/reparent/group/delete-variant semantics
- heuristic inference of hidden child carriers outside the explicit section
  payload fields already owned by `delete_sections`

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-delete-sections-structural-tool.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `tests/types/test_helpers_lvl2.py`
- `internal/projectstate/child_section_incrementer_creation.go`
- `internal/projectstate/delete_sections.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice does not need a new cleanup boundary.

Current inspection shows the missing work is:

1. Resolve `calledBy` to the concrete child ids that should be removed:
   - parent caller deletes the first `numChildren` entries of `children`
   - non-parent caller deletes the next `numChildren` siblings after the
     caller inside its parent `children`
2. Delegate the resulting ids to the landed `delete_sections` owner
3. Expose the new MCP tool metadata and temp-id translation paths

The high-leverage move is therefore:

- add one small caller-resolution owner
- keep all recursive cleanup delegated to `delete_sections`
- keep transport surface bounded to MCP

## Working Decisions

- keep this slice MCP-first
  - do not migrate the IDE HTTP route in the same slice
- keep the Python helper semantics exactly where they are already explicit
  - parent caller removes the first `numChildren` children
  - leaf caller removes the next `numChildren` siblings after the caller
- keep deletion behavior source-of-truth based
  - do not reimplement cleanup in the decrementer owner
  - always delegate concrete ids to `DeleteSections(...)`
- return explicit deleted ids from MCP
  - keep `{sectionIds: [...]}` so follow-on tool reasoning does not need to
    rediscover what was removed
- fail explicitly on bad caller state
  - `calledBy` must resolve to either a parent section or a child with a
    parent that contains it in `children`
  - do not silently guess a fallback parent or deletion range

## Implementation Outline

1. Add the bounded project-state decrementer owner.
   - Introduce `DeleteChildSectionsViaDecrementerInput`.
   - Resolve caller section and active payload.
   - Compute the child ids to delete explicitly.
   - Delegate to `DeleteSections`.

2. Wire the MCP structural tool.
   - Register `delete_child_sections_via_decrementer`.
   - Add input schema for `projectConfigId`, `calledBy`, and `numChildren`.
   - Reuse output schema `{sectionIds: string[]}`.
   - Add argument/result id metadata for temp-id translation.

3. Add focused tests.
   - project-state: parent-caller delete-first, child-caller delete-next,
     invalid caller state, delete-zero-available behavior
   - MCP server: tool metadata, unscoped structural call, result-id
     translation
   - HTTP/app: authenticated structural tool coverage

## Verification Plan

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Open Questions

- none for this bounded slice

## Completed

- added `internal/projectstate/child_section_decrementer_deletion.go` with a
  bounded decrementer owner on `Document`, `Runtime`, and `Project`
- kept caller resolution explicit instead of heuristic:
  - parent caller resolves to the first `numChildren` child ids
  - non-parent caller resolves to the next `numChildren` sibling ids after the
    caller inside its parent
- preserved the explicit empty-window no-op instead of forcing an invalid
  argument failure for `numChildren=0` or a caller with no remaining siblings
- delegated all actual cleanup to the landed `DeleteSections(...)` owner
  instead of duplicating recursive deletion logic
- registered the MCP `delete_child_sections_via_decrementer` tool with:
  - `IDPathsByType.section = ["calledBy"]`
  - `ResultIDPathsByType.section = ["sectionIds"]`
- added focused coverage in:
  - `internal/projectstate/child_section_decrementer_deletion_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Decisions Made

- preserve the Python helper's implicit empty-window no-op
  - `numChildren=0` and "no remaining siblings after the caller" now return
    `{sectionIds: []}` without mutating the project
- keep decrementer caller resolution aligned with the landed incrementer owner
  while still delegating all deletion cleanup to `DeleteSections(...)`

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Next Recommended Step

- `create_new_section_variant` has now landed as the section-variant follow-on
- `set_code_obj_name` has now landed as the next completed rename/refactor
  slice
- the next bounded Phase 6 slice should move to `set_param_name_and_value`
- it remains the highest-leverage remaining system-prompt param-editing gap
- keep `set_param_name_and_value` scoped to one coherent code-object write
  boundary
- keep move/reparent semantics deferred until a dedicated structural plan
  slices them into a bounded owner

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with Go-owned decrementer caller resolution,
  `delete_sections` reuse, MCP registration, temp-id translation, and
  authenticated route/SSE coverage.
- 2026-03-07: follow-on `create_new_section_variant` slice completed; next
  recommended step moved to `set_code_obj_name`.
- 2026-03-07: follow-on `set_code_obj_name` slice completed; next recommended
  step moved to `set_param_name_and_value`.
