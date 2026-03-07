# Phase 4 Listener Realtime Producer Migration

## Purpose

This doc narrows the remaining Phase 4 realtime work to the producer
boundaries that still emit listener-facing force-refresh, delta, and action
events from Python.

Go already owns listener websocket transport, registration, sequencing, and
fan-out. The remaining gap is getting concrete producer entry points onto that
Go-owned broadcaster without rebuilding the old Python sender/receiver split.

## Status

Current repo status as of 2026-03-06:

- Go already owns listener delivery primitives under:
  - `internal/realtime`
  - `internal/wsapi`
  - `internal/app`
- Go now also owns manual listener force-refresh transport under:
  - `internal/httpapi/listener_routes.go`
  - `internal/app/app.go`
  - `internal/projectview`
- the remaining producer-side listener realtime gaps are now:
  - frontend websocket-originated `RealtimeUIChange`
  - frontend websocket-originated `RealtimeDependencyEvent`
  - project-state artifact/image binary delta emission
  - plugin-worker `host.emit_listener_dependency_event`
- Python reference behavior for this area still lives under:
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/websockets/msg_handlers/frontend_receiver.py`
  - `backend/setta/project_state/artifacts.py`
  - `backend/setta/plugins/manager.py`
- route-local compatibility shims or a revived Python-shaped
  sender/receiver split would be a dead end

## Scope

This focused plan covers:

- migrating concrete listener-facing producer boundaries into Go
- keeping producer handlers thin and explicitly mode-aware
- using `internal/projectview` as the source of truth for
  `ProjectStateSingleConfig`-shaped force-refresh payloads
- keeping binary listener payload delivery explicit instead of heuristic

## Non-Goals

- broad frontend websocket message migration beyond listener-realtime inputs
- plugin runtime migration beyond the producer boundary needed for listener
  events
- reintroducing Python `WMHFrontendReceiver` or `WMHPythonScriptSender`
  architecture in Go
- widening Phase 4 into general project mutation transport

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `docs/reference/setta-realtime-behavior.md`
- `backend/setta/routers/project_manager.py`
- `backend/setta/websockets/msg_handlers/frontend_receiver.py`
- `backend/setta/project_state/artifacts.py`
- `backend/setta/plugins/manager.py`
- `tests/routers/test_project_manager_force_refresh.py`
- `tests/websockets/test_realtime_event_hub.py`
- `tests/websockets/test_realtime_event_hub_sessions.py`
- `tests/websockets/test_action_event_dispatch.py`
- `tests/websockets/test_python_script_receiver.py`
- `tests/websockets/test_python_script_sender_share_sessions.py`
- `frontend/src/state/actions/listeners.ts`

## Dependency Finding

Current inspection shows the next missing work is not new websocket plumbing or
new sequence machinery. Go already owns those boundaries.

The remaining producer candidates are:

- manual listener force refresh from HTTP
- frontend websocket-originated listener deltas and dependency events
- artifact/image binary listener deltas
- plugin-emitted listener dependency events

The smallest useful slice is manual listener force refresh because it:

- already has a user-facing trigger in `frontend/src/state/actions/listeners.ts`
- is bounded to one route and one broadcaster call
- can reuse `internal/projectview` immediately for snapshot payload shaping
- exercises bootstrapped listener targeting and sequence reset without dragging
  in broader frontend mutation transport or binary payload streaming

## Working Decisions

- keep `internal/realtime.ListenerBroadcaster` as the only listener delivery
  boundary
- use `internal/projectview.SingleConfig` marshaled directly for listener
  force-refresh payloads instead of inventing a second snapshot serializer
- make every producer pass explicit `projectId` and `shareSessionId`
  boundaries into the broadcaster
- keep artifact/image and plugin producers in later slices so each can land on
  its own source-of-truth runtime boundary

## Implementation Slices

### Slice 1: Manual Listener Force Refresh Route

Deliver:

- Go `POST /api/forceRefreshListener`
- mode-aware snapshot loading:
  - main project runtime in IDE mode
  - session-overlay snapshot in deployment mode
- `internal/projectview` projection to the listener force-refresh payload
- dispatch through `internal/realtime.ListenerBroadcaster`
- focused HTTP + app integration tests

Acceptance:

- manual listener refresh reaches bootstrapped listener sockets from Go
- share-session-scoped refreshes fan out only within their deployment session
- sequence resets use Go-owned broadcaster semantics even when no listeners are
  connected
- no Python route or sender is required for this path

Status:

- complete

Completed:

- added `internal/httpapi/listener_routes.go`
- registered the route from `internal/app/app.go`
- projected runtime snapshots through `internal/projectview.SingleConfig`
  before sending `ListenerForceRefresh`
- covered the new producer boundary with:
  - HTTP route tests for unknown project and missing deployment session
  - app-level websocket integration for live force-refresh delivery to a
    bootstrapped listener socket

Tests:

- `./scripts/go.sh test ./internal/httpapi ./internal/app -count=1`

### Slice 2: Frontend Websocket Listener Event Ingress

Deliver:

- Go handling for listener-facing frontend websocket producer messages:
  - `RealtimeUIChange`
  - `RealtimeDependencyEvent`
- explicit validation of project scope and deployment share-session scope
- direct dispatch into `internal/realtime.ListenerBroadcaster`

Acceptance:

- frontend-originated listener deltas and action events no longer require the
  Python frontend receiver path
- dependency-event and realtime-delta sequencing stays shared per
  `(project id, share session id)`
- invalid project/session inputs fail at the Go transport boundary instead of
  silently falling back

Status:

- pending

### Slice 3: Artifact/Image Binary Listener Deltas

Deliver:

- a Go producer boundary for image/draw artifact listener updates
- explicit binary payload loading and dispatch into listener realtime messages
- coverage for share-session-scoped binary delta fan-out

Acceptance:

- image-backed listener updates no longer depend on the Python artifact manager
- binary payload transport is explicit and testable from the Go runtime

Status:

- pending

### Slice 4: Plugin Listener Dependency Events

Deliver:

- a Go-owned boundary for plugin-emitted listener dependency events once the
  calling surface exists on the Go side
- share-session validation and direct dispatch into the listener broadcaster

Acceptance:

- plugin-side listener action events do not depend on the Python realtime hub
- the producer boundary stays isolated from broader plugin runtime migration

Status:

- pending

## Open Questions

- whether frontend websocket listener-event ingress should land before any
  broader Go project-mutation transport work
- whether binary listener delta transport should reuse raw websocket binary
  frames or move to explicit content refs once Go owns both sides
- whether plugin-emitted listener dependency events stay in Phase 4 or wait for
  the first Go-owned plugin runtime boundary

## Next Recommended Step

- Start Slice 2: frontend websocket listener-event ingress.
- Keep the slice narrow: migrate only the listener-facing `RealtimeUIChange`
  and `RealtimeDependencyEvent` producer path onto Go, reusing current
  share-session validation and broadcaster sequencing.
