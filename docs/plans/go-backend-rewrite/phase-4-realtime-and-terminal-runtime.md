# Phase 4: Realtime And Terminal Runtime

## Purpose

Phase 4 establishes the first Go-owned realtime and terminal runtime layers:
connection ownership, subscription scoping, snapshot/delta broadcast semantics,
and PTY-backed terminal session management.

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
- realtime sequencing, websocket connection ownership, listener fan-out, and terminal runtime still live only in Python across:
  - `backend/setta/websockets/realtime_event_hub.py`
  - `backend/setta/websockets/websocket_manager.py`
  - `backend/setta/routers/websocket.py`
  - `backend/setta/routers/terminals.py`

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

- planned

### Slice 4: Terminal Runtime

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

- planned

## Test Plan

- package-level tests in `internal/realtime` for sequence, targeting, affinity, and address sanitation
- websocket integration tests in `internal/wsapi` once transport wiring lands
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

## Next Recommended Step

Implement Slice 3:

- add listener-facing snapshot, delta, and force-refresh broadcast helpers on top of the websocket hub
- keep sequence ownership in `internal/realtime`
- defer listener registration/dependency filtering only as long as needed to land the first deterministic snapshot + delta path
