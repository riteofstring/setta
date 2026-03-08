# Phase 7 Launch Intent, Local Launch, And Bootstrap Handoff

## Purpose

This doc scopes the next bounded Phase 7 slice after the completed launcher
management and artifact ownership work.

The goal is to move the local launcher handoff path to Go without mixing in the
remaining SSH/remote launch behavior on the same landing.

## Current Status

As of 2026-03-08:

- Go owns:
  - launcher-mode home/runtime browser routes
  - `POST /openLauncherWorkspace`
  - `POST /createWorkspaceLaunchIntent`
  - bootstrap HTML at `GET /__setta__/bootstrap`
  - bootstrap token consumption at `POST /__setta__/bootstrap/consume`
  - launch-intent storage and return-url validation/runtime ownership
  - launcher-origin trust storage plus proof validation for bootstrap consume
  - bootstrap-page parity for:
    - workspace-history handoff hash storage
    - launcher-origin storage and proof handoff
    - open-workspace-switcher redirect hints
  - launcher management/status plus managed artifact ownership
- Python still owns:
  - `POST /launch`
  - launcher-origin trust persistence and rollback behavior around launched
    workspaces
  - SSH/remote launch and remote rollback behavior
  - launcher-mode CORS/trusted-origin behavior around `/launch`

## Inputs

- `docs/plans/go-backend-rewrite/phase-7-launcher-management-and-bootstrap-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-runtime-surface-inventory.md`
- `docs/plans/go-backend-rewrite/phase-7-launcher-open-workspace-and-bootstrap-contract.md`
- `docs/reference/auth-and-sessions.md`
- `docs/reference/urls-and-routes.md`
- `backend/setta/routers/launch.py`
- `backend/setta/routers/bootstrap.py`
- `tests/routers/test_launch_routes.py`
- `tests/auth/test_auth_bootstrap_integration.py`
- `tests/auth/test_cors.py`
- `frontend/src/components/Pages/Launch/WorkspaceLaunchPage.tsx`
- `frontend/src/components/Pages/Launcher/LauncherHomePage.tsx`
- `frontend/src/utils/launcherOrigin.ts`

## Scope

This slice should move the local launcher handoff path only:

- add a Go-owned launch-intent store and `POST /createWorkspaceLaunchIntent`
- add a Go-owned local `POST /launch` path that:
  - consumes a stored launch intent
  - launches or reuses a local IDE session
  - mints the bootstrap token URL fragment
  - appends launcher-origin handoff proof when the launcher origin is known
  - persists trust for the launched workspace origin
  - rolls back newly started local sessions when trust persistence fails
- extend the Go bootstrap page and consume route so the local handoff is fully
  consumable by the existing frontend:
  - workspace-history handoff hash storage
  - launcher-origin proof handoff
  - verified launcher-origin persistence from consume responses
  - open-workspace-switcher redirect hints
- keep transport thin and put intent/trust/rollback semantics in dedicated Go
  runtime packages

## Explicit Non-Goals

Do not include:

- SSH/remote workspace launch
- remote rollback behavior
- `setta connect` or other SSH helpers
- launcher management/status routes
- launcher-mode home/directory-browser routes
- deployment/share/app runtime work

## Working Decisions

- split local launch/bootstrap handoff from SSH remote launch instead of
  dragging `sshTarget` and remote rollback into the same landing
- treat the launch-intent store as a dedicated runtime owner, not ad-hoc route
  state
- keep launcher-origin trust explicit and source-of-truth driven:
  verified origin proof plus trusted-origin store, no heuristic origin fallback
- reuse the completed Go local session/runtime owners instead of rebuilding
  launch/session discovery inside handlers
- bootstrap page parity is part of this slice, because `/launch` is not
  actually consumable without the hash/storage behavior the frontend expects

## Recommended Landing Order

1. launch-intent store + `POST /createWorkspaceLaunchIntent`
2. bootstrap page/consume parity for launcher-origin and workspace-history
   handoff
3. local `POST /launch` with trust persistence and local rollback
4. focused tests for launch routes, bootstrap integration, and launcher-mode
   CORS behavior
5. later follow-up slice for SSH/remote launch parity

## Progress Notes

- 2026-03-08: created this focused Phase 7 doc after completing launcher
  management and confirming that the remaining launcher gap is now the
  local launch/bootstrap handoff cluster, with SSH remote launch still large
  enough to keep separate.
- 2026-03-08: completed Stage 1 from this doc by adding the Go-owned
  launch-intent runtime in `internal/workspacelaunch`, the trusted
  frontend-origin runtime in `internal/frontendorigins`,
  `POST /createWorkspaceLaunchIntent` in
  `internal/httpapi/workspace_launch_routes.go`, and bootstrap consume/page
  parity in `internal/httpapi/httpapi.go` and
  `internal/httpapi/bootstrap_page.go`.

## Recommended Next Step

Implement Stage 2 from this doc: a Go-owned local `POST /launch` path that
consumes stored launch intents, reuses the completed local IDE session owner,
appends launcher-origin handoff proof when needed, and rolls back newly
started local sessions if trust persistence fails.

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/frontendorigins ./internal/workspacelaunch -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEModeCreatesWorkspaceLaunchIntentsOverHTTP' -count=1 -timeout 420s`
