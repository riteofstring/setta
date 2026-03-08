# Phase 19 Project Lifecycle Mutations Plan

## Purpose

This doc tracks the remaining bounded Phase 19 work after the landed
project-shell read, rename, and notification slices.

The remaining direct frontend gap is now the project lifecycle mutation
cluster:

- `POST /saveProject`
- `POST /createProjectConfig`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`

The goal is to land explicit Go ownership for those routes without recreating
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
- the remaining Phase 19 caller-backed gap is now only the lifecycle mutation
  cluster above

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

## Open Decisions

### How much Python codegen/bootstrap should create perform?

Recommended boundary for the current slice:

- create the minimal valid project config in Go with a single view mode and
  no synthetic compatibility scaffolding
- only expand create-time bootstrap if a concrete current caller fails without
  it

Rationale:

- current Phase 19 is the direct frontend shell route cluster, not a broad
  recreation of Python project bootstrap behavior
- the only directly caller-backed create semantic confirmed by current tests is
  single-view-mode initialization
- adding automatic generated sections or watch/runtime side effects without a
  current caller would broaden scope

## Verification Plan

Run focused Go tests in:

- `./internal/projectstate`
- `./internal/projectshell`
- `./internal/httpapi`
- `./internal/app`

The first test target after implementation should cover:

- view-mode initialization on create
- invalid name mapping for create and save-as
- delete cleanup hook execution
- save notification persistence / websocket delivery
- real app route ownership for the lifecycle cluster

## Next Recommended Step

Implement Stage 1 now:

- add explicit create / clone / delete document helpers
- add lifecycle methods to `internal/projectshell`
- keep notification and terminal cleanup behind injected hooks
