# Phase 19 Project Lifecycle Mutations Plan

## Purpose

This doc tracks the bounded Phase 19 lifecycle slice that followed the landed
project-shell read, rename, and notification slices.

The lifecycle mutation cluster for the current caller-backed project shell was:

- `POST /saveProject`
- `POST /createProjectConfig`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`

The goal was to land explicit Go ownership for those routes without recreating
the Python manager graph or pushing orchestration into HTTP handlers.

## Current Status

As of 2026-03-10:

- Phase 19 Slice 1 is landed:
  - `POST /loadAllProjectMetadata`
  - `POST /loadProjectConfig`
- Phase 19 Slice 2 is landed:
  - `POST /setProjectConfigName`
  - `POST /getNotifications`
  - `POST /deleteNotification`
- this lifecycle slice is now landed:
  - `POST /saveProject`
  - `POST /createProjectConfig`
  - `POST /saveAsNewProjectConfig`
  - `POST /deleteProjectConfigs`
- the direct caller-backed project-shell route cluster is now Go-owned for the
  current clean-break scope

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-19-project-shell-route-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
- `backend/setta/routers/projects.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/session_project_manager.py`
- `tests/project_state/test_project_config_view_modes.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/project_state/test_watch_code.py`
- `frontend/src/state/actions/project/loadProject.ts`
- `frontend/src/state/actions/project/saveProject.ts`
- `frontend/src/components/Modals/DeleteProjectWarningModal/DeleteProjectWarningModal.tsx`
- `internal/projectstate`
- `internal/projectshell`
- `internal/httpapi/project_shell_routes.go`
- `internal/app/app.go`
- `internal/notifications`
- `internal/terminals`

## Product Semantics To Preserve

These come from current Python code/tests as reference material, not as an
architecture contract:

- manual save persists the current main project document and surfaces a
  non-temporary `"Saved!"` save notification
- create project config returns the new project name and initializes a single
  view mode
- save-as validates the new name and clones from the current project id
- delete project configs removes the projects, persists the new document, and
  reclaims project-scoped terminal sessions
- newly created configs must not rely on heuristic naming or route-local map
  iteration

## Desired Go Boundaries

### 1. `internal/projectstate` owns document mutation helpers

Add focused helpers where behavior is truly document-level:

- create a new project config
- clone an existing project config to a new config id/name
- delete one or more project configs

These helpers should keep validation and normalization inside the document
source of truth, not in `internal/httpapi`.

### 2. `internal/projectshell` owns lifecycle orchestration

The project-shell service should own:

- explicit manual save over `projectstate.Runtime.Save(...)`
- lifecycle mutation orchestration around the new document helpers
- save notification persistence/broadcast
- post-mutation metadata refresh hooks
- delete-time cleanup hook invocation

### 3. App wiring injects cleanup and broadcast dependencies

The app should inject explicit hooks into `internal/projectshell` for:

- post-save notification persistence and websocket broadcast
- post-create / post-save-as / post-delete metadata refresh for frontend shell
- delete-time terminal cleanup by `projectConfigId`

The project-shell service must not reach directly into terminal internals.

## Planned Stages

### Stage 1: Document and service foundations

Deliverables:

- new `internal/projectstate` create / clone / delete helpers
- new `internal/projectshell` lifecycle methods for:
  - `SaveProject`
  - `CreateProjectConfig`
  - `SaveAsNewProjectConfig`
  - `DeleteProjectConfigs`
- focused service tests for:
  - single-view-mode create semantics
  - invalid create/save-as names
  - cloned config ids/names
  - delete behavior and default-project handling

### Stage 2: Thin HTTP transport

Deliverables:

- thin `internal/httpapi` route registration for:
  - `POST /saveProject`
  - `POST /createProjectConfig`
  - `POST /saveAsNewProjectConfig`
  - `POST /deleteProjectConfigs`
- typed error mapping for:
  - invalid names
  - missing project ids
  - missing project ids during delete/save/save-as

### Stage 3: Real app wiring

Deliverables:

- save notification persistence + websocket broadcast
- metadata websocket refresh after lifecycle mutations
- delete-time terminal reclamation by project id
- focused real app tests proving the active frontend caller surface now stays
  in Go

## Explicit Non-Goals

- `POST /getDefaultConfigName`
- `POST /setAsDefaultProject`
- recreating Python `project_manager_switcher`
- delete-time cleanup for unrelated runtimes that do not have a current caller
- heuristic fallback naming or implicit duplicate resolution

## Completed

- added explicit `internal/projectstate` document/runtime helpers for:
  - create project
  - clone project
  - delete projects
  - deterministic default-project reconciliation after delete
- added explicit `internal/projectshell` lifecycle ownership for:
  - manual save
  - create project config
  - save as new project config
  - delete project configs
- kept save notifications, metadata refresh, and delete-time cleanup behind
  injected hooks instead of route-local orchestration
- added thin `internal/httpapi` transport plus typed lifecycle error mapping
- wired the real IDE app for:
  - `AllProjectMetadata` broadcasts after create/save-as/delete
  - non-temporary `"Saved!"` notification broadcast after manual save
  - delete-time terminal reclamation by `projectConfigId`
- added focused tests in:
  - `internal/projectstate`
  - `internal/projectshell`
  - `internal/httpapi`
  - `internal/app`

## Decisions Made

### `saveAsNewProjectConfig` always creates an independent cloned project

Recommended boundary for the current slice:

- keep accepting the current `withRefs` transport field for the active caller
  shape
- ignore that field inside the Go owner and always create an independent
  cloned project
- do not recreate Python shared-ref semantics in the Go document model

Rationale:

- the Go project document is already a self-contained per-project graph, not a
  shared-ref manager graph
- robust shared-ref parity would require reintroducing cross-project shared
  state or building schema-aware raw-payload id aliasing/rewrite logic
- neither dependency is justified by the current caller-backed project-shell
  surface

### Create keeps minimal bootstrap

- create initializes a minimal valid project with a single view mode
- it does not recreate broader Python bootstrap side effects without a current
  caller proving they are needed

## Verification

- `./scripts/go.sh test ./internal/projectstate ./internal/projectshell ./internal/httpapi ./internal/app -run 'Test(Document(CreateProject|CloneProject|DeleteProjects)|Service(Load|SetProjectConfigName|SaveProject|CreateProjectConfig|SaveAsNewProjectConfig|DeleteProjectConfigs)|RegisterProjectShellRoutes|App(ServesProjectShell(ReadRoutes|RenameAndNotificationRoutes|LifecycleRoutes)|SetProjectConfigNameRouteBroadcastsProjectAndMetadataUpdates|ProjectShellLifecycleRoutesBroadcastMetadataAndSaveNotification))' -count=1`

## Next Recommended Step

Start the adjacent git-read route phase:

- use `phase-20-git-read-route-cluster-plan.md` as the next working doc
- keep the current project-shell route cluster closed unless a new caller
  appears for `getDefaultConfigName` or `setAsDefaultProject`
