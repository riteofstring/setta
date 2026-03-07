# Phase 6 Param Name And Value Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_code_obj_name` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- section-scoped parameter value mutation through `internal/projectstate`
- authoritative code-object rename validation through `internal/projectstate`
- invocation-edge temporary/canonical id translation for MCP arguments

This slice closed the `set_param_name_and_value` MCP workflow gap that the
Python MCP system prompt still uses for combined param rename/value edits.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `set_param_name_and_value` through `internal/projectstate` and
  MCP
- the IDE HTTP `setParamNameAndValue` route remains deferred

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for updating a parameter name and
  value together for one `sectionId` + `codeObjId`
- section-scoped param-name validation over the supplied section context
- atomic persistence so rename/value updates do not partially apply
- a Go MCP `set_param_name_and_value` write tool
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - allowed scoped combined edit
  - blocked scoped combined edit
  - invalid-name tool errors
  - temporary-id combined edit calls

## Non-Goals

- `add_kwarg`
- `set_callable`
- MetaControl combined rename/value behavior
- IDE HTTP route migration for `setParamNameAndValue`
- structural create/delete/move semantics

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-codeobj-write-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-codeobj-name-tool-parity.md`
- `docs/reference/name-validation.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/utils/name_validation.py`
- `backend/setta/mcp/system_prompt.md`
- `internal/projectstate/code_object_names.go`
- `internal/projectstate/section_code_objects.go`
- `internal/projectstate/code_object_writes.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice can stay bounded to one combined code-object write owner.

The key dependency is mutation ordering:

1. Python validates the proposed name against the supplied `sectionId`, not by
   scanning every active reference to the code object
2. the same call then persists the updated code-object name and the section
   value in one project-state update
3. Go already owns both underlying behaviors separately, so the remaining work
   is composing them behind one explicit owner and MCP tool

The highest-leverage move is therefore:

- add one bounded project-state owner for `sectionId` + `codeObjId`
- validate rename and value-write support before mutating anything
- keep the transport surface bounded to MCP

## Working Decisions

- keep validation and mutation authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not split rename/value ordering across transport handlers
- keep rename validation section-scoped
  - use the caller-supplied `sectionId`
  - do not broaden this tool to the active-reference scan used by
    `set_code_obj_name`
- keep the combined mutation atomic
  - validate both rename and value-write support before persisting either
  - do not allow partial rename-on-error or value-on-error outcomes
- keep transport inputs raw
  - let `internal/projectstate` remain authoritative for trim and validation

## Implementation Outline

1. Add the bounded project-state owner.
   - validate the proposed name in the supplied section context
   - validate that the target code object supports direct value mutation
   - persist the normalized name plus value in one save boundary

2. Wire the MCP write tool.
   - register `set_param_name_and_value`
   - use `sectionId` and `codeObjId` metadata targeting for scope and temp-id
     translation
   - normalize invalid-name failures into MCP `invalid_arguments`

3. Add focused tests.
   - project-state tests for:
     - combined rename/value persistence
     - no partial mutation on validation failure
   - MCP server tests for metadata, allowed/blocked writes, invalid names, and
     temp-id translation
   - HTTP/app integration tests for combined mutation effect and tool-count
     updates

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- implement a focused `set_callable` slice so the canonical callable selection
  and param-refetch workflow moves onto the completed Go MCP/runtime boundary
- keep it layered on the completed Phase 5 signature-help/callable refresh
  groundwork instead of broadening this slice into callable orchestration
- keep `add_kwarg`, `change_param_impl`, and broader structural semantics
  deferred until they can each move as bounded follow-ons

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with a Go-owned combined param rename/value
  owner, atomic validation-before-mutation ordering, MCP registration,
  temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: kept the IDE HTTP `setParamNameAndValue` route deferred; the
  combined write boundary lives in `internal/projectstate`.
