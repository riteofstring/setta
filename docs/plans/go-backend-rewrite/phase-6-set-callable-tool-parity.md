# Phase 6 Set Callable Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_param_name_and_value` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- Go-owned callable binding, signature-help parsing, and param synthesis from
  Phase 5
- IDE HTTP `setCallable` transport over `internal/projectstate`
- invocation-edge temporary/canonical id translation for MCP arguments and
  simple result ids

This slice moves the canonical callable selection workflow onto the Go MCP
boundary without reintroducing Python-side orchestration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `set_callable` through `internal/projectstate` and MCP
- MCP now reuses the shared callable-signature resolver boundary already used
  by the IDE HTTP route
- nested child `codeObjId` temp-id translation now works for structured MCP
  results

## Scope

This focused slice covers:

- a Go MCP `set_callable` write tool
- threading the existing callable-signature resolver dependency into the MCP
  server/app wiring
- returning the real `SetCallableResponse` payload through MCP:
  - `callableId`
  - `childCodeObjs`
  - `lspStatus`
- temporary-id translation for `sectionId`, `callableId`, and returned child
  `codeObjId` values
- focused MCP server, authenticated HTTP bridge, and IDE-mode app coverage for:
  - allowed scoped callable selection
  - blocked scoped callable selection
  - temporary-id callable selection
  - resolver-backed child param synthesis in the returned payload

## Non-Goals

- new callable-binding semantics in `internal/projectstate`
- heuristic callable lookup outside the existing signature-help resolver path
- `add_kwarg`
- `change_param_impl`
- IDE HTTP route migration for additional callable-adjacent routes
- broader callable layout/presentation behavior

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-5-signature-help-callable-refetch-and-param-synthesis.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/mcp/system_prompt.md`
- `tests/routers/test_share_policy_routes.py`
- `internal/projectstate/callable.go`
- `internal/projectstate/callable_test.go`
- `internal/httpapi/project_routes.go`
- `internal/httpapi/project_routes_test.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice is larger than the recent bounded write tools, but the hard runtime
dependency is already complete in Go.

The key dependency chain is:

1. `internal/projectstate` already owns `SetCallable(...)`
2. the IDE HTTP route already passes the callable-signature resolver through to
   that owner
3. MCP currently lacks that resolver dependency and transport surface

The highest-leverage move is therefore:

- reuse the existing Go callable owner instead of creating a second mutation
  path
- thread the same callable-signature resolver into MCP server construction
- keep transport logic thin and return the real runtime response

## Working Decisions

- keep callable semantics authoritative in `internal/projectstate`
  - MCP should call `SetCallable(...)` directly
  - do not duplicate callable binding or param synthesis in `internal/mcpx`
- reuse the existing resolver boundary
  - pass `projectstate.CallableSignatureResolver` into the MCP server options
  - do not add heuristic fallback behavior when the resolver is unavailable
- return structured runtime data
  - MCP should return the full `SetCallableResponse`
  - do not flatten this tool to `status: ok`
- extend temp-id translation only as required by this payload
  - support returned child code-object ids in array payloads
  - do not broaden translation rules beyond explicit metadata paths

## Implementation Outline

1. Add the slice doc and MCP dependency wiring.
   - add a focused Phase 6 slice doc
   - thread `CallableSignatureResolver` through `mcpx.ServerOptions` and app
     construction

2. Wire the MCP write tool.
   - register `set_callable`
   - use `sectionId` metadata targeting for scope and temp-id translation
   - return `projectstate.SetCallableResponse`
   - normalize callable-section errors into MCP `invalid_arguments`

3. Fill the missing result-id translation dependency.
   - support nested array object id rewriting so returned child `codeObjId`
     values translate to temp ids

4. Add focused tests.
   - MCP server tests for metadata, allowed/blocked writes, and temp-id result
     translation
   - authenticated HTTP tool-route tests for callable mutation effect
   - IDE-mode app tests for SSE and temporary-id callable selection

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `add_kwarg` is now complete over the Go-owned param-creation boundary
- implement a focused `change_param_impl` slice so newly created params can
  switch control/value types on the completed creation plus rename/value
  boundaries
- keep param-impl switching authoritative in `internal/projectstate` instead
  of transport-local payload surgery
- keep broader callable presentation/layout follow-ons deferred until their own
  bounded slices

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with MCP `set_callable` registration, shared
  callable-signature resolver wiring through app/server construction, nested
  child `codeObjId` temp-id translation, and authenticated route/SSE coverage.
- 2026-03-07: follow-on `add_kwarg` slice completed; next recommended step
  moved to `change_param_impl`.
