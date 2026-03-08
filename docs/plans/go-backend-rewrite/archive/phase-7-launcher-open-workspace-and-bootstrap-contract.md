# Phase 7 Launcher Open Workspace And Bootstrap Contract

## Purpose

This doc scopes the next bounded launcher/bootstrap slice after the completed
launcher-home recent-workspaces and directory-browser work.

The goal is to make the Go launcher/runtime path actually landable before
porting the remaining launcher management routes:

- establish a real Go launcher executable/runtime contract
- establish the missing Go bootstrap/session prerequisites
- move `POST /openLauncherWorkspace` once those prerequisites exist

## Current Status

As of 2026-03-08:

- Go owns launcher-mode recent-workspace, directory-browser, and
  `POST /openLauncherWorkspace` routes
- Go now owns Stage 1 from this doc:
  - local IDE/launcher session registration and cleanup
  - bootstrap HTML at `GET /__setta__/bootstrap`
  - launcher-mode fallback runtime startup without an explicit project workspace
- Go now owns Stage 2 from this doc:
  - workspace-root validation and create-if-missing behavior for launcher mode
  - local IDE session spawn/reuse and bootstrap URL fragment minting
  - launcher recent-workspace and last-used-workspace updates after successful
    launch
- Python still owns:
  - `/launch` and `/createWorkspaceLaunchIntent`
  - launcher-origin trust persistence and proof validation
  - IDE launcher management/status routes

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-launcher-home-recent-workspaces-and-directory-browser.md`
- `docs/plans/go-backend-rewrite/archive/phase-7-runtime-surface-inventory.md`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/setta-cli-commands.md`
- `docs/reference/urls-and-routes.md`
- `backend/setta/start.py`
- `backend/setta/launch.py`
- `backend/setta/routers/launcher_home.py`
- `backend/setta/routers/bootstrap.py`
- `backend/setta/sessions/registry.py`
- `backend/setta/utils/network.py`
- `backend/setta/utils/session_rollback.py`
- `tests/routers/test_launcher_home_routes.py`
- `tests/routers/test_launch_routes.py`
- `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx`

## Scope

This slice is intentionally split into two landable stages.

### Stage 1

Establish the Go launcher/bootstrap executable contract:

- create Go-owned local session registration and cleanup for IDE/launcher
  processes
- serve `GET /__setta__/bootstrap`
- make `cmd/setta-server` usable as a launcher target by allowing launcher-mode
  fallback runtime startup without an explicit project workspace
- document the Go launcher target contract that later launcher metadata should
  point at

### Stage 2

Move `POST /openLauncherWorkspace`:

- validate/create the requested workspace root within launcher allowed roots
- spawn or reuse a Go-owned IDE session
- mint the bootstrap URL fragment for that IDE session
- update recent workspaces and launcher last-used workspace state

## Explicit Non-Goals

Do not include:

- `/launch`
- `/createWorkspaceLaunchIntent`
- SSH/remote workspace launch
- launcher-origin trust persistence and proof validation
- IDE launcher setup/update/remove/status routes
- browser/desktop artifact installation

## Working Decisions

- use the current Go binary as the launcher target contract instead of trying to
  preserve the Python `setta launcher` CLI shape
- treat the session registry as the source of truth for local launch/reuse
- implement bootstrap HTML in Go so bootstrap URLs returned by Go-owned launch
  flows are actually consumable
- keep launcher transport thin; put launch/session semantics in dedicated Go
  runtime packages
- defer launcher-origin trust until the later launch/bootstrap handoff slice
  rather than mixing it into local launcher session startup

## Recommended Landing Order

1. Stage 1: executable/bootstrap contract
2. Stage 2: `POST /openLauncherWorkspace`
3. launcher management/status routes
4. remaining launch/bootstrap/handoff routes

## Progress Notes

- 2026-03-08: created this focused doc after confirming that
  `openLauncherWorkspace` is blocked on missing Go bootstrap/session/runtime
  ownership, not just a missing transport handler.
- 2026-03-08: completed Stage 1 by adding Go-owned local session registry
  writes in `internal/localsessions/registry.go`, current-process session
  bootstrap in `cmd/setta-server/local_session.go`, bootstrap HTML in
  `internal/httpapi/bootstrap_page.go`, and launcher-mode fallback startup
  defaults in `internal/config/config.go`.
- 2026-03-08: completed Stage 2 by adding Go-owned local IDE session
  spawn/reuse in `internal/launcher/session_launcher.go`, workspace-open
  ownership in `internal/launcher/open_workspace.go`, launcher-home transport
  in `internal/httpapi/launcher_home_routes.go`, and launcher-mode dependency
  wiring in `internal/app/app.go`.
- 2026-03-08: kept launcher-origin trust and proof handoff explicitly out of
  this slice. Go-owned `POST /openLauncherWorkspace` now returns a plain
  bootstrap fragment and relies on the already-landed Go bootstrap page, while
  later launch/bootstrap handoff work remains responsible for origin trust.

## Recommended Next Step

Return to the broader Phase 7 launcher plan and implement the next bounded
slice: IDE launcher management/status transport and runtime ownership.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher ./internal/localsessions -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppLauncherModeListsAndMutatesRecentWorkspacesOverHTTP' -count=1 -timeout 300s`
