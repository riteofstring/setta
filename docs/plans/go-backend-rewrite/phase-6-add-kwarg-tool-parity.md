# Phase 6 Add Kwarg Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`set_callable` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` targeting
- Go-owned callable selection plus param refetch through `internal/projectstate`
- Go-owned combined param rename/value mutation through
  `set_param_name_and_value`
- invocation-edge temporary/canonical id translation for MCP arguments and
  structured result ids

This slice moves param creation onto the Go MCP boundary so agents can create a
new callable/dict param and immediately hand off to the completed rename/value
owner without Python-side orchestration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `add_kwarg` through `internal/projectstate` and MCP
- MCP returns the created `codeObjId` so follow-on rename/value calls can stay
  on the completed Go-owned write boundary

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for `add_kwarg`
- callable-section param creation under the currently selected callable
- dict-section param creation with:
  - lazy top-level `NestedParam` root initialization when missing
  - shared top-level param reuse across sections that reference the same root
- a Go MCP `add_kwarg` write tool
- result temp-id translation for the created `codeObjId`
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - callable param creation
  - dict/shared-root param creation
  - scoped allow/deny behavior
  - temp-id result translation and follow-on writes

## Non-Goals

- `change_param_impl`
- `delete_kwarg`
- `delete_selected_params`
- structural move/reparent semantics
- IDE HTTP route migration for legacy `addKwarg`
- preserving Python's blank code-object-name behavior

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-param-name-and-value-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-set-callable-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_helpers_lvl2.py`
- `backend/setta/mcp/system_prompt.md`
- `internal/projectstate/callable.go`
- `internal/projectstate/code_object_name_and_value.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice can stay bounded because the downstream mutation boundaries already
exist in Go.

The key dependency chain is:

1. Go already owns callable selection and combined param rename/value writes
2. the remaining gap is creating a new param entry that those completed owners
   can target
3. Python's helper path shows that creation semantics belong in project-state,
   not in transport-local payload surgery

The highest-leverage move is therefore:

- add one explicit Go project-state owner for param creation
- return the created `codeObjId` through MCP
- keep result-id translation metadata-driven so follow-on temp-id writes stay
  on the existing invocation-edge path

## Working Decisions

- keep param creation authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not construct `codeObjVariantMap` or child arrays in transport code
- support the two real creation parents only
  - callable sections create under the active callable
  - dict sections create under the top-level `NestedParam` root
  - fail loudly for unsupported section/parent types
- return the created id
  - MCP returns `{ codeObjId }`
  - do not force agents to re-scan the whole project summary before a rename
- use deterministic placeholder names in Go
  - Go project-state normalization rejects blank code-object names
  - create stable placeholder names (`param`, `param_2`, ...)
  - keep `set_param_name_and_value` authoritative for the real follow-on name

## Implementation Outline

1. Add the bounded project-state owner.
   - create callable params under the active callable
   - create dict params under a shared/lazily-created `NestedParam` root
   - return the created `codeObjId`

2. Wire the MCP write tool.
   - register `add_kwarg`
   - use `sectionId` metadata targeting for scope and temp-id translation
   - return the created `codeObjId` through structured MCP output

3. Add focused tests.
   - project-state tests for callable append, dict root init/shared reuse, and
     missing-callable failure
   - MCP server tests for metadata, allowed/blocked writes, and temp-id result
     translation
   - authenticated HTTP/app tests for add-then-rename flows over callable
     sections and temp-id follow-on writes

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient|TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `change_param_impl`, `update_param_impl_config`, and
  `delete_selected_params` are now complete on the Go-owned MCP boundary
- the next bounded follow-on in this param-editing cluster is `delete_kwarg`
- keep delete/move/reparent follow-ons deferred until their own bounded slices

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with a Go-owned `add_kwarg` owner, callable and
  dict/shared-root param creation, deterministic placeholder names compatible
  with Go project-state normalization, MCP registration, result temp-id
  translation, and authenticated route/SSE coverage.
