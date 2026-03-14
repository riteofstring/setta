# Phase 4 Deployment Session Transport And Cleanup

## Purpose

This doc narrows the next Phase 4 work to the remaining deployment session
transport that the frontend still needs after Go-owned deployment `runCode`:

- create or reuse a deployment share/app session over HTTP
- load deployment state and alternate project configs from the session overlay
- clean up expired deployment sessions from the Go runtime

The goal is to move share/app session bootstrap and teardown onto explicit
Go-owned runtime boundaries instead of leaving Python to create deployment
sessions and own their expiry behavior.

## Status

Current repo status as of 2026-03-06:

- Go already owns deployment runtime foundations under `internal/deployments`:
  - deployment manifest + policy loading
  - base deployment project runtime
  - per-session overlay runtimes
  - share-session existence/touch semantics
  - per-session run-count reservation and rollback
- Go startup already wires deployment mode through:
  - `internal/config`
  - `cmd/setta-server`
  - `internal/app`
  - `internal/wsapi`
- Go already owns deployment `POST /api/runCode` with:
  - deployment policy enforcement
  - overlay-backed planning
  - `share_runs/<shareSessionId>` snapshot roots
  - backend-owned terminal dispatch for input-disabled deployment terminals
- Go now owns current deployment-session bootstrap under:
  - `internal/httpapi/deployment_routes.go`
  - `internal/app/app.go`
  - `internal/deployments.GetOrCreateSession`
  - live incoming `shareSessionId` reuse when the session still exists
  - automatic replacement with a new session when the incoming id is stale
- Go now owns deployment session expiry cleanup under:
  - `internal/app/deployment_cleanup.go`
  - `internal/deployments.CleanupExpiredSessions`
  - `internal/terminals.DeleteShareSession`
  - `internal/realtime.ListenerBroadcaster.DropShareSession`
- Go now also owns deployment state/project-config routes under:
  - `internal/httpapi/deployment_routes.go`
  - session-overlay-backed share/app state loads
  - deployment-relative app-spec loading for app mode wrappers
- frontend verification for those Go-owned routes is now complete in the
  focused follow-up doc:
  - `docs/plans/go-backend-rewrite/archive/phase-4-deployment-state-routes-and-projectstate-transport.md`
  - all four slices there are now complete, including the frontend transport
    alignment work for explicit Go error envelopes

## Scope

This focused plan covers:

- Go-owned deployment session bootstrap routes for active share/app deployments
- Go-owned deployment state/project-config routes backed by session overlays
- runtime cleanup for expired deployment sessions
- app/runtime wiring so cleanup owns terminal + realtime teardown

## Non-Goals

- deployment publish/list/latest route migration
- listener runtime migration in deployment mode
- deployment terminal websocket transport
- parameter-edit policy routes
- preserving Python response shapes beyond the frontend fields that are still in
  use

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-4-realtime-and-terminal-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-terminal-run-code-migration.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-deployment-run-code-policy-and-session-overlays.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `backend/setta/routers/share_deployments.py`
- `backend/setta/routers/app_deployments.py`
- `backend/setta/deployments/router_utils.py`
- `backend/setta/share/session_store.py`
- `backend/setta/server_state.py`
- `tests/routers/test_share_sessions.py`
- `tests/routers/test_app_sessions.py`
- `tests/share/test_session_cleanup.py`
- `frontend/src/state/actions/share.ts`
- `frontend/src/state/actions/app.ts`

## Working Decisions

- keep deployment HTTP transport thin
  - handlers decode route params and call explicit deployment/runtime helpers
  - session creation, lookup, and expiry rules stay in `internal/deployments`
- keep current-deployment bootstrap idempotent
  - if the caller sends a live `shareSessionId`, touch and reuse it
  - otherwise create a new session and overlay
- use the active deployment root as the only source of truth in deployment mode
  - do not broaden this slice into disk discovery for arbitrary deployments
- return only the fields the current frontend consumes
  - deployment name/version
  - share session id
  - session run count
  - default project config id
  - project metadata
  - share/app policy
  - manifest when cheaply available
- keep share and app transport separate at the handler layer
  - the response bodies differ
  - the underlying session/runtime helper can still be shared
- make session cleanup explicit and centralized
  - expired session teardown should remove overlay state, PTYs, and realtime
    sequence state from one Go-owned background task
- do not fake deployment state/project-config routes from the minimal Go
  project-state document
  - the next route wave should wait for a real frontend-facing project-state
    transport boundary

## Implementation Slices

### Slice 1: Deployment Session Runtime Helpers

Deliver:

- deployment runtime helpers for:
  - get-or-create session from request-provided id
  - session expiry scanning
  - deleting expired session overlays
- tests covering idempotent reuse, session expiry, and cleanup results

Acceptance:

- a live deployment session id is reused instead of replaced
- expired sessions are identified from runtime-owned last-seen timestamps
- deleting an expired session removes both overlay state and run-count state

Status:

- complete

Completed:

- added deployment-runtime helpers for:
  - idempotent session reuse from an incoming `shareSessionId`
  - session TTL ownership inside `internal/deployments`
  - explicit expired-session cleanup returning deleted session ids

Tests:

- `./scripts/go.sh test -p 1 ./internal/deployments ./internal/realtime ./internal/httpapi ./internal/app -count=1`

### Slice 2: Current Session Bootstrap Routes

Deliver:

- Go HTTP routes for:
  - current deployment session bootstrap in share mode
  - current deployment session bootstrap in app mode
- route tests covering:
  - session creation
  - session reuse when the header already carries a live id
  - stale incoming session replacement
  - app response shaping

Acceptance:

- the frontend can request a current deployment session from Go without Python
- share and app bootstrap responses expose the deployment metadata the existing
  frontend bootstrap code consumes

Status:

- complete

Completed:

- added:
  - `POST /api/share/deployments/current/session`
  - `POST /api/app/deployments/current/session`
- kept the transport thin:
  - handlers only resolve the incoming session id and serialize deployment
    runtime metadata
  - `internal/deployments` owns whether to reuse or create the session

Tests:

- `./scripts/go.sh test -p 1 ./internal/deployments ./internal/realtime ./internal/httpapi ./internal/app -count=1`

### Slice 3: Deployment State And Project-Config Routes

Deliver:

- Go HTTP routes for:
  - share deployment state + project-config fetch
  - app deployment state + project-config fetch
- a frontend-facing project-state transport boundary that can answer those
  routes from a real Go source of truth

Acceptance:

- state loads resolve from the session overlay, not from a synthetic route-only
  adapter
- app mode can return `appDefinition` and `appSpec` from Go-owned deployment
  state transport

Status:

- moved into
  `docs/plans/go-backend-rewrite/archive/phase-4-deployment-state-routes-and-projectstate-transport.md`

Blocked Because:

- current Go `internal/projectstate.Document` is intentionally small and only
  models the pieces needed for runtime ownership and run planning
- the Python deployment state routes return a much larger frontend-facing
  project-state payload that Go does not own yet
- adding route-local compatibility shims here would violate the rewrite goal of
  explicit source-of-truth boundaries

### Slice 4: Cleanup Wiring

Deliver:

- app/runtime background cleanup loop for deployment sessions
- cleanup hooks for:
  - `internal/deployments`
  - `internal/terminals`
  - realtime sequence teardown
- app-level tests proving expired sessions are removed and matching terminal
  sessions are dropped

Acceptance:

- expired deployment sessions stop showing up in the share-session store
- expired session PTYs are terminated
- expired session realtime sequences are dropped

Status:

- complete

Completed:

- added a deployment-session cleanup loop under `internal/app`
- cleanup now:
  - deletes expired deployment sessions from `internal/deployments`
  - terminates matching PTYs through `internal/terminals`
  - drops matching listener registry + realtime sequence state through
    `internal/realtime`

Tests:

- `./scripts/go.sh test -p 1 ./internal/deployments ./internal/realtime ./internal/httpapi ./internal/app -count=1`

## Next Recommended Step

- This focused deployment-session transport doc is complete.
- Return to
  `docs/plans/go-backend-rewrite/archive/phase-4-realtime-and-terminal-runtime.md`
  for the next bounded Phase 4 follow-up outside deployment session/state
  transport.
