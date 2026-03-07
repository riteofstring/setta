# Phase 6 CodeObj Name Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`create_new_section_variant` structural tool work.

Go already owns:

- scoped MCP invocation with metadata-driven `codeObj` targeting
- invocation-edge temporary/canonical id translation
- authoritative section-name validation and rename/refactor semantics for
  section renames
- code-object display-name mutation through `internal/projectstate`

This slice closed the `set_code_obj_name` MCP workflow gap that the Python MCP
system prompt still uses for param naming flows.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `set_code_obj_name` through `internal/projectstate` and MCP
- the IDE HTTP `setCodeObjName` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for renaming a code object by id
- source-of-truth discovery of the active sections that currently reference the
  target code object
- authoritative validation semantics for:
  - param-bearing sections with sibling duplicate checks
  - `MetaControl` sections with format-only validation
- a Go MCP `set_code_obj_name` write tool
- focused scope, temp-id, HTTP-tool-route, and IDE-mode app coverage for:
  - allowed scoped rename
  - blocked scoped rename
  - invalid-name tool errors
  - temporary-id rename calls

## Non-Goals

- `set_param_name_and_value`
- section rename-refactor prompts or websocket rename-modal behavior
- IDE HTTP route migration for `setCodeObjName`
- structural create/delete/move semantics
- heuristic code-object lookup based on display names or section names

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-codeobj-write-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-4-section-name-validation-and-rename-refactor.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/utils/name_validation.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/mcp/system_prompt.md`
- `tests/routers/test_name_validation_routes.py`
- `tests/routers/test_share_policy_routes.py`
- `tests/utils/test_name_validation.py`
- `internal/projectstate/section_names.go`
- `internal/projectstate/section_code_objects.go`
- `internal/projectstate/code_object_writes.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice can stay bounded to code-object rename semantics.

The key dependency is validation ownership:

1. Python does not require a caller-supplied `sectionId`; it derives all active
   sections that reference the target code object
2. validation depends on the active section type:
   - param-bearing sections use hierarchy-aware sibling duplicate checks
   - `MetaControl` uses format-only validation
3. MCP already has robust `codeObj` scoping and temp-id translation, so the
   missing work is the project-state owner plus the tool registration

The highest-leverage move is therefore:

- add one bounded project-state rename owner keyed by `codeObjId`
- derive all validation contexts from active project state instead of caller
  heuristics
- keep transport surface bounded to MCP

## Working Decisions

- keep rename validation authoritative in `internal/projectstate`
  - MCP should call a Go runtime owner directly
  - do not reimplement validation in `internal/mcpx`
- derive validation contexts from active section state
  - scan active section payloads for `codeObjVariantMap` ownership
  - do not require a caller-provided `sectionId`
- keep section-type rules explicit
  - param-bearing sections use full param-name validation
  - `MetaControl` uses format-only validation
  - any other referencing section type should hard-fail
- keep the tool metadata simple and explicit
  - `AccessTypeWrite`
  - `IDPathsByType[codeObj] = ["codeObjId"]`
- keep rename input raw at the transport edge
  - let `internal/projectstate` remain authoritative for trim and validation

## Implementation Outline

1. Add the bounded project-state owner.
   - introduce a Go invalid-param-name error type
   - derive active section ids for a `codeObjId`
   - validate the proposed name across every active referencing section
   - persist the normalized code-object name through document/runtime save
     boundaries

2. Wire the MCP write tool.
   - register `set_code_obj_name`
   - use `codeObjId` metadata targeting for scope and temp-id translation
   - normalize invalid-name failures into MCP `invalid_arguments`

3. Add focused tests.
   - project-state rename tests for:
     - dict/callable-style validation
     - `MetaControl` validation
     - shared code-object rename across multiple sections
   - MCP server tests for metadata, allowed/blocked writes, and invalid names
   - HTTP/app integration tests for mutation effect and tool-count updates

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `set_param_name_and_value` has now landed as the next completed combined
  code-object write slice
- `set_callable` has now landed as the callable selection/refetch follow-on
- the next recommended step is a focused `add_kwarg` slice so new param
  creation lands on the completed callable selection and combined rename/value
  boundaries
- keep `change_param_impl` and unrelated callable orchestration deferred until
  a dedicated slice narrows them into one owner
- keep structural move/reparent semantics deferred until a dedicated
  structural plan narrows them into a bounded owner

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with Go-owned active-section discovery for
  `codeObjId`, authoritative dict/callable/meta-control name validation,
  MCP registration, temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: kept the IDE HTTP `setCodeObjName` route deferred; the bounded
  owner lives in `internal/projectstate` instead of a transport-specific
  rename service.
- 2026-03-07: follow-on `set_param_name_and_value` slice completed; next
  recommended step moved to `set_callable`.
- 2026-03-07: follow-on `set_callable` slice completed; next recommended step
  moved to `add_kwarg`.
