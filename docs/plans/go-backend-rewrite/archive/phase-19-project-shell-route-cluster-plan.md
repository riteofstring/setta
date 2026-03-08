# Phase 19 Project Shell Route Cluster Plan

## Purpose

This doc records the next executable phase after the landed Phase 18 AI/chat
closeout and the rerank in
`phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`.

The direct frontend project shell used to cross back into Python for project
boot, load, create/save/delete, rename, and notification read/delete. Those
were the highest-leverage remaining caller-backed routes because they sat on
the main app shell path and already had strong Go project-state foundations
underneath them.

## Status

Current repo status as of 2026-03-10:

- the rerank in
  `phase-19-remaining-direct-frontend-route-inventory-and-rerank.md` is
  complete
- Slice 1 is now landed:
  - Go-owned `POST /loadAllProjectMetadata`
  - Go-owned `POST /loadProjectConfig`
  - explicit `internal/projectshell` read owner over the landed
    `projectstate` runtime and `projectview` projection
  - deterministic document-level project lookup by config name with explicit
    ambiguity rejection
  - thin `internal/httpapi` transport and real IDE app wiring
- Slice 2 is now landed:
  - Go-owned `POST /setProjectConfigName`
  - Go-owned `POST /getNotifications`
  - Go-owned `POST /deleteNotification`
  - explicit `internal/projectstate` project-name validation/mutation helper
  - explicit `internal/notifications` persisted store/service
  - real IDE app websocket metadata/project-state rename broadcast plus focused
    service/route/app coverage
- Slice 3 is now landed:
  - Go-owned `POST /saveProject`
  - Go-owned `POST /createProjectConfig`
  - Go-owned `POST /saveAsNewProjectConfig`
  - Go-owned `POST /deleteProjectConfigs`
  - explicit document/runtime lifecycle helpers in `internal/projectstate`
  - explicit save notification, metadata refresh, and terminal-cleanup hooks
    behind `internal/projectshell`
- the current caller-backed project-shell route cluster is now Go-owned for
  the clean-break scope
- the adjacent git read cluster is now the next executable direct-frontend
  phase and is tracked in `phase-20-git-read-route-cluster-plan.md`

## Scope

Caller-backed route surface for this phase:

- `POST /loadAllProjectMetadata`
- `POST /loadProjectConfig`
- `POST /createProjectConfig`
- `POST /saveProject`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`
- `POST /setProjectConfigName`
- `POST /getNotifications`
- `POST /deleteNotification`

Explicit non-goals for the first Phase 19 slice:

- `POST /getDefaultConfigName`
- `POST /setAsDefaultProject`
- git read routes
- dormant listener-chat routes
- dormant detached-run routes

## Existing Go Foundations

- `internal/projectstate.Registry`
  - persisted main/settings document ownership
- `internal/projectstate.Runtime`
  - explicit mutate/save boundary with revision and `frontendOpId` tracking
- `internal/projectstate.Document.ProjectConfigMetadata()`
  - deterministic metadata view
- `internal/projectview.SingleConfig`
  - frontend-facing single-project materialization
- `internal/httpapi/project_routes.go`
  - thin route registration patterns and project-state mutation error handling
- `internal/app`
  - real IDE app wiring for project-state-backed route clusters

These are enough to avoid recreating the Python `project_manager_switcher` and
its manager graph as a compatibility layer.

## Python Reference Behaviors To Preserve As Product Semantics

Read from the current Python code/tests as reference material:

- `backend/setta/routers/projects.py`
  - route set, mode guards, and current error mapping
- `tests/routers/test_projects_mode_guard.py`
  - `loadAllProjectMetadata` remains blocked in launcher mode
- `tests/routers/test_name_validation_routes.py`
  - rename rejects invalid names and persists/broadcasts metadata changes
- `tests/project_state/test_project_config_view_modes.py`
  - newly created configs start with a single view mode

These inform product behavior, but they are not a requirement to preserve the
Python internal architecture.

## Missing Boundaries

### 1. Project-shell service boundary

Go needs an explicit owner above `projectstate.Registry` that can:

- read all project metadata plus default project id
- materialize a single frontend config view by project name
- save the current main document on demand
- rename/create/clone/delete project configs

Status:

- landed for read, rename, notification, save, create, save-as, and delete
  ownership

Recommendation:

- add a dedicated `internal/projectshell` service instead of broadening
  `internal/httpapi` or creating another large runtime singleton

### 2. Project lifecycle helpers above the document model

The current Go tree has strong document/runtime foundations, but it does not
yet expose explicit helpers for:

- create project config
- clone/save-as project config
- delete project configs
- rename project config with validation

Status:

- rename helper is now landed through explicit
  `internal/projectstate.Document.SetProjectName(...)`
- create/clone/delete helpers are now landed

Recommendation:

- add focused `internal/projectstate` helpers where the behavior is truly
  document mutation
- keep orchestration, mode policy, and cleanup hooks in the new
  `internal/projectshell` service

### 3. Notification persistence owner

The frontend still calls `getNotifications` and `deleteNotification`, but the
landed Go runtime only broadcasts websocket notifications; it does not own a
persisted notification store yet.

Status:

- landed through a dedicated `internal/notifications` JSON store/service and
  thin project-shell transport

Recommendation:

- create a small explicit Go notification store/service instead of burying
  notification reads inside project-state or websocket code
- keep the transport thin and typed

### 4. Delete-time cleanup hooks

Python currently ties project-config deletion to terminal cleanup. The Go phase
needs the same product outcome, but through an explicit dependency.

Recommendation:

- inject a delete-time cleanup hook from app wiring into the project-shell
  service
- do not let the project-shell owner reach into terminal internals directly

## Planned Slices

### Slice 1: Project-shell read ownership

Routes:

- `POST /loadAllProjectMetadata`
- `POST /loadProjectConfig`

Deliverables:

- new `internal/projectshell` read service
- thin project-shell route registration in `internal/httpapi`
- launcher/IDE mode policy equivalent to the current live frontend behavior
- single-config load by current project name over `projectview.SingleConfig`
- focused tests in service, route, and real app layers

Why this goes first:

- it is the app boot and config-navigation path
- the required Go foundations already exist
- it establishes the service boundary that the later project lifecycle slices
  should reuse

Status:

- complete

Completed:

- added `internal/projectshell` as the explicit read owner over the main
  `projectstate.Runtime`
- added deterministic `Document.ProjectIDByName(...)` lookup in
  `internal/projectstate` with exact-name matching and explicit ambiguity
  rejection instead of map-iteration fallback
- added thin `internal/httpapi` transport for:
  - `POST /loadAllProjectMetadata`
  - `POST /loadProjectConfig`
- wired the new route cluster into the real IDE app
- added focused tests in:
  - `internal/projectstate`
  - `internal/projectshell`
  - `internal/httpapi`
  - `internal/app`

Decisions made:

- keep project-name lookup as a document/source-of-truth concern, not an HTTP
  helper
- reject ambiguous duplicate project names explicitly instead of resolving by
  incidental map order
- keep the new project-shell read owner separate from the large existing
  project mutation transport cluster

### Slice 2: Rename and notification owner

Routes:

- `POST /setProjectConfigName`
- `POST /getNotifications`
- `POST /deleteNotification`

Deliverables:

- explicit project-name validation/persist/broadcast path in Go
- explicit persisted notification store/service
- app wiring that keeps websocket notification broadcast and persisted
  notification read/delete separate but coherent
- focused tests for invalid names, metadata refresh, notification reads, and
  notification deletion

Why this is next:

- rename has a live current caller
- notification reads are already mounted in the overview shell
- this slice keeps the project shell usable without yet taking on create/save
  cloning and delete cleanup

Status:

- complete

Completed:

- added explicit `internal/projectstate` project-name validation/mutation with:
  - trim/format validation
  - reserved-name rejection
  - slug-based collision rejection
- added explicit `internal/notifications` persisted store/service for:
  - project-scoped reads
  - idempotent delete
- added thin `internal/httpapi` transport for:
  - `POST /setProjectConfigName`
  - `POST /getNotifications`
  - `POST /deleteNotification`
- wired real IDE app ownership for:
  - persisted rename through the main `projectstate.Runtime`
  - websocket `UpdateFrontendProjectState` and `AllProjectMetadata` broadcasts
    after rename
  - persisted notification reads/deletes under `setta_files/notifications.json`
- added focused tests in:
  - `internal/projectstate`
  - `internal/notifications`
  - `internal/projectshell`
  - `internal/httpapi`
  - `internal/app`

Decisions made:

- keep project-name validation as document/source-of-truth logic in
  `internal/projectstate`, not route-local string checking
- keep persisted notifications outside project-state documents and websocket
  transport
- keep rename error transport thin, but preserve a direct `detail` payload for
  invalid project-name responses because the current caller reads that field
  directly

### Slice 3: Save and project lifecycle mutations

Routes:

- `POST /saveProject`
- `POST /createProjectConfig`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`

Deliverables:

- explicit manual-save owner over `projectstate.Runtime.Save(...)`
- create/save-as/delete project lifecycle helpers above the document model
- delete-time cleanup hook integration for terminal-owned resources
- focused tests for view-mode initialization, config cloning, invalid names,
  delete cleanup, and real app route ownership

Why this is last:

- it is the heaviest slice in this cluster
- it depends on the service boundary from Slice 1 and the notification/save UI
  semantics from Slice 2

Status:

- complete

Completed:

- added explicit `internal/projectstate` helpers for:
  - create
  - clone
  - delete
  - deterministic default-project reconciliation
- added explicit `internal/projectshell` lifecycle methods for:
  - `SaveProject`
  - `CreateProjectConfig`
  - `SaveAsNewProjectConfig`
  - `DeleteProjectConfigs`
- added thin `internal/httpapi` transport for the full lifecycle route set
- wired the real IDE app for:
  - metadata websocket refresh after create/save-as/delete
  - non-temporary `"Saved!"` save notification broadcast
  - delete-time terminal session reclamation by project id
- added focused tests in:
  - `internal/projectstate`
  - `internal/projectshell`
  - `internal/httpapi`
  - `internal/app`

Decisions made:

- `saveAsNewProjectConfig` now always creates an independent clone in Go
- the current `withRefs` request field is accepted for caller-shape continuity
  but does not recreate Python shared-ref semantics
- create remains minimal and only initializes a single view mode plus the
  bounded document defaults needed by current callers

## Route Shape And Error Expectations

- keep transport thin and typed
- map missing project names/config ids to typed `404` responses
- map invalid rename/create/save-as names to typed `422` responses
- keep launcher-mode restrictions explicit at the route boundary
- do not introduce backward-compatibility shims for the Python manager graph

## Verification Plan

For each landed slice, add focused tests in:

- `internal/projectshell`
  - service behavior and mutation/read edge cases
- `internal/httpapi`
  - route registration, mode guards, and error mapping
- `internal/app`
  - real handler wiring for the active route surface

Python tests remain reference material for behavior and edge cases, not an
execution target for the Go phase.

## Open Questions

### Where should persisted notifications live?

Recommended option:

- a dedicated Go notification store/service under `internal/notifications`
  with app wiring into the websocket broadcaster and project-shell routes

Rationale:

- notifications are not project-state document data
- they already cross project and runtime concerns
- this keeps persistence separate from websocket transport and project-state
  mutations

Status:

- answered and landed in Slice 2

## Current Recommendation

- Phase 19 project-shell route ownership is complete for the current
  caller-backed clean-break scope
- keep the non-caller-backed `getDefaultConfigName` and `setAsDefaultProject`
  routes out of scope unless a real caller appears
- start the adjacent git read phase with
  `phase-20-git-read-route-cluster-plan.md`

## Verification

- `./scripts/go.sh test ./internal/projectstate ./internal/notifications ./internal/projectshell ./internal/httpapi ./internal/app -run 'Test(Document(CreateProject|CloneProject|DeleteProjects|SetProjectName)|StoreListByProjectAndDelete|Service(Get|SetProjectConfigName|Load|SaveProject|CreateProjectConfig|SaveAsNewProjectConfig|DeleteProjectConfigs)|RegisterProjectShellRoutes|App(ServesProjectShell(ReadRoutes|RenameAndNotificationRoutes|LifecycleRoutes)|SetProjectConfigNameRouteBroadcastsProjectAndMetadataUpdates|ProjectShellLifecycleRoutesBroadcastMetadataAndSaveNotification))' -count=1`
