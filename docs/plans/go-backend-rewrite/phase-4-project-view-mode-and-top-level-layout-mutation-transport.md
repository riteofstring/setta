# Phase 4 Project View-Mode And Top-Level Layout Mutation Transport

## Purpose

This doc narrows the next missing Go-owned IDE mutation slice after the
completed project layout/presentation transport work.

The next highest-leverage gap is the view-mode and top-level layout lifecycle
that the frontend already uses heavily:

- top-level section layout persistence
- view-mode creation and switching
- view-mode visibility/editing/user-facing/tab toggles
- view-mode ordering and deletion

Go already owns the read-side project transport for these fields. The missing
piece is the mutation owner and thin IDE route transport.

## Status

Current repo status as of 2026-03-07:

- the focused Watch Code docs are complete
- the focused `runCode` `paramOverrides` doc is complete
- the focused project layout/presentation transport doc is complete
- this focused doc is complete
- Go already owns the read-side project-state transport boundary used by IDE
  and deployment loads:
  - `internal/projectstate`
  - `internal/projectview`
  - `internal/httpapi/project_routes.go`
- Go already owns the smaller layout/presentation mutation cluster:
  - `setShowParamDisplayNames`
  - `togglePositionLocks`
  - `toggleMinimized`
  - `setActiveIds`
  - `setViewport`
  - `setSectionTagColor`
  - `setSectionStyleColor`
  - `setCallableHideParams`
  - `setSectionHideUnpinnedParams`
  - `setSectionPinnedParams`
- Go now owns the adjacent route cluster for:
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - `toggleIsEditingViewMode`
  - `toggleSectionVisibility`
  - `toggleViewModeUserFacing`
  - `toggleViewModeTab`
  - `setViewModeName`
  - `setViewModeSortOrder`
  - `deleteViewMode`

## Scope

This focused plan covers:

- Go-owned top-level layout persistence for the active view mode
- Go-owned view-mode lifecycle and ordering mutations
- thin IDE HTTP handlers for the route cluster above
- focused Go tests for runtime mutation behavior and HTTP error envelopes

## Non-Goals

- `autoLayoutTopLevelSections`
  - this pulls in layout algorithm ownership and deserves its own bounded slice
- `setSectionName`
  - still deferred to a focused name-validation and rename-side-effects doc
- structural section creation/deletion/move transport
- share/deployment policy transport for these routes in the same slice
- broad undo/redo transport

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-project-layout-and-presentation-mutation-transport.md`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_manager_types.py`
- `backend/setta/utils/name_validation.py`
- `backend/setta/code_gen/utils.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/routers/test_project_manager_sort_order_routes.py`
- `tests/routers/test_share_policy_routes.py`
- `frontend/src/components/Panes/Overview/ViewingEditingMode.tsx`
- `frontend/src/state/actions/sectionInfos.ts`
- `frontend/src/state/actions/viewModes.ts`
- `frontend/src/state/actions/sections/topLevelLayoutPersistence.test.ts`

## Dependency Finding

Current inspection shows two related but distinct behaviors:

- top-level layout persistence:
  - filters out deleted and reparented sections
  - accepts valid top-level sections that are temporarily missing from the
    layout map
  - synchronizes the active view mode and project-level top-level layout view
- view-mode lifecycle:
  - clones current layout and viewport into new view modes
  - swaps project-level layout and viewport when switching active view modes
  - persists visibility, sort order, editing mode, and deletion fallback rules

Those behaviors share the same data boundary in `projectstate.Project`, so they
belong in one focused doc. `autoLayoutTopLevelSections` does not; it introduces
algorithm ownership rather than state-transport ownership.

## Working Decisions

- keep the HTTP layer thin
  - handlers decode, validate ids, call `internal/projectstate`, and map
    explicit errors
- keep project snapshots as the source of truth
  - do not introduce route-local view-mode or layout mutation helpers
- implement top-level layout filtering from runtime state, not frontend hints
  - project sections and parent relationships are the source of truth
- include view-mode name validation in this slice
  - unlike section-name validation, this rule set is self-contained and only
    depends on project-local view-mode names plus slug normalization
- defer `autoLayoutTopLevelSections`
  - do not silently smuggle in layout-packing heuristics while migrating
    transport ownership

## Proposed Go Boundary

### `internal/projectstate`

Own:

- active view-mode resolution
- top-level layout filtering and persistence
- view-mode create/switch/toggle/sort/delete behavior
- view-mode name validation

Do not own:

- HTTP decoding
- share-policy enforcement
- layout packing algorithms

### `internal/httpapi`

Own:

- route registration and request decoding
- required-id validation
- mapping explicit project/view-mode errors to stable HTTP envelopes

Do not own:

- mutation semantics

## Implementation Slices

### Slice 1: Runtime Owner

Deliver:

- Go project/document/runtime mutations for:
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - `toggleIsEditingViewMode`
  - `toggleSectionVisibility`
  - `toggleViewModeUserFacing`
  - `toggleViewModeTab`
  - `setViewModeName`
  - `setViewModeSortOrder`
  - `deleteViewMode`
- focused runtime tests for:
  - layout filtering of deleted/reparented sections
  - create/switch view-mode layout + viewport cloning
  - sort-order validation
  - delete fallback order

Acceptance:

- the runtime owns this cluster without HTTP knowledge
- the frontend projector reflects the updated state without shims
- no auto-layout logic is added as part of this slice

Status:

- complete

Completed 2026-03-07:

- added Go-owned runtime/document/project mutations in
  `internal/projectstate/view_modes.go` for:
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - `toggleIsEditingViewMode`
  - `toggleSectionVisibility`
  - `toggleViewModeUserFacing`
  - `toggleViewModeTab`
  - `setViewModeName`
  - `setViewModeSortOrder`
  - `deleteViewMode`
- kept top-level layout filtering tied to current runtime section membership and
  parent relationships, so deleted and reparented sections are pruned from the
  authoritative layout map instead of being trusted from the frontend payload
- kept view-mode name validation local to `projectstate` with explicit slug
  conflict checks instead of handler-side validation
- added focused runtime tests in `internal/projectstate/view_modes_test.go` for:
  - invalid top-level layout filtering and valid missing-section restoration
  - create/switch layout and viewport swapping
  - name-validation and sort-order failures
  - delete fallback by sorted order

### Slice 2: IDE Route Transport

Deliver:

- project route registration and handlers for the same route cluster
- focused HTTP tests covering:
  - happy paths
  - missing project/section/view-mode failures
  - invalid view-mode name failures
  - view-mode sort-order `404` / `422` mapping

Acceptance:

- the frontend can call the existing generated endpoints against Go-owned
  handlers for this slice
- transport remains thin and explicit

Status:

- complete

Completed 2026-03-07:

- added thin IDE handlers in `internal/httpapi/project_routes.go` for:
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - `toggleIsEditingViewMode`
  - `toggleSectionVisibility`
  - `toggleViewModeUserFacing`
  - `toggleViewModeTab`
  - `setViewModeName`
  - `setViewModeSortOrder`
  - `deleteViewMode`
- kept handler behavior thin:
  - decode payload
  - validate required ids
  - call `internal/projectstate`
  - map explicit project/view-mode validation errors
- added focused HTTP coverage in `internal/httpapi/project_routes_test.go` for:
  - end-to-end happy-path mutation persistence across the full route cluster
  - missing view-mode and section failures
  - invalid view-mode name `422`
  - view-mode sort-order `404` / `422` mapping
- verified the completed slice with:
  - `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/httpapi -count=1 -timeout 180s`

## Open Questions

- whether `setTopLevelSectionLayout` should eventually share reusable helpers
  with later section create/delete/move slices or remain local to this doc
- whether the eventual `autoLayoutTopLevelSections` doc should live in Phase 4
  alongside project mutation transport or move under a later frontend/runtime
  behavior bucket

## Next Recommended Step

- Add a new focused doc for the explicitly deferred
  `autoLayoutTopLevelSections` slice before implementing it.
- Keep `setSectionName` deferred until there is a separate focused doc for name
  validation plus rename side effects.
