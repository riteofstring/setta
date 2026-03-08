# Phase 7 Launcher Home Recent Workspaces And Directory Browser

## Purpose

This doc scopes the first bounded launcher-mode runtime slice inside the
launcher/bootstrap Phase 7 work.

The goal is to move the launcher home data surface that does not depend on
workspace launch/bootstrap handoff:

- recent workspaces
- launcher allowed-root discovery
- launcher directory browsing with pagination and truncation semantics

## Current Status

As of 2026-03-08:

- Go now owns this bounded launcher-mode HTTP route cluster in:
  - `internal/launcher/home.go`
  - `internal/httpapi/launcher_home_routes.go`
  - `internal/app/app.go`
- Python still owns the remainder of `backend/setta/routers/launcher_home.py`,
  especially `POST /openLauncherWorkspace`
- the launcher home frontend in
  `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx` consumes:
  - `GET /launcherRecentWorkspaces`
  - `POST /addLauncherRecentWorkspace`
  - `POST /removeLauncherRecentWorkspace`
  - `POST /pinLauncherRecentWorkspace`
  - `GET /launcherFilesystemRoots`
  - `POST /listLauncherDirectory`
  - `POST /openLauncherWorkspace`

`openLauncherWorkspace` crosses into launch/bootstrap handoff and is deferred.

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/reference/setta-files.md`
- `docs/reference/urls-and-routes.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/routers/launcher_home.py`
- `backend/setta/launcher_workspace_store.py`
- `tests/routers/test_launcher_home_routes.py`
- `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx`

## Stage 1 Scope

Move these launcher-mode routes to Go:

- `GET /launcherRecentWorkspaces`
- `POST /addLauncherRecentWorkspace`
- `POST /removeLauncherRecentWorkspace`
- `POST /pinLauncherRecentWorkspace`
- `GET /launcherFilesystemRoots`
- `POST /listLauncherDirectory`

Keep the current launcher frontend payload contract for this slice.

## Explicit Non-Goals

Do not include:

- `POST /openLauncherWorkspace`
- launch intent creation
- `/launch`
- bootstrap token mint/consume behavior
- launcher-origin trust persistence
- IDE launcher management routes

## Behavioral Requirements

- launcher-mode only
- recent workspaces are stored under
  `<setta_home>/launcher/recent-workspaces.json`
- blank/omitted `setta_home` scope uses the backend default setta home
- allowed roots come from:
  - user home
  - `SETTA_LAUNCHER_ALLOWED_ROOTS` entries
- recent workspace loads must prune entries outside allowed roots and persist
  the pruned result
- add/remove/pin operations must accept nonexistent paths when the path still
  resolves within allowed roots
- directory listing must:
  - reject paths outside allowed roots
  - filter symlink escapes before entry cap/pagination is applied
  - sort directories before files, then case-insensitive name
  - support `cursor` pagination
  - report explicit truncation when the scan-budget limit is hit

## Proposed Go Ownership

- `internal/launcher`
  - allowed-root resolution
  - scoped recent-workspace store
  - directory-listing runtime

- `internal/httpapi`
  - thin launcher-home routes for this slice

- `internal/app`
  - launcher-mode route wiring

## Design Decisions

- treat the recent-workspaces JSON file as the source of truth
- use a real file lock for recent-workspace updates rather than a process-local
  mutex
- keep route-level error payloads in-band with `{ ok: false, error }` for this
  slice instead of remapping to generic HTTP error envelopes
- defer `openLauncherWorkspace` rather than smuggling launch/bootstrap behavior
  into this slice

## Recommended Next Step

Create and execute the next focused Phase 7 slice for
`POST /openLauncherWorkspace` plus the launcher executable/target contract it
depends on.

## Progress Notes

- 2026-03-08: created the focused launcher-home slice doc for recent
  workspaces and directory browsing, explicitly deferring
  `openLauncherWorkspace`.
- 2026-03-08: completed this slice by adding a Go-owned launcher home runtime
  in `internal/launcher/home.go`, thin launcher-mode transport in
  `internal/httpapi/launcher_home_routes.go`, and launcher-mode app wiring in
  `internal/app/app.go`.
- 2026-03-08: decision: keep recent-workspace errors in-band with `{ ok: false,
  error }`, keep the route cluster mounted only in launcher mode, and use a
  real file lock for `<setta_home>/launcher/recent-workspaces.json` updates.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/launcher -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestRegisterLauncherHomeRoutes' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppLauncherModeListsAndMutatesRecentWorkspacesOverHTTP' -count=1 -timeout 420s`
