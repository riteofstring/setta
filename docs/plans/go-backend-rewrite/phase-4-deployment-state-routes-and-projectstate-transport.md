# Phase 4 Deployment State Routes And Project-State Transport

## Purpose

This doc narrows the remaining deployment-mode Phase 4 work to the missing
frontend-facing project-state transport that share/app deployment state routes
need.

The remaining gap is not another thin handler migration. Share/app
`/state` and `/project_config` load paths currently hydrate the frontend from a
full `ProjectStateSingleConfig` payload. Go does not own that payload yet. The
next useful slice is therefore a Go source-of-truth and projection boundary for
frontend state, then deployment route migration on top of it.

## Status

Current repo status as of 2026-03-06:

- Go already owns the bounded deployment runtime stack under:
  - `internal/deployments`
  - `internal/app`
  - `internal/httpapi/deployment_routes.go`
  - `internal/runs`
- Go already owns:
  - deployment manifest/policy loading
  - base deployment runtime + per-session overlays
  - deployment `runCode`
  - current-session bootstrap
  - expired-session cleanup
- the remaining deployment HTTP gap is still:
  - `GET /api/share/deployments/{deploymentName}/{version}/state`
  - `POST /api/share/deployments/{deploymentName}/{version}/project_config`
  - `GET /api/app/deployments/{deploymentName}/{version}/state`
  - `POST /api/app/deployments/{deploymentName}/{version}/project_config`
- the current blocker is below the route layer:
  - frontend share/app load paths still expect a frontend-facing
    `ProjectStateSingleConfig`
  - app mode also expects `appDefinition` and `appSpec`
- Go project state now includes the first richer frontend source fields under
  `internal/projectstate`:
  - app definition metadata on the document
  - project-config view state on each project
  - code-object graphs on each project
  - opaque frontend payload storage for codegen targets, section impls, code
    object impls, and modifier-heavy subtrees
- the remaining blocker is now narrower:
  - Go still does not have the frontend read-projection layer that turns those
    source fields into `ProjectStateSingleConfig`
- route-local compatibility shims would create a dead-end transport layer with
  no Go-owned source of truth

## Scope

This focused plan covers:

- defining the Go-owned frontend-facing project-state transport boundary for
  deployment read routes
- expanding Go project-state source fields only where the deployment frontend
  load path actually requires them
- projecting deployment overlay runtime snapshots into frontend state payloads
- migrating share/app deployment state and project-config routes onto that
  projection

## Non-Goals

- preserving Python `ProjectStateBackend` or `ProjectStateSingleConfig` as an
  internal architecture
- broad IDE route migration in the same slice
- deployment publish/list/latest route migration
- deployment mutation routes
- parameter-edit or listener-runtime parity beyond what current deployment
  state loading truly needs
- supporting Python-authored deployment `project.json` as a compatibility
  target

## Inputs

- `docs/plans/go-backend-rewrite/phase-3-project-state-core.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-deployment-session-transport-and-cleanup.md`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `backend/setta/project_state/share_runtime_state.py`
- `backend/setta/types/project_state.py`
- `backend/setta/types/helpers_lvl3.py`
- `tests/routers/test_share_sessions.py`
- `tests/routers/test_app_sessions.py`
- `frontend/src/state/actions/share.ts`
- `frontend/src/state/actions/app.ts`
- `frontend/src/state/actions/project/loadProject.ts`
- `frontend/src/state/definitions.ts`
- `frontend/src/utils/generatedTypes.ts`

## Dependency Finding

The previous Phase 4 deployment-session doc correctly narrowed the route gap,
but current inspection shows that the next missing dependency is not session
transport anymore.

- `loadShareProjectConfig()` immediately calls `loadProjectState(...)`
- `loadAppDeploymentState()` stores a `ProjectStateSingleConfig` in
  `useAppConfigs`
- frontend stores and render paths expect more than:
  - deployment metadata
  - policy
  - session id
- the current Go runtime document does not contain enough frontend source data
  to answer those loads honestly

That makes a frontend-facing Go project-state transport boundary the
highest-leverage next step.

## Field Inventory

Current frontend inspection shows the deployment share/app UI already depends
on these project-state fields during bootstrap and first render:

- project-config identity + routing state:
  - `id`
  - `name`
  - `sectionVariantMap`
  - `entryCodeBlockId`
  - `activeIds`
- view state:
  - `viewModes`
  - `activeViewModeId`
  - `isEditingViewMode`
  - `topLevelSections`
- graph/render state:
  - `sections`
  - `sectionVariants`
  - `sectionImpls`
  - `codeObjs`
  - `codeObjVariants`
  - `codeObjImpls`
  - `edges`
  - `agenticEdges`
  - `parentSectionMap`
  - `shownParamIds`
  - `singletonSections`
- app-mode additions:
  - `appDefinition`
  - `appSpec`

Slice 1 intentionally split those into:

- explicit typed source fields for project/config identity, layout, code-object
  graphs, and app-definition metadata
- opaque raw JSON payloads for modifier-heavy or union-heavy frontend data that
  Go does not own semantically yet

## Working Decisions

- keep `internal/projectstate` as the runtime ownership boundary
  - do not turn it into a route-local serializer pile
- add a separate read-projection layer for frontend state
  - Go runtime snapshots remain the source of truth
  - frontend transport structs are projected from those snapshots
- do not reintroduce the Python `ProjectStateBackend` shape in Go
  - Go can keep one project/config per `Document.Project`
  - route payloads only need to satisfy the current frontend, not Python's
    backend object graph
- persist source fields, not derived frontend caches
  - derive `singletonSections`
  - derive `parentSectionMap`
  - derive `genCodeBinding`
  - keep derived maps out of the persisted document unless a later subsystem
    proves they must be stored
- keep app deployment metadata outside the generic projector where possible
  - `appDefinition` and `appSpec` remain deployment/app concerns
  - the projector should only own frontend project-state payloads
- allow richer frontend impl payloads without widening run planning
  - `internal/projectstate` now accepts opaque section/code-object impl payloads
    for frontend state transport
  - run planning still treats only the known Go runtime kinds as executable
    semantics
- if backend/frontend transport shapes need to change, update both sides in the
  same bounded slice
  - do not leave Go routes and frontend generated callers intentionally
    mismatched

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- persisted project document
- runtime ownership and overlays
- the source fields required to rebuild deployment frontend state

Do not own:

- HTTP response shaping
- deployment-specific wrapper payloads

### `internal/projectview`

Own:

- frontend-facing read models for:
  - single-config project state
  - derived fields needed by the current frontend load path
- projection from `projectstate.Document` + project id to frontend payloads

Do not own:

- mutation execution
- runtime persistence
- deployment policy/session rules

### `internal/httpapi`

Own:

- share/app route decoding
- session/config lookup
- mapping projection/runtime errors to HTTP responses

Do not own:

- frontend-state derivation logic

## Source Fields Needed For Deployment Frontend State

The current deployment frontend path needs a Go source of truth for at least:

- project-config identity and naming
- viewport, view modes, active ids, and top-level layout
- section graph, active section variants, and section impl payloads
- code-object graph and param impl payloads
- edge and agentic-edge metadata
- codegen targets and generated-entry metadata
- deployment app definition metadata for app mode

Derived transport fields should be computed from those source fields:

- `singletonSections`
- `parentSectionMap`
- `shownParamIds`
- `requiredDecodedImages`
- `genCodeBinding`

## Implementation Slices

### Slice 1: Frontend-State Inventory And Source Schema Expansion

Deliver:

- a written field inventory for the deployment frontend load path
- the first expansion of `internal/projectstate.Document` / `Project` to carry
  missing source fields required by deployment frontend state
- tests proving the richer document still normalizes, clones, saves, and loads

Acceptance:

- Go project state contains the source fields needed to build real deployment
  frontend state
- the expanded document is still Go-owned and does not mirror Python
  persistence blindly
- deployment runtime overlays can hold those richer snapshots without route
  shims

Notes:

- this slice is allowed to broaden `internal/projectstate` beyond the initial
  Phase 3 run-planning document
- this slice should not yet add deployment routes

Status:

- complete

Completed:

- inventoried the frontend deployment-state fields exercised by:
  - `frontend/src/state/actions/share.ts`
  - `frontend/src/state/actions/app.ts`
  - `frontend/src/components/Pages/MainContainerCore.tsx`
  - `frontend/src/components/App/AppRenderer.tsx`
- expanded `internal/projectstate` to carry:
  - document-level app definition metadata
  - project-level view state, layout, edges, and agentic edges
  - code-object graphs
  - raw frontend payload fields for codegen targets, section impls, and
    code-object impls
- kept run-planning behavior stable:
  - known Go runtime section kinds still drive run planning
  - richer frontend-only section kinds are now stored as opaque payload-backed
    impls instead of being rejected at normalization time

Tests:

- `./scripts/go.sh test ./internal/projectstate ./internal/deployments ./internal/runs -count=1`

### Slice 2: Frontend Projection Layer

Deliver:

- a dedicated frontend read-projection package
- projector helpers for:
  - default deployment project load
  - explicit project-config load
- projection tests for:
  - singleton section detection
  - parent map derivation
  - generated binding derivation
  - project-config selection errors

Acceptance:

- handlers can ask for a frontend state payload from a real Go projection layer
- projection behavior is deterministic from runtime snapshot contents
- the projector does not read files or mutate runtime state

### Slice 3: Share/App Deployment State Route Migration

Deliver:

- Go handlers for:
  - share deployment state
  - share deployment project-config
  - app deployment state
  - app deployment project-config
- route tests covering:
  - default config load
  - alternate config load
  - missing session failures
  - unknown config failures
  - app definition/spec response shaping

Acceptance:

- share/app state loads resolve from deployment overlay runtimes
- no Python route is needed for current deployment frontend bootstrap
- transport stays thin and depends on explicit runtime + projection helpers

### Slice 4: Frontend Alignment And Verification

Deliver:

- any required frontend transport updates in the same slice as backend route
  migration
- focused frontend verification for share/app bootstrap and config switching
- focused backend tests for deployment state route coverage

Acceptance:

- frontend bootstrap works against Go-owned share/app state routes
- there is no intentional backend/frontend payload mismatch left behind

## Open Questions

- whether the first richer `projectstate.Project` expansion should live in one
  commit or in a few bounded schema slices
- whether deployment app definition metadata belongs on the root document or in
  deployment runtime metadata
- whether the current endpoint/type generation flow should be updated in the
  same route-migration slice or one slice earlier

## Next Recommended Step

- Implement Slice 2:
  - add `internal/projectview` as the frontend read-projection layer
  - project richer runtime snapshots into `ProjectStateSingleConfig`
  - keep `parentSectionMap`, `singletonSections`, `shownParamIds`, and
    `genCodeBinding` derived instead of persisted
