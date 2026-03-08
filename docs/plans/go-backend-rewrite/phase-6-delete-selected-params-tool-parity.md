# Phase 6 Delete Selected Params Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
`update_param_impl_config` MCP parity work.

Go already owns:

- scoped MCP invocation with metadata-driven `section` and `codeObj` targeting
- Go-owned callable selection plus param refetch through `set_callable`
- Go-owned param creation through `add_kwarg`
- Go-owned param impl switching through `change_param_impl`
- Go-owned impl config mutation through `update_param_impl_config`

The remaining gap in this param-structure cluster is deleting one or more
selected editable params without falling back to Python-side orchestration.

## Status

Current repo status as of 2026-03-07:

- this slice is complete
- Go now owns `delete_selected_params` through `internal/projectstate` and MCP
- selected-param deletion now removes hierarchy references, section-local
  state, active edge-input targets, and unreachable code objects
- MCP now translates `paramInfoIds` arrays at both the invocation and result
  edges without a tool-specific shim

## Scope

This focused slice covers:

- a Go-owned project-state mutation owner for `delete_selected_params`
- callable and dict section support only
- parent-child hierarchy removal using the active section's current
  `codeObjVariantMap`
- explicit skip behavior for non-editable params
- section-local cleanup for deleted param ids:
  - `pinnedParams`
  - `selectedParams`
  - `ignoreTypeErrors.params`
  - `edgeInputParams`
- edge cleanup when removed params were active edge-input ports:
  - remove matching incoming edges for the active section variant
  - clear the target value only when the removed edge was the last remaining
    incoming edge for that target port
- section `codeObjVariantMap` cleanup so deleted params stop being active roots
- unreachable code-object pruning after the mutation
- a Go MCP `delete_selected_params` write tool
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage for:
  - callable param deletion
  - dict/shared-root param deletion
  - section-local cleanup
  - code-object pruning
  - scoped allow/deny behavior
  - temp-id translation for `paramInfoIds`

## Non-Goals

- generic code-object subtree deletion outside callable/dict param sections
- param reordering or reparenting
- legacy `/deleteSelectedParams` route migration outside the MCP boundary
- preserving Python's habit of leaving deleted params resident in project-level
  maps after they become unreachable

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-update-param-impl-config-tool-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/types/helpers_lvl2.py`
- `tests/types/test_helpers_lvl2.py`
- `tests/types/test_delete_kwarg_edges.py`
- `tests/types/test_edges.py`
- `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- `internal/projectstate/add_kwarg.go`
- `internal/projectstate/delete_sections.go`
- `internal/projectstate/watch_code_callable_sections.go`
- `internal/projectstate/code_object_names.go`
- `internal/mcpx/server.go`

## Dependency Finding

This slice should not stop at removing child ids from a parent payload.

In the Go rewrite, reachable code objects are derived from section-local
`codeObjVariantMap` roots plus hierarchy traversal. That means a robust Go-owned
delete path must also:

1. remove deleted param ids from the relevant section `codeObjVariantMap`
2. prune unreachable code objects after the mutation
3. clean up active edge-input ports using the same edge-target clearing rule
   already used for section deletion

Without those steps, deleted params would remain directly resolvable through the
section even after disappearing from the visible hierarchy.

## Working Decisions

- keep param deletion authoritative in `internal/projectstate`
  - MCP should call one Go runtime owner directly
  - do not replicate hierarchy or cleanup rules in transport
- keep scope bounded to callable and dict sections
  - reject unsupported section types explicitly
- treat `paramInfoIds` as a deduped ordered request list
  - empty input should be a no-op success
- skip non-editable params
  - this matches current product behavior for protected params
- remove section-local `codeObjVariantMap` entries for deleted params
  - callable deletion updates the targeted section only
  - dict deletion updates every dict section sharing the same top-level param
- prune unreachable code objects after the mutation
  - do not preserve dangling code objects as legacy baggage
- keep transport thin
  - MCP validates arguments, enforces scope, and returns structured results
  - project-state owns deletion semantics

## Implementation Outline

1. Add the bounded project-state owner.
   - resolve the active section root for callable or dict sections
   - build the current parent map from the active hierarchy
   - remove requested editable params from parent `children`
   - scrub section-local param state and edge-input ports
   - remove deleted ids from relevant section `codeObjVariantMap` entries
   - prune unreachable code objects

2. Wire edge cleanup into the mutation.
   - remove incoming edges targeting deleted edge-input ports for the active
     section variant
   - reuse the existing target-value clearing rule

3. Wire the MCP write tool.
   - register `delete_selected_params`
   - use `sectionId` plus `paramInfoIds` metadata targeting for scope and
     temp-id translation

4. Add focused tests.
   - project-state tests for callable/dict deletion, cleanup, and pruning
   - MCP server tests for metadata, allowed/blocked writes, and temp-id
     translation
   - authenticated HTTP/app tests for scoped invocation and deletion flows

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCPServerSupportsAuthenticatedSSECalls|TestAppIDEMCPServerSupportsScopedWriteMutationOverAuthenticatedSSE|TestAppIDEMCPServerSupportsTemporaryIDsOverAuthenticatedSSE|TestAppIDEMCPRuntimeStatusRouteReportsConnectedSelfClient|TestAppIDEMCPToolCallRouteSupportsScopedWriteMutation' -count=1 -timeout 420s`

## Open Questions

- none after implementation

## Next Recommended Step

- `delete_kwarg` has now landed to close the single-param convenience gap in
  this cluster
- the next bounded follow-on should be inventory work for the remaining
  Python-owned MCP mutation gaps, not speculative move/reparent behavior

## Progress Notes

- 2026-03-07: doc created to scope the slice before implementation.
- 2026-03-07: slice completed with a Go-owned `delete_selected_params`
  mutation owner, section-local cleanup, edge-input edge removal,
  `codeObjVariantMap` cleanup plus pruning, MCP registration, and
  authenticated HTTP/app coverage.
