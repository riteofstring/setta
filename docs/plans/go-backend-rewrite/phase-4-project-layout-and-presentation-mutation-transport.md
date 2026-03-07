# Phase 4 Project Layout And Presentation Mutation Transport

## Purpose

This doc narrows the next missing Go-owned IDE mutation slice after the
completed `runCode` and Watch Code work.

The remaining high-leverage gap is not another code-execution path. It is the
set of frontend-facing project layout and presentation mutations that still
have no Go runtime owner even though the read-side project transport already
exists under `internal/projectstate` and `internal/projectview`.

## Status

Current repo status as of 2026-03-07:

- the focused Watch Code docs are complete
- the focused `runCode` `paramOverrides` doc is complete
- Go already owns the read-side project-state transport boundary used by IDE
  and deployment loads:
  - `internal/projectstate`
  - `internal/projectview`
  - `internal/httpapi/project_routes.go`
- this focused layout/presentation route cluster is now complete in Go:
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
- Go project routes now cover that cluster on top of the existing:
  - `getLatestProjectState`
  - `setCode`
  - `setCallable`
  - `setProjectConfigCodegenTargets`
  - `setWatchCodeEnabled`
  - `setWatchCodeInputs`

## Scope

This focused plan covers:

- Go-owned project-state mutations for project view/layout metadata
- thin IDE HTTP handlers for the route cluster above
- focused Go tests for runtime mutation semantics and route envelopes

## Non-Goals

- `setSectionName`
  - this drags in a separate section-name validation and rename-side-effect
    subsystem
- top-level section layout and view-mode lifecycle mutations
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - related view-mode routes
- structural section graph mutations
- parameter value mutation routes
- share/deployment policy transport for these routes in the same slice

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-deployment-state-routes-and-projectstate-transport.md`
- `backend/setta/routers/project_manager.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/project_state/project_manager_types.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/project_state/test_code_file_binding_registration.py`
- `tests/project_state/test_enqueue_method.py`
- `tests/routers/test_share_policy_routes.py`

## Dependency Finding

Current repo inspection shows:

- the frontend transport already knows how to render these fields once they are
  present in Go project snapshots
- the missing work is below the route layer:
  - there is no Go mutation owner for most layout/presentation fields
  - `internal/httpapi/project_routes.go` therefore cannot expose the routes
    honestly yet
- these routes are a better next step than `runCode cliId`
  - the current focused `runCode` doc already marks `cliId` as lower leverage
    until a real consumer appears
- this cluster is narrower than section creation/layout/view-mode ownership
  - it mostly mutates project fields or effective section payload fields
  - it does not require broad graph-edit semantics

## Working Decisions

- keep the HTTP layer thin
  - handlers decode, validate required ids, call `internal/projectstate`, and
    map explicit errors
- keep Go project snapshots as the source of truth
  - do not introduce route-local payload mutation helpers
- reuse the existing effective payload mutation pathway where it already fits
  - section presentation fields should update through the current
    section/shared-modifier/variant mutation ownership rules
- do not broaden into name validation in the same slice
  - `setSectionName` stays explicitly deferred
- do not add Python-compatibility shims
  - implement the product behavior directly in Go-owned project state

## Proposed Go Boundary

### `internal/projectstate`

Own:

- project-level layout/presentation fields
- section payload field mutation for layout/presentation settings
- viewport synchronization between the project and its active view mode

Do not own:

- HTTP decoding or response envelopes
- share-policy enforcement

### `internal/httpapi`

Own:

- IDE route registration
- request decoding and required-id validation
- mapping explicit project-state errors to stable HTTP envelopes

Do not own:

- mutation semantics

## Implementation Slices

### Slice 1: Project-State Mutation Owner

Deliver:

- Go project/document/runtime mutations for:
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
- focused runtime tests for:
  - active-view-mode viewport sync
  - multi-section lock toggles
  - effective section payload field updates

Acceptance:

- the runtime owns these mutations without HTTP knowledge
- route handlers can call one clear runtime boundary per mutation
- projectview continues to project updated state without extra shims

Status:

- complete

Completed:

- added Go-owned document/runtime mutations for:
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
- kept the state boundary explicit:
  - project-level fields update directly on `projectstate.Project`
  - section presentation fields reuse the existing effective-section mutation
    owner via `setCurrentSectionField(...)`
- implemented explicit project/view-mode sync for viewport updates:
  - project viewport remains the source used by current projections
  - the active view mode is updated in the same mutation so the frontend state
    does not drift

Tests:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -count=1 -timeout 180s`

### Slice 2: IDE Route Transport

Deliver:

- project route registration and handlers for the same route cluster
- focused HTTP tests covering:
  - happy paths
  - missing ids
  - unknown project/section failures
  - invalid viewport state failures where relevant

Acceptance:

- the frontend can call the existing generated endpoints against Go-owned
  handlers for this slice
- transport remains thin and explicit

Status:

- complete

Completed:

- added thin IDE handlers and route registration for the same mutation cluster
- kept transport explicit:
  - required id validation stays in the handler
  - runtime ownership stays in `internal/projectstate`
  - HTTP error mapping only covers the explicit project/section envelope cases
- verified the route surface through `getLatestProjectState` so the assertions
  exercise the same projected frontend payload shape the UI consumes

Tests:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 180s`

## Open Questions

- whether `setCallableHideParams` should eventually grow an explicit
  callable-section type guard
  - this slice kept it permissive and field-based so Go follows the current
    effective-payload mutation model instead of introducing a new partial type
    gate in only one route
- whether later route slices should group around:
  - section/view-mode layout ownership
  - parameter value mutation ownership
  - naming/rename validation ownership

## Next Recommended Step

- This focused doc is complete.
- The next highest-leverage adjacent slice is section layout and view-mode
  mutation transport:
  - `setTopLevelSectionLayout`
  - `createViewMode`
  - `setActiveViewMode`
  - related view-mode/layout routes
- Keep `setSectionName` deferred until there is a focused doc for name
  validation and rename-side effects.
