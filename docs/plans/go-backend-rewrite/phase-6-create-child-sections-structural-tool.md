# Phase 6 Create Child Sections Structural Tool

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`create_top_level_section` structural tool work.

Go now owns:

- authenticated MCP transport and thin tool routing
- scoped/unscoped structural access checks
- result id translation for structural tool outputs
- bounded top-level section construction ownership

The next missing structural boundary is `create_child_sections`, which is the
highest-leverage follow-on because it extends the same section-construction
owner into parent/child graph mutation without opening delete/move semantics.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go MCP now exposes `create_child_sections`
- Go now has a bounded project-state owner for child section construction and
  ordered parent insertion in `internal/projectstate/child_section_creation.go`
- `create_child_sections` result ids are temp-id translated through metadata
- the IDE HTTP `createChildSections` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for creating one or more child
  sections under an existing parent
- bounded parent-child insertion semantics over the active section variant
- code-section-specific invariants for attached terminal creation
- a Go MCP `create_child_sections` structural tool over that owner
- argument/result temp-id translation for:
  - `parentId`
  - returned `sectionIds`
- focused tests through:
  - `internal/projectstate`
  - `internal/mcpx`
  - `internal/httpapi` MCP tool bridge
  - `internal/app` authenticated SSE MCP path

## Non-Goals

- `create_child_sections_via_incrementer`
- delete/move/group structural tools
- IDE HTTP route migration for `createChildSections`
- full section-default parity across every section type
- `ListRoot` or other child-only types unless they fall out cleanly from the
  bounded creation owner without introducing guessed defaults
- viewport/reveal heuristics

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-create-top-level-section-structural-tool.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/section-sizing-and-ux.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/routers/project_manager.py`
- `tests/project_state/test_move_sections.py`
- `tests/project_state/test_code_section_attached_terminal.py`
- `tests/utils/test_name_validation.py`
- `internal/projectstate/top_level_section_creation.go`
- `internal/projectstate/run_graph.go`
- `internal/projectstate/python_code_section_bindings.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice cannot land as MCP registration alone.

Current inspection shows three real missing dependencies:

1. Go has no source-of-truth owner for child section construction plus ordered
   insertion into a parent section.
2. Go has no bounded owner for code-section attached-terminal creation via this
   structural path.
3. Go MCP does not yet expose `create_child_sections` metadata or result-id
   translation.

The high-leverage move is therefore:

- add the bounded project-state child-creation owner first
- extend the existing MCP structural boundary to that owner
- keep transport surface bounded to MCP

## Working Decisions

- keep this slice MCP-first
  - do not migrate the IDE HTTP `createChildSections` route in the same slice
- keep creation bounded to section types Go can create honestly right now
  - landed support is: `Chat`, `Code`, `Dict`, `Group`, `Terminal`,
    and `TextBlock`
  - `MetaControl`, `ListRoot`, and other child-only/extra-default shapes stay
    deferred
  - return explicit `invalid_arguments` errors for unsupported child impl types
- keep structural scope behavior unchanged
  - `create_child_sections` is structural
  - scoped chats without `allowUnscoped` still fail closed
- return explicit created ids from MCP
  - unlike the Python manager method, the Go MCP tool should return
    `{sectionIds: [...]}` so follow-on tool calls can use the new sections
    without discovery-by-heuristic
  - use metadata `ResultIDPathsByType` instead of tool-name branches
- keep parent targeting explicit
  - use `Metadata.IDPathsByType.section = ["parentId"]`
  - structural scope denials should report that target normally
- keep code-section child semantics explicit
  - code parents only allow one `Terminal` child
  - attached-terminal bookkeeping stays source-of-truth owned in project-state
  - child terminal height must be concrete, not `"auto"`
  - terminal child height resolves from settings
    `terminalSectionDefault.size.height` when available, with the documented
    default height used only when no settings project is present
- keep insertion deterministic
  - `startIdx=nil` appends
  - out-of-range indexes should fail explicitly instead of relying on implicit
    slice semantics

## Implementation Outline

1. Add a bounded project-state child-creation owner.
   - Introduce `CreateChildSectionsInput` / `CreateChildSectionsResult`.
   - Resolve the parent through the active variant.
   - Build new section/variant/impl state using the existing section-creation
     helpers wherever possible.
   - Insert created ids into the parent `children` payload at `startIdx`.
   - Set each child core `ParentSectionID`.

2. Add code-parent invariants.
   - Reject non-`Terminal` child types for code parents.
   - Reject `numChildren != 1` for code parents.
   - Reject creating a second attached terminal for a code parent.
   - Keep code `children` and `attachedTerminalSectionId` in sync.
   - Normalize embedded terminal width to the parent width and make terminal
     height concrete.

3. Wire the MCP structural tool.
   - Register `create_child_sections`.
   - Add input schema for `projectConfigId`, `parentId`, `implType`,
     `numChildren`, and optional `startIdx`.
   - Add output schema `{sectionIds: string[]}`.
   - Add argument/result id metadata for temp-id translation.

4. Add focused tests.
   - project-state: insertion order, parent linkage, code-parent terminal
     invariants, and invalid argument cases
   - MCP server: tool metadata, structural deny path, unscoped allow path,
     result temp-id translation
   - HTTP/app: authenticated route/SSE coverage for the structural tool

## Verification Plan

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Completed Work

- added `CreateChildSectionsInput` / `CreateChildSectionsResult` and the
  bounded project-state owner on `Document`, `Runtime`, and `Project`
- reused the existing section-construction helper for supported child impl
  types and set explicit child `ParentSectionID`
- landed ordered child insertion on the parent impl payload with explicit
  `startIdx` validation
- landed code-parent terminal rules:
  - reject non-terminal child types
  - reject `numChildren != 1`
  - reject creating a second attached child
  - sync parent `children` plus `attachedTerminalSectionId`
  - promote code height to the embedded-terminal minimum and seed terminal
    height concretely
- registered the MCP `create_child_sections` tool with:
  - `IDPathsByType.section = ["parentId"]`
  - `ResultIDPathsByType.section = ["sectionIds"]`
- added focused coverage in:
  - `internal/projectstate/child_section_creation_test.go`
  - `internal/mcpx/server_test.go`
  - `internal/httpapi/mcp_tool_routes_test.go`
  - `internal/app/mcp_test.go`

## Next Recommended Step

- `create_child_sections_via_incrementer` has now landed as the next completed
  structural follow-on
- `delete_sections` has now landed as the recursive cleanup follow-on
- `delete_child_sections_via_decrementer` has now landed as the decrementer
  deletion follow-on
- the next bounded structural slice should move to
  `create_new_section_variant`
- keep move/reparent semantics deferred until a dedicated structural plan
  slices them into a bounded owner
