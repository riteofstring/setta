# Phase 4 Listener Coverage Read Transport Closeout

## Purpose

This doc records the bounded Phase 4 follow-on after the landed listener
producer migration.

The goal of this slice was to close one remaining live frontend dependency in
the listener surface: `POST /getListenerCoverage` was still Python-owned even
though Go already owned listener websocket registration, share-session
scoping, and the canonical listener registry.

## Current Status

Completed before this slice:

- Phase 4 listener websocket transport and producer migration in
  `phase-4-listener-realtime-producer-migration.md`
- Go-owned listener registration, sequencing, and broadcaster ownership in
  `internal/realtime` and `internal/wsapi`
- Go-owned manual listener force-refresh transport in
  `internal/httpapi/listener_routes.go`

Current Go state after this slice:

- `internal/realtime/listener_coverage.go`
  - now owns listener coverage snapshot generation from the current registry
- `internal/realtime/listener_registry.go`
  - now exposes share-session-aware registration reads for a single project
- `internal/httpapi/listener_routes.go`
  - now owns `POST /getListenerCoverage`
- `internal/app`
  - now serves the listener coverage route through the real app stack

## Scope

This slice delivered:

- a Go-owned listener coverage snapshot builder over the current listener
  registry
- deterministic canonical-dependency decoding back into the structured
  dependency-key JSON shape the frontend already expects
- thin Go transport for `POST /getListenerCoverage`
- share-session-aware coverage reads in deployment/share mode
- focused realtime, route, and app-level coverage for the new route

## Non-Goals

- reintroducing the Python listener coverage tracker as a Go singleton
- broad listener websocket behavior changes beyond the current read route
- plugin worker/session migration follow-ons
- reopening force-refresh or listener producer transport work already landed

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-4-listener-realtime-producer-migration.md`
- `backend/setta/routers/listener.py`
- `backend/setta/websockets/listener_coverage.py`
- `tests/websockets/test_listener_coverage.py`
- `frontend/src/state/actions/listenerCoverage.ts`
- `internal/realtime/listener_registry.go`
- `internal/httpapi/listener_routes.go`
- `internal/app/websocket_test.go`

## Working Decisions

- keep the listener registry as the only source of truth for current coverage
  instead of introducing a second runtime owner
- build coverage snapshots on demand for the route
- preserve existing share-session matching semantics:
  - unscoped requests see all registrations for the project
  - share-scoped requests see both matching-session and shared registrations
- keep canonical listener dependency strings as the registry owner and decode
  them only at the route boundary when structured JSON is needed
- ignore `refresh_only` callbacks for coverage, matching the Python behavior

## Implementation Notes

1. Added a bounded coverage owner in `internal/realtime`.
   - `BuildListenerCoverageSnapshot(...)` now derives:
     - explicit dependency keys
     - realtime wildcard presence
   - dependency keys are returned in deterministic sorted order

2. Kept registry reads explicit.
   - `ListenerRegistry.RegistrationsForProject(...)` now returns the current
     project registrations with the same share-session matching rules used by
     listener delivery

3. Kept transport thin.
   - `POST /getListenerCoverage` now:
     - validates `projectConfigId`
     - resolves request share-session scope
     - asks the registry for registrations
     - serializes the Go-owned coverage snapshot

## Verification

- `./scripts/go.sh test ./internal/realtime -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Listener' -count=1`
- `./scripts/go.sh test ./internal/app -run '^TestAppServesListenerCoverageRoute$' -count=1`
- `./scripts/go.sh test ./... -run '^$'`

## Decisions Made

- treat listener coverage as a bounded live-read closeout on top of the
  already-landed listener registry/runtime ownership
- do not add a persistent coverage cache on the Go side just to mirror Python
  structure that the route does not need
- keep the current frontend JSON contract intact while moving the read owner to
  Go

## Progress Notes

- 2026-03-09: re-read the listener Python route and frontend caller after the
  Phase 14 closeout/dependency cleanup sequence.
- 2026-03-09: confirmed `frontend/src/state/actions/listenerCoverage.ts` still
  calls `POST /getListenerCoverage`, making it a real live caller-backed gap.
- 2026-03-09: landed Go-owned listener coverage snapshot generation and route
  transport over the existing listener registry/runtime boundary.

## Next Recommended Step

- treat the listener coverage live-read route as complete for the current
  listener surface
- if listener work continues, only reopen this area for:
  - a new live caller-backed listener route
  - broader plugin worker/session ownership from
    `phase-4-plugin-worker-session-owner.md`
