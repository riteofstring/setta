# Phase 2 Status And Meta Read Route Closeout

## Purpose

This doc records the bounded closeout slice for the remaining live
frontend-called status/meta reads that still depended on Python after the
listener coverage follow-on landed.

The rerank after the Phase 14 and listener closeouts found a small real caller
cluster that did not belong to agentic/runtime planning or dependency cleanup:

- `GET /backendInitStatus`
- `GET /authRefreshStatus`
- `GET /settaHomeInfo`

Those routes back:

- the app-shell backend-ready poll and worktree hint
- websocket auth-refresh window updates
- the IDE workspace switcher launcher-scope read

## Current Status

Completed before this slice:

- Phase 1 foundation routing with `GET /serverMode` and `GET /runtimeInfo`
- Phase 2 auth, mode-policy, and request-context foundations
- Phase 7 launcher and workspace-launch runtime ownership
- Phase 13 and Phase 14 agentic closeouts for the current bounded scope
- Phase 4 listener coverage read transport closeout

Current Go behavior after this slice:

- `internal/httpapi/status_routes.go`
  - now owns:
    - `GET /backendInitStatus`
    - `GET /authRefreshStatus`
    - `GET /settaHomeInfo`
- `internal/app/app.go`
  - now wires those routes from canonical config/auth metadata
- `internal/devworktree`
  - now owns the bounded active-dev-worktree naming helper used by the status
    payload

## Scope

This slice delivered:

- thin Go transport for the three live status/meta reads
- a bounded active dev worktree-name helper for the existing frontend badge
- focused route and app coverage for the new reads
- route-name inventory updates so these Go-owned routes are no longer invisible
  in later caller reranks

## Non-Goals

- `POST /loadSettings`
- broad settings-state transport design
- recreating Python's mutable initialization tracker as a long-lived Go owner
- launcher management/write behavior
- any frontend-generated type or route-shape changes

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-1-foundation-runtime.md`
- `docs/plans/go-backend-rewrite/phase-2-auth-modes-request-context.md`
- `backend/setta/routers/status.py`
- `backend/setta/utils/init_status.py`
- `backend/setta/utils/worktree.py`
- `tests/routers/test_setta_home_info_route.py`
- `tests/routers/test_settings_mode_guard.py`
- `frontend/src/components/Pages/GlobalWrapper.tsx`
- `frontend/src/components/AppHeader/WorktreeHint.tsx`
- `frontend/src/components/Modals/WorkspaceSwitcherModal/WorkspaceSwitcherModal.tsx`
- `frontend/src/state/actions/websocketReceive.ts`
- `internal/httpapi/httpapi.go`
- `internal/app/app.go`

## Working Decisions

- keep transport thin over existing Go-owned config/auth state instead of
  opening a new runtime subsystem
- keep `GET /settaHomeInfo` IDE-only because its concrete caller is the IDE
  workspace switcher
- treat `GET /backendInitStatus` as a Go-ready snapshot once the Go server is
  serving requests, instead of recreating Python's pre-listen mutable event
  tracker
- keep the worktree badge contract stable by mirroring Python's `setta` /
  `setta.<name>` naming rule in a bounded helper
- do not fold `POST /loadSettings` into this slice because Go still lacks a
  dedicated `SettingsState` source-of-truth owner and should not fake one from
  the settings project document heuristically

## Implementation Notes

1. Added thin status/meta routes in `internal/httpapi`.
   - `GET /backendInitStatus` now returns:
     - one stable ready event
     - `isReady=true`
     - the auth-cookie refresh window
     - the active dev worktree name when resolvable
   - `GET /authRefreshStatus` now returns the auth-cookie refresh window
   - `GET /settaHomeInfo` now returns the active Setta-home and setta-files
     scope metadata from the canonical Go config

2. Reused existing Go auth/config state.
   - refresh-window seconds come from `internal/auth.Service`
   - Setta-home and active files-root metadata come from the canonical loaded
     `config.Config`

3. Kept worktree naming explicit and bounded.
   - the new helper resolves the git toplevel from the source tree or cwd
   - it preserves the existing frontend badge naming convention without
     broadening into a generic repo-status subsystem

## Verification

- `./scripts/go.sh test ./internal/devworktree -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Status|Foundation' -count=1`
- `./scripts/go.sh test ./internal/app -run 'StatusMeta|FoundationRoutes' -count=1`

## Decisions Made

- close the three live status/meta reads now because they have concrete
  frontend callers and require no new product decision
- keep `loadSettings` out of this slice and explicitly defer it until there is
  a real Go-owned `SettingsState` transport owner
- leave the existing `GET /serverMode` Phase 1 route intact instead of
  reopening route-shape consolidation

## Progress Notes

- 2026-03-09: reranked remaining live frontend callers after the listener
  coverage closeout instead of continuing blind dependency cleanup.
- 2026-03-09: confirmed that `GET /serverMode` was already Go-owned, but
  `backendInitStatus`, `authRefreshStatus`, and `settaHomeInfo` still pointed
  at Python despite active frontend callers.
- 2026-03-09: landed the Go-owned status/meta routes and the bounded worktree
  helper.

## Next Recommended Step

- treat the live status/meta read cluster as complete for the current bounded
  scope
- if this area is reopened next, the honest follow-on is `POST /loadSettings`
  only after a dedicated doc decides the Go-owned `SettingsState`
  source-of-truth boundary
- that follow-on is now tracked in
  `phase-3-settings-state-owner-and-transport.md`
