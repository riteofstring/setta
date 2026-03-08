# Phase 19 Project Shell Route Cluster Plan

## Purpose

This doc records the next executable phase after the landed Phase 18 AI/chat
closeout and the rerank in
`phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`.

The current direct frontend project shell still crosses back into Python for
project boot, load, create/save/delete, rename, and notification read/delete.
Those are now the highest-leverage remaining caller-backed routes because they
sit on the main app shell path and already have strong Go project-state
foundations underneath them.

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

Recommendation:

- add focused `internal/projectstate` helpers where the behavior is truly
  document mutation
- keep orchestration, mode policy, and cleanup hooks in the new
  `internal/projectshell` service

### 3. Notification persistence owner

The frontend still calls `getNotifications` and `deleteNotification`, but the
landed Go runtime only broadcasts websocket notifications; it does not own a
persisted notification store yet.

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

## Current Recommendation

- start Phase 19 with Slice 1 only
- do not broaden immediately into save/delete/create until the read service
  boundary exists

## Verification

- docs and planning only; no automated tests were run
