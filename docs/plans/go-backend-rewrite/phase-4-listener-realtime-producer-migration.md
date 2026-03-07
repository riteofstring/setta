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
- Go now also owns draw/artifact binary listener delta emission from Go-owned
  run paths under:
  - `internal/realtime/listener_producer.go`
  - `internal/runs/service.go`
  - `internal/app/app.go`
- the remaining producer-side listener realtime gap is now:
  - plugin-worker `host.emit_listener_dependency_event`
- Python reference behavior for this area still lives under:
  - `backend/setta/routers/project_manager.py`
  - `backend/setta/websockets/msg_handlers/frontend_receiver.py`
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

- artifact/image binary listener deltas
- plugin-emitted listener dependency events

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

- complete

Completed:

- added Go-owned frontend websocket ingress for:
  - `RealtimeUIChange`
  - `RealtimeDependencyEvent`
- introduced `internal/realtime.ListenerProducer` so project and
  share-session validation stays out of `internal/wsapi`
- added canonical dependency-key projection from structured frontend keys into
  Go listener dependency strings
- added explicit binary frame encode/decode support plus listener binary send
  paths in `internal/realtime`
- preserved shared sequence semantics across realtime deltas and dependency
  events inside the Go broadcaster
- added wsapi decoder coverage for text and binary frontend listener messages
- added websocket integration coverage for:
  - listener delivery of frontend-originated realtime UI changes
  - listener delivery of frontend-originated dependency events
  - project/session close behavior for invalid producer inputs

Working decisions captured while landing Slice 2:

- keep frontend websocket routes thin by decoding transport envelopes in
  `internal/wsapi` and pushing project-aware producer semantics into
  `internal/realtime.ListenerProducer`
- preserve raw websocket binary frames for listener-facing binary deltas and
  dependency events while Go still owns both transport ends
- treat structured frontend dependency keys as transport input only; canonical
  listener dependency strings remain the broadcaster source of truth

Tests:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime -run '^(TestBinaryFrameRoundTrip|TestCanonicalDependencyKeyConvertsSectionAndSectionParam|TestCanonicalDependencyKeyRejectsMissingRequiredFields|TestDependencyValueIsBinary)$' -count=1`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/wsapi -run '^TestDecodeFrontend' -count=1`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run '^$' -count=1`

### Slice 3: Artifact/Image Binary Listener Deltas

Deliver:

- a Go producer boundary for image/draw artifact listener updates
- explicit binary payload loading and dispatch into listener realtime messages
- coverage for share-session-scoped binary delta fan-out

Acceptance:

- image-backed listener updates no longer depend on the Python artifact manager
- binary payload transport is explicit and testable from the Go runtime

Status:

- complete

Completed:

- added a Go-owned binary section-delta producer under:
  - `internal/realtime/listener_producer.go`
- wired Go draw snapshot application through that producer under:
  - `internal/runs/service.go`
  - `internal/app/app.go`
- kept binary dependency shaping explicit:
  - canonical listener dependency keys remain the section ids
  - listener delta values use a Go-owned `{"type":"Binary","payload":...}`
    envelope backed by `internal/binary.ContentRef`
  - raw binary websocket frames remain the transport for listener binary bytes
- reused the existing draw-snapshot payload bytes already loaded by the Go
  run service instead of re-reading or inventing artifact-manager shims
- added focused coverage for:
  - deployment/share-session-scoped binary delta fan-out in
    `internal/realtime/listener_producer_test.go`
  - end-to-end IDE `runCode` draw-snapshot listener delivery in
    `internal/app/websocket_test.go`

Working decisions captured while landing Slice 3:

- keep artifact binary producer semantics in `internal/realtime.ListenerProducer`
  so project/session validation stays with the other producer boundaries
- let Go-owned run/project-state paths supply the already-read binary payload
  bytes into the producer instead of adding a second artifact runtime layer
- preserve raw websocket binary frames for listener binary deltas while Go owns
  both ends of the listener transport

Tests:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/runs ./internal/app -count=1`

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

- whether binary listener delta transport should reuse raw websocket binary
  frames or move to explicit content refs once Go owns both sides
- whether plugin-emitted listener dependency events stay in Phase 4 or wait for
  the first Go-owned plugin runtime boundary

## Next Recommended Step

- Start Slice 4: plugin listener dependency events.
- Keep the slice narrow: add only the first Go-owned plugin host boundary
  needed to emit listener dependency events directly through
  `internal/realtime.ListenerBroadcaster`, without widening Phase 4 into
  general plugin-runtime migration.
