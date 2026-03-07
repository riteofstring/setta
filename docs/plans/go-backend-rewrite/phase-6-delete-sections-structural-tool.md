# Phase 6 Delete Sections Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`create_child_sections_via_incrementer` structural tool work.

Go now owns:

- authenticated MCP transport and scoped structural access
- bounded top-level/direct child/incrementer child construction
- result id translation for structural tool outputs

The next missing structural boundary was `delete_sections`, which is the
highest-leverage follow-on because `delete_child_sections_via_decrementer`
depends on it and the real product semantics sit in recursive cleanup, not in
decrementer caller resolution.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `delete_sections`
- Go now owns recursive section deletion cleanup for:
  - descendant collection
  - top-level/view-state cleanup
  - attached-terminal cleanup
  - edge/agentic-edge cleanup
  - code-object pruning
- the IDE HTTP `deleteSections` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for deleting one or more sections
- recursive descendant collection from section child references
- explicit cleanup of surviving section references through:
  - `children`
  - `attachedTerminalSectionId`
- edge cleanup plus surviving target-value clearing when the last inbound edge
  to an active target port disappears
- unused code-object pruning after section removal
- a Go MCP `delete_sections` structural tool
- argument/result temp-id translation for:
  - input `sectionIds`
  - returned `sectionIds`
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- `delete_child_sections_via_decrementer`
- move/reparent/group/delete-variant semantics
- IDE HTTP route migration for `deleteSections`
- broad cleanup of arbitrary payload fields by heuristic JSON scanning
- legacy route-shape compatibility

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-create-child-sections-via-incrementer-structural-tool.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/project_state/test_delete_sections_prunes_code_objs.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/types/test_helpers_lvl2.py`
- `internal/projectstate/codegen_targets.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice needed a real Go deletion owner before any decrementer work.

Current inspection showed four concrete missing dependencies:

1. Go had no source-of-truth owner for recursive section deletion.
2. Go had no cleanup path for surviving parent child references and attached
   terminals.
3. Go had no ownership of section-delete code-object pruning.
4. Go MCP did not yet expose `delete_sections` metadata or temp-id
   translation.

The high-leverage move was therefore:

- add one bounded project-state deletion owner first
- expose that owner through MCP
- defer decrementer caller resolution until the cleanup boundary is proven

## Working Decisions

- keep this slice MCP-first
  - do not migrate the IDE HTTP `deleteSections` route in the same slice
- return explicit deleted ids from MCP
  - Go returns `{sectionIds: [...]}` so follow-on tool reasoning does not have
    to infer which descendants were removed
- keep descendant collection source-of-truth based
  - traverse standard child carriers:
    - section `children`
    - `attachedTerminalSectionId`
    - explicit `ParentSectionID`
  - do not guess extra section references from arbitrary payload strings
- keep edge cleanup explicit
  - remove edges/agentic edges that reference deleted sections
  - clear the surviving target value only when the deleted edge was the last
    edge targeting that active `(section, variant, port)` tuple
- prune code objects after section deletion
  - compute reachability from remaining section `codeObjVariantMap` payloads
  - walk nested code-object `children` from there

## Implementation Outline

1. Add the bounded project-state deletion owner.
   - Introduce `DeleteSectionsInput` / `DeleteSectionsResult`.
   - Collect recursive descendants from standard child references.
   - Remove surviving child/attached-terminal references.
   - Remove deleted sections plus variants/impls.
   - Prune now-unreachable code objects.

2. Wire the MCP structural tool.
   - Register `delete_sections`.
   - Add input schema for `projectConfigId` and `sectionIds`.
   - Reuse output schema `{sectionIds: string[]}`.
   - Add argument/result id metadata for temp-id translation.

3. Add focused tests.
   - project-state: recursive cleanup, top-level/view cleanup, attached
     terminal cleanup, edge-target clearing, code-object pruning
   - MCP server: registration metadata, structural deny path, unscoped call,
     temp-id translation
   - HTTP/app: authenticated structural tool coverage

## Verification Plan

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Completed

- added `internal/projectstate/delete_sections.go` with a bounded deletion
  owner on `Document`, `Runtime`, and `Project`
- collected recursive descendants from standard child references instead of
  tool-name or payload-string heuristics
- cleaned surviving section references through:
  - `children`
  - `attachedTerminalSectionId`
- removed edges and agentic edges that referenced deleted sections
- cleared surviving target parameter values when the last inbound active edge
  was removed
- reused the existing project-state code-object pruning path after deletion
- registered the MCP `delete_sections` tool with:
  - `IDPathsByType.section = ["sectionIds"]`
  - `ResultIDPathsByType.section = ["sectionIds"]`
- added focused coverage in:
  - `internal/projectstate/delete_sections_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Decisions Made

- `delete_sections` returns deleted ids explicitly even though the Python
  manager method does not, because the Go MCP boundary should not force
  follow-on tools to rediscover what recursive deletion removed
- deletion cleanup stays on standardized section/code-object fields rather than
  brittle whole-payload guessing

## Open Questions

- none for this bounded slice

## Next Recommended Step

- `delete_child_sections_via_decrementer` has now landed as the next completed
  structural slice over this deletion owner
- the next bounded structural slice should move to
  `create_new_section_variant`
- keep move/reparent semantics deferred until a dedicated structural plan
  slices them into a bounded owner
- keep the IDE HTTP `deleteSections` route deferred unless a frontend-specific
  viewport/reveal workflow makes it necessary

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with Go-owned recursive deletion, MCP
  registration, temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: follow-on `delete_child_sections_via_decrementer` slice
  completed; next recommended step moved to `create_new_section_variant`.
