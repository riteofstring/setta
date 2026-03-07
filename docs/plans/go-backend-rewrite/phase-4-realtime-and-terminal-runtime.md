# Phase 4: Realtime And Terminal Runtime

## Purpose

Phase 4 establishes the first Go-owned realtime and terminal runtime layers:
connection ownership, subscription scoping, snapshot/delta broadcast semantics,
and PTY-backed terminal session management.

Focused transport follow-up work is tracked in
`docs/plans/go-backend-rewrite/phase-4-terminal-transport-migration.md`.
Remaining run-code follow-up work is tracked in
`docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`.

This phase should rebuild the product semantics described by the Python docs and
tests without copying the Python websocket manager or terminal manager shapes.
Transport libraries should stay thin around explicit Go-owned service
boundaries.

## Status

Current repo status as of 2026-03-06:

- Phase 1 foundation runtime is in place
- Phase 2 auth, mode policy, request context, and websocket auth entry points are in place
- Phase 3 project-state persistence, runtime ownership, registry wiring, and deployment overlays are in place
- websocket transport entry/auth exists in Go under `internal/wsapi`
- the Go rewrite now includes `internal/realtime` with:
  - a transport-independent connection registry
  - server-owned frontend affinity tokens
  - sanitized current-address tracking
  - deterministic per-project/per-share-session sequence tracking
  - a websocket hub with live connection ownership
  - JSON send/broadcast helpers
  - frontend identity and connection-inventory messages
  - a listener registry with bootstrap and dependency subscriptions
  - listener realtime delta and force-refresh broadcasters
- websocket route lifecycle wiring now exists in Go under:
  - `internal/wsapi/routes.go`
  - `internal/app/app.go`
- listener registration and listener-side dependency/action fan-out now exist in Go under:
  - `internal/realtime/listener_broadcaster.go`
  - `internal/wsapi/routes.go`
- the Go rewrite now includes `internal/terminals` with:
  - PTY-backed terminal session ownership
  - session-scoped create/list/delete operations
  - attach/read/write/resize hooks
  - buffered output history for reconnect/reattach
  - explicit per-session input policy for deployment-mode restrictions
- websocket terminal transport now exists in Go under:
  - `internal/wsapi/routes.go`
  - `internal/app/app.go`
- terminal delete and interrupt HTTP transport now exist in Go under:
  - `internal/httpapi/terminal_routes.go`
  - `internal/app/app.go`
- binary upload HTTP transport now exists in Go under:
  - `internal/httpapi/binary_routes.go`
  - `internal/app/app.go`
- run-code migration groundwork now exists in Go under:
  - `internal/projectstate`
  - `internal/runs`
  - `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- the Go rewrite now includes the first IDE manual-run planner under:
  - `internal/runs/planner.go`
  - manual Python/Bash code-section command planning
  - direct-file run commands plus snapshot planning for `never`, `ephemeral`, and `always`
  - section-variant overrides applied against cloned project-state documents
  - explicit rejection of `paramOverrides` until Go owns parameter state
- the Go rewrite now includes the first IDE `runCode` transport under:
  - `internal/httpapi/terminal_routes.go`
  - `internal/runs/service.go`
  - `internal/app/app.go`
- current Go `runCode` transport behavior is intentionally narrow:
  - manual Python/Bash code-section runs only
  - attached-terminal reuse and ensure flow through Go project-state + terminal services
  - IDE draw snapshot uploads and project-state artifact updates now flow through Go-owned binary + run services
  - `cliId` and HTTP override payloads still fail explicitly
- `internal/app` now owns the terminal service lifecycle alongside runtime, project state, and realtime wiring
- producer-side realtime event sources and terminal run HTTP routes still live only in Python across:
  - `backend/setta/websockets/realtime_event_hub.py`
  - `backend/setta/websockets/websocket_manager.py`
  - `backend/setta/routers/terminals.py`
  - `backend/setta/routers/websocket.py`

## Scope

This phase should deliver:

- a Go-owned realtime connection registry
- explicit project/session subscription scoping
- deterministic snapshot + delta sequencing
- force-refresh sequence reset behavior
- websocket delivery wiring on top of the realtime registry
- PTY-backed terminal sessions with attach/detach/history behavior

## Non-Goals

- preserving Python websocket route shapes or message unions as a compatibility contract
- rebuilding the listener code generator or dependency graph in this phase
- broad route migration outside websocket and terminal surfaces
- Windows PTY signoff before macOS and Linux behavior is stable
- reproducing Python singleton/global-manager architecture

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-2-auth-modes-request-context.md`
- `docs/plans/go-backend-rewrite/phase-3-project-state-core.md`
- `docs/plans/go-backend-rewrite/testing-strategy.md`
- `docs/plans/go-backend-rewrite/spike-pty.md`
- `docs/reference/setta-realtime-behavior.md`
- `docs/reference/sharing-mode-vs-ide-mode.md`
- `docs/reference/auth-and-sessions.md`
- `backend/setta/websockets/realtime_event_hub.py`
- `backend/setta/websockets/websocket_manager.py`
- `backend/setta/routers/websocket.py`
- `backend/setta/routers/terminals.py`
- `tests/websockets/test_realtime_event_hub.py`
- `tests/websockets/test_realtime_event_hub_sessions.py`
- `tests/websockets/test_websocket_manager_sessions.py`
- `tests/terminals`

## Phase 4 Working Decisions

- build a transport-independent realtime core first, then attach websocket I/O
- keep connection registry ownership separate from message encoding and socket I/O
- scope realtime sequence tracking by `(project id, share session id)` from the start
- treat deployment/share-session fan-out as a first-class boundary, not a late filter
- keep frontend affinity tokens server-owned and session-scoped
- use explicit conjunction-based selection filters instead of Python's older implicit broadcast matching rules
- use a minimal websocket envelope with `messageType` + `content` for Go-owned frontend-facing runtime messages
- connection inventory broadcasts include live registered connections only; do not synthesize a fake server/main entry
- defer listener-specific dependency filtering until the registry and broadcast model are settled
- treat PTY lifecycle as its own service boundary under `internal/terminals`
- prefer temp-dir and real-subprocess tests over heavy mocking

## Package Direction

The expected Phase 4 package set is:

- `internal/realtime`
  - connection registry
  - sequence hub
  - subscription targeting helpers
  - later snapshot/delta broadcaster
- `internal/wsapi`
  - websocket accept/auth
  - thin bridge from websocket transport to realtime services
- `internal/terminals`
  - PTY creation
  - session ownership
  - attach/read/write/resize/close operations

Later handlers should depend on the realtime and terminal services, not on raw
websocket maps or process globals.

## Reference Behaviors To Preserve Conceptually

These are the useful product semantics from the Python codebase, not a demand to
copy the implementation shape:

- realtime sequences increment per project and per share session
- force refresh resets the sequence so the next delta starts at `1`
- deployment/share-session sockets only receive events for their own session
- frontend affinity tokens are generated server-side and rebound on reconnect
- current-address broadcasts redact the frontend affinity marker
- websocket broadcasts fan out concurrently across selected targets
- terminal sessions are scoped to the correct runtime/share-session boundary
- terminal attach/detach should preserve buffered output/history semantics

## Implementation Slices

### Slice 1: Realtime Registry And Sequencing Core

Deliver:

- `internal/realtime` package
- connection metadata registry independent from websocket transport
- frontend affinity token ownership and resolution
- sanitized current-address tracking
- per-project/per-share-session sequence tracking
- session/type target selection helpers for later websocket fan-out

Acceptance:

- frontend affinity tokens are server-owned and cleaned up on disconnect
- affinity lookup never crosses share-session boundaries
- current-address updates strip the affinity marker before storage/broadcast
- sequence counters are deterministic per `(project id, share session id)`
- force refresh and share-session teardown can reset the relevant sequences

Status:

- complete

Completed:

- added `internal/realtime/registry.go`
- added `internal/realtime/sequencer.go`
- introduced a transport-independent connection registry with:
  - explicit connection metadata
  - register/unregister lifecycle
  - deterministic filtered snapshots for later fan-out code
- made frontend affinity ownership explicit:
  - tokens are minted only by the server
  - lookup is share-session-aware
  - disconnect removes stale affinity mappings
- made current-address handling explicit:
  - the `#setta-ws-affinity=` marker is stripped before storage
  - client-provided affinity markers never rebind server-owned tokens
- added a dedicated sequence core:
  - scopes are `(project id, share session id)`
  - each scope increments independently
  - force-refresh/session-teardown style resets are explicit through `Reset` and `DropShareSession`

Tests:

- focused coverage in:
  - `internal/realtime/registry_test.go`
  - `internal/realtime/sequencer_test.go`
- verified behaviors include:
  - server-owned affinity token assignment and reconnect rebinding
  - share-session-scoped affinity resolution
  - current-address sanitation
  - deterministic selection filters
  - per-scope sequence increment/reset/drop behavior
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- websocket send/broadcast ownership
- listener-facing snapshot/delta message fan-out
- terminal session lifecycle and PTY attachment

### Slice 2: Websocket Transport Bridge

Deliver:

- websocket connection runtime on top of the registry
- thin send/broadcast helpers with explicit target selection
- connection lifecycle hooks from `internal/wsapi`
- basic connection inventory broadcast for frontend consumers

Acceptance:

- websocket delivery is keyed by registered realtime connection ids
- closed sockets are removed from the runtime cleanly
- session-targeted and type-targeted fan-out behavior is covered by Go tests

Status:

- complete

Completed:

- added `internal/realtime/messages.go`
- added `internal/realtime/websocket_hub.go`
- attached live websocket ownership to the existing realtime registry
- added explicit websocket lifecycle hooks:
  - `Connect`
  - `Disconnect`
  - `UpdateCurrentAddress`
  - `SendJSON`
  - `BroadcastJSON`
  - `BroadcastConnections`
  - `SendFrontendIdentity`
- kept the transport boundary narrow:
  - the hub owns live websocket references and write serialization
  - message encoding is plain JSON
  - route/auth entry remains in `internal/wsapi`
- made the first Go-owned websocket message contracts explicit:
  - `AllConnections`
  - `FrontendIdentity`
- kept inventory semantics simple and explicit:
  - inventory is built from live registered connections
  - broadcasts target frontend connections only
  - current-address values are sanitized through the registry before broadcast
- made cleanup behavior explicit:
  - connection write failures drop the live websocket/runtime entry
  - connect/disconnect can optionally rebroadcast inventory

Tests:

- focused integration-style coverage in `internal/realtime/websocket_hub_test.go`
- verified behaviors include:
  - session/type-targeted broadcast filtering
  - connection inventory payloads with share-session ids
  - current-address redaction in broadcasts
  - server-owned frontend identity token delivery
  - optional connect-time inventory broadcast
  - disconnect-time inventory rebroadcast
  - closed-connection cleanup on send
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- wiring actual websocket routes to the hub through `internal/wsapi`
- listener snapshot/delta message fan-out
- force-refresh message delivery
- terminal session lifecycle and PTY attachment

### Slice 3: Listener Snapshot, Delta, And Force-Refresh Fan-Out

Deliver:

- snapshot bootstrap message path
- delta/event broadcast path
- force-refresh broadcast with sequence reset
- project/session subscription model that later listener registration can use

Acceptance:

- snapshot + realtime sequencing is deterministic
- force refresh resets the relevant sequence scope
- Go tests cover the reference realtime behavior docs for sequence and refresh handling

Status:

- complete

Completed:

- added `internal/realtime/listener_messages.go`
- added `internal/realtime/listener_registry.go`
- added `internal/realtime/listener_broadcaster.go`
- introduced a Go-owned listener subscription boundary with:
  - bootstrap tracking separate from callback registrations
  - dependency-mode-aware realtime matching
  - share-session-aware targeting that includes shared listeners for session-scoped fan-out
- made the first listener-facing runtime messages explicit:
  - `ListenerRealtimeEvent`
  - `ListenerForceRefresh`
- attached the listener broadcaster to the existing websocket hub and sequencer
- kept sequence ownership explicit:
  - realtime deltas increment per `(project id, share session id)` scope
  - force refresh resets the relevant scope even when no listeners are connected
- kept the snapshot path intentionally narrow:
  - the broadcaster ships opaque `projectState` JSON without owning project-state shaping
  - force refresh targets bootstrapped listener sockets, not just fully registered ones

Tests:

- focused coverage in:
  - `internal/realtime/listener_registry_test.go`
  - `internal/realtime/listener_broadcaster_test.go`
- verified behaviors include:
  - bootstrap-derived project/session registration scope
  - wildcard and refresh-only callback handling
  - share-session-scoped delta fan-out with shared-listener inclusion
  - deterministic per-session delta sequencing
  - force-refresh targeting of bootstrapped listener sockets
  - sequence reset after force refresh, including the no-target case
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- terminal session lifecycle and PTY attachment

### Slice 4: Websocket Route Lifecycle Wiring

Deliver:

- real frontend websocket route wiring under `internal/wsapi`
- real listener websocket route wiring under `internal/wsapi`
- app mux integration for root websocket routes
- frontend identity send and current-address update handling through the realtime hub
- listener bootstrap tracking and disconnect cleanup through the listener broadcaster

Acceptance:

- the app serves websocket routes through the normal HTTP stack
- websocket middleware does not break HTTP upgrade behavior
- frontend connections receive server-owned identity tokens from the live app handler
- listener websocket connections bootstrap the realtime registry and clean up on disconnect

Status:

- complete

Completed:

- added `internal/wsapi/routes.go`
- added `internal/app/websocket_test.go`
- extended `internal/httpapi/httpapi.go` with explicit root-route registration
- extended `internal/wsapi/wsapi.go` with request-aware authenticated websocket handlers
- wired the realtime hub and listener broadcaster into `internal/app`
- made the first live websocket route surfaces explicit:
  - `GET /ws/frontend`
  - `GET /ws/listeners/{listenerID}?projectId=...`
- kept the route layer narrow:
  - auth/mode resolution still lives in `internal/wsapi`
  - realtime connection ownership still lives in `internal/realtime`
  - `internal/app` only assembles the dependencies and root route registration
- made frontend route behavior explicit:
  - non-launcher-only access
  - frontend identity delivery on connect
  - optional connection inventory rebroadcast outside deployment mode
  - `CurrentAddressUpdate` message handling through the realtime hub
- made listener route behavior explicit:
  - non-launcher-only access
  - required `listenerID` path param and `projectId` query param
  - bootstrap recording in the listener registry
  - disconnect cleanup in both the realtime hub and listener broadcaster
- fixed the HTTP transport boundary so websocket upgrades survive the normal app middleware stack:
  - `statusRecorder` now exposes `Unwrap()`
  - websocket accept can recover the underlying `http.Hijacker` through the access-log wrapper

Tests:

- focused websocket route coverage in:
  - `internal/wsapi/routes_test.go`
  - `internal/app/websocket_test.go`
- verified behaviors include:
  - frontend identity delivery from the real app handler
  - frontend current-address rebroadcast through the realtime hub
  - share-session touch behavior in route-level share mode tests
  - listener bootstrap recording and disconnect cleanup
  - websocket upgrade survival through the root HTTP middleware stack
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- app-level share-session store wiring for deployment-mode websocket routes
- terminal session lifecycle and PTY attachment

### Slice 5: Listener Registration And Action Event Transport

Deliver:

- listener register/ack protocol on `/ws/listeners/{listenerID}`
- server-side listener callback registration updates from live websocket messages
- listener dependency-event delivery using the existing broadcaster/sequencer
- live route coverage proving registered listener sockets receive realtime and action events

Acceptance:

- listener websocket routes accept register messages and persist callback filters
- successful registrations return an explicit ack over the websocket
- dependency events share the same per-project/per-session sequence scope as realtime deltas
- registered live listener sockets receive both realtime deltas and dependency events

Status:

- complete

Completed:

- extended `internal/realtime/listener_messages.go` with:
  - `ListenerRegister`
  - `ListenerRegisterAck`
  - `ListenerDependencyEvent`
- extended `internal/realtime/listener_broadcaster.go` with dependency-event delivery on the existing sequencer
- kept the message and routing boundary explicit:
  - listener register payloads only carry callback dependency filters and dependency mode
  - project/share-session scope remains server-owned from the listener route bootstrap
- taught `/ws/listeners/{listenerID}` to:
  - parse `ListenerRegister` messages
  - validate and persist callback registrations through the existing listener registry
  - send `ListenerRegisterAck` on success
  - close with `4400` on invalid listener registration payloads
- kept sequence ownership unified:
  - realtime deltas and dependency events share the same `(project id, share session id)` counters
  - force refresh continues to reset the same scope for both event classes

Tests:

- focused coverage in:
  - `internal/realtime/listener_broadcaster_test.go`
  - `internal/wsapi/routes_test.go`
- verified behaviors include:
  - dependency-event filtering by dependency mode and share session
  - shared sequencing between realtime deltas and dependency events
  - listener register ack delivery from the live websocket route
  - realtime and dependency-event delivery to listener sockets that registered through the route
  - invalid listener registrations closing with `4400`
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- initial force-refresh snapshot send after listener registration
- producer-side frontend/project-state routing into realtime delta and dependency-event emitters
- app-level share-session store wiring for deployment-mode websocket routes
- terminal session lifecycle and PTY attachment

### Slice 6: Terminal Runtime

Deliver:

- `internal/terminals` service
- PTY-backed session create/list/delete
- attach/read/write/resize hooks
- share-session-aware terminal ownership
- buffered history for reconnect/reattach

Acceptance:

- macOS and Linux PTY attach/delete/resize behavior works through Go tests
- terminal sessions are isolated by runtime/share-session scope
- deployment-mode terminal write restrictions are explicit

Status:

- complete

Completed:

- added `internal/terminals/service.go`
- introduced an explicit Go-owned terminal session boundary around:
  - PTY creation via `github.com/aymanbagabas/go-pty`
  - session create/open reuse by terminal id
  - per-project/per-share-session ownership metadata
  - attach/detach subscriptions with buffered history replay
  - input writes, resize updates, and explicit close/delete behavior
- kept deployment-mode write restrictions in the terminal runtime instead of transport code:
  - each session records whether input is allowed
  - disallowed writes fail with an explicit runtime error
- kept lifecycle ownership explicit:
  - terminal sessions are runtime-only and are removed on process exit or delete
  - `internal/app` now owns terminal-service startup and shutdown
- chose a bounded history buffer and explicit backpressure policy:
  - terminal output history is kept in memory for reconnect/reattach
  - slow attachments are dropped instead of stalling PTY reads for the whole session

Tests:

- focused PTY integration coverage in `internal/terminals/service_test.go`
- verified behaviors include:
  - share-session-aware list filtering
  - attach/write/history replay on reattach
  - PTY-backed resize behavior using a real shell process
  - deployment-style input rejection
  - share-session terminal cleanup
- full Go suite passes with `./scripts/go.sh test ./...`

Deferred:

- websocket attach/read/write route migration onto `internal/terminals`
- HTTP terminal delete/kill/run route migration onto `internal/terminals`
- terminal process metadata broadcasts and run-command helpers

## Test Plan

- package-level tests in `internal/realtime` for sequence, targeting, affinity, and address sanitation
- websocket integration tests in `internal/wsapi` and `internal/app` for live route wiring and listener registration
- PTY integration tests in `internal/terminals` using disposable temp dirs and real subprocesses
- keep the Python websocket and terminal tests as the minimum behavior map for equivalent Go coverage

## Exit Criteria

Phase 4 is complete when:

- the Go backend owns realtime sequencing and websocket connection state
- websocket session fan-out is deterministic and tested
- terminal session lifecycle works without the Python backend
- the relevant Python websocket and terminal behaviors have corresponding Go coverage

## Open Questions

- what is the smallest useful Go websocket message contract for the first listener-facing slice?
- which terminal history behaviors should be preserved exactly versus simplified?
- whether terminal session persistence should survive backend restart in Phase 4 or remain runtime-only

Resolved In Slice 6:

- terminal sessions remain runtime-only in Phase 4; they do not survive backend restart
- deployment-mode input restrictions are part of terminal session policy, not ad hoc websocket-handler checks
- reconnect behavior uses bounded in-memory output history rather than trying to persist terminal scrollback

## Next Recommended Step

Follow the dedicated run-code migration plan:

- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- start with the runnable project-graph minimum needed by `runCode`
- keep producer-side run-command and frontend metadata work scoped until that dependency lands
