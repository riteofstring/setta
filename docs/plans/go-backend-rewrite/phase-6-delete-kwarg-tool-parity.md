# Phase 6 Delete Kwarg Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`delete_selected_params` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- Go-owned callable selection plus param refetch through `set_callable`
- Go-owned param creation through `add_kwarg`
- Go-owned param impl switching through `change_param_impl`
- Go-owned impl config mutation through `update_param_impl_config`
- Go-owned selected-param deletion through `delete_selected_params`

The remaining gap in this param-structure cluster is the single-button
`delete_kwarg` convenience path that removes the last arg from the targeted
callable or dict section.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `delete_kwarg` through `internal/projectstate` and MCP
- last-param deletion now reuses the stronger selected-param cleanup boundary
  instead of Python's narrower helper semantics

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for `delete_kwarg`
- callable-section deletion of the last child under the active callable
- dict-section deletion of the last child under the top-level `NestedParam`
  root
- cleanup through the same Go-owned pathways used by
  `delete_selected_params` for:
  - `pinnedParams`
  - `selectedParams`
  - `ignoreTypeErrors.params`
  - `edgeInputParams`
  - incoming edge removal and target-value clearing
  - section `codeObjVariantMap` cleanup
  - unreachable code-object pruning
- a Go MCP `delete_kwarg` write tool
- result temp-id translation for the deleted `codeObjId`
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - callable last-param deletion
  - dict/shared-root last-param deletion
  - no-param / unset-callable failures
  - edge-input cleanup
  - scoped allow/deny behavior
  - temp-id translation

## Non-Goals

- multi-select param deletion beyond the completed `delete_selected_params`
  owner
- param move or reparent flows
- legacy `/deleteKwarg` HTTP route migration outside the MCP boundary
- preserving Python's narrower cleanup behavior if it would leave stale
  section-local state behind

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-delete-selected-params-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_delete_kwarg_edges.py`
- `tests/types/test_helpers_lvl2.py`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `internal/projectstate/add_kwarg.go`
- `internal/projectstate/delete_selected_params.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice should not copy Python's minimal helper literally.

Current Python `delete_kwarg` removes the last child and only updates
`edgeInputParams`, but the Go rewrite already has a stronger source-of-truth
cleanup boundary in `delete_selected_params`. Reusing that cleanup behavior is
the higher-quality design because it prevents stale ids from surviving in:

1. `pinnedParams`
2. `selectedParams`
3. `ignoreTypeErrors.params`
4. section-local `codeObjVariantMap`

The highest-leverage move is therefore:

- add one bounded Go owner that resolves the last deletable child
- funnel the resulting deletion through the same Go-owned cleanup semantics
  already proven by `delete_selected_params`
- expose the owner through MCP with explicit deleted-id output

## Working Decisions

- keep `delete_kwarg` authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not splice child arrays in transport code
- support only the two real parent shapes
  - callable sections delete from the active callable
  - dict sections delete from the current top-level param root
- return the deleted id explicitly
  - MCP returns `{ codeObjId }`
  - follow-on agent reasoning should not rediscover which arg was removed
- reuse Go-owned cleanup semantics from the completed selected-param boundary
  - clean section-local state, edge inputs, edge targets, variant maps, and
    prune unreachable code objects
- fail loudly for invalid deletion contexts
  - callable section with no active callable
  - callable/dict root with no child params to remove
  - unsupported section/root shapes

## Implementation Outline

1. Add the bounded project-state owner.
   - resolve the active callable or dict root
   - remove the last child from that root
   - reuse existing deletion cleanup helpers
   - return the deleted `codeObjId`

2. Wire the MCP write tool.
   - register `delete_kwarg`
   - use `sectionId` metadata targeting for scope and temp-id translation
   - translate the deleted result id

3. Add focused tests.
   - project-state tests for callable/dict delete flows and failure cases
   - MCP server tests for metadata, allowed/blocked writes, and temp-id
     translation
   - authenticated HTTP/app tests for delete-after-add and temp-id flows

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient|TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- the callable/dict param-structure cluster now covers create, single-delete,
  multi-delete, impl switching, and impl config writes on the Go-owned MCP
  boundary
- the next bounded follow-on should be inventory work for the remaining
  Python-owned MCP mutation gaps rather than inventing move/reparent behavior
  without a concrete product driver

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: project-state owner landed with callable/dict last-child deletion,
  selected-param cleanup reuse, section-local variant-map pruning, and
  unreachable code-object pruning.
- 2026-03-07: MCP parity landed with `delete_kwarg` registration, deleted-id
  temp-id translation, scoped allow/deny coverage, and authenticated
  HTTP/IDE-mode app verification.
