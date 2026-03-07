# Phase 4 Plugin Worker Listener Event Bridge

## Purpose

This doc narrows the remaining plugin-related work needed to finish the
listener producer migration tracked in
`docs/plans/go-backend-rewrite/phase-4-listener-realtime-producer-migration.md`.

The goal here is not to build the full Go plugin runtime. The goal is to define
and land the smallest Go-owned backend-worker host boundary needed for
plugin-emitted listener dependency events.

## Status

Current repo status as of 2026-03-06:

- Go already owns listener delivery primitives under:
  - `internal/realtime`
  - `internal/wsapi`
  - `internal/app`
- Go now includes the first `internal/plugins` package with a
  transport-independent worker-host service for listener dependency events
- Go now also includes the first thin backend-worker JSON-RPC transport for
  that host service under:
  - `internal/plugins/worker_rpc.go`
- Python reference behavior for this area currently lives under:
  - `backend/setta/plugins/worker.py`
  - `backend/setta/plugins/manager.py`
  - `tests/plugins/test_plugin_worker.py`
  - `tests/plugins/test_plugin_manager.py`
- jumping directly to full plugin discovery/install/runtime work would widen
  Phase 4 into Phase 7 and slow down the current listener migration

## Scope

This focused plan covers:

- the first transport-independent Go worker-host boundary for plugin listener
  dependency events
- explicit validation of:
  - effective capability ownership
  - project scope
  - deployment share-session scope
- direct forwarding into `internal/realtime.ListenerProducer`
- preserving batch dependency-event sequencing semantics

## Non-Goals

- full plugin discovery, install, enable/disable, or lockfile work
- full backend worker process supervision
- plugin listener endpoint invocation transport
- MCP or router registration work
- preserving Python error codes or internal manager shapes as a compatibility
  contract

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-listener-realtime-producer-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-realtime-and-terminal-runtime.md`
- `backend/setta/plugins/worker.py`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/plugins/test_plugin_manager.py`
- `docs/reference/setta-realtime-behavior.md`

## Dependency Finding

Current inspection at plan creation showed Slice 4 was blocked on one missing Go
boundary:

- a worker-host service that can accept plugin-emitted listener dependency
  events and forward them into the Go listener producer

That boundary is now in place as:

- a transport-independent host service in `internal/plugins/worker_host.go`
- a thin JSON-RPC/stdin worker transport in `internal/plugins/worker_rpc.go`

It was not blocked on websocket transport, listener sequencing, or deployment
overlay loading. Go already owned those concerns.

## Working Decisions

- start with a transport-independent host service in `internal/plugins`
- keep JSON-RPC/stdin framing out of the first slice
- treat effective capability checks as explicit worker-context input, not an
  implicit global lookup
- require deployment share-session ids at the host boundary and touch the
  session there so background worker traffic counts as session activity
- preserve batch dependency-event delivery so one worker call maps to one
  listener sequence increment
- land the first worker transport slice as direct stdio JSON-RPC/JSONL around
  the host service and keep worker process ownership out of scope

## Implementation Slices

### Slice 1: Transport-Independent Worker Host Emitter

Deliver:

- `internal/plugins` package with a focused worker-host service
- explicit request types for plugin listener dependency-event emission
- capability validation for `emitListenerEvents`
- deployment-mode share-session validation and touch behavior
- forwarding through `internal/realtime.ListenerProducer`
- focused Go tests using real deployment runtime and listener websocket
  delivery

Acceptance:

- a worker-host request with multiple dependency events emits one listener
  dependency-event batch with one shared sequence increment
- deployment-mode requests require a valid `shareSessionId`
- successful deployment-mode requests touch the referenced share session
- unsupported capabilities fail before listener delivery is attempted

Status:

- complete

Completed:

- added `internal/plugins/worker_host.go`
- kept the boundary transport-independent:
  - no stdio or JSON-RPC framing inside the service
  - explicit worker context and request DTOs for listener dependency events
- enforced worker capability ownership through explicit
  `emitListenerEvents` checks
- required and touched deployment share sessions at the host boundary before
  listener delivery
- forwarded batched worker dependency events through
  `internal/realtime.ListenerProducer`
- extended `internal/realtime.ListenerProducer` with batched dependency-event
  forwarding so one worker call maps to one listener sequence increment
- covered the slice with focused Go tests for:
  - capability rejection
  - deployment share-session requirement
  - deployment share-session touch + batched listener delivery

Tests:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/plugins ./internal/runs ./internal/app -count=1`

### Slice 2: First Worker Transport Integration

Deliver:

- the first Go-owned backend worker transport/dispatch loop wired into the host
  service
- method routing for plugin worker host calls that need listener dependency
  events

Acceptance:

- plugin worker listener events can reach the Go host boundary without Python
  plugin-manager participation
- the host transport stays thin around the Slice 1 service

Status:

- complete

Completed:

- added `internal/plugins/worker_rpc.go` as the first Go-owned backend-worker
  JSON-RPC client/dispatch loop
- kept the transport thin around `internal/plugins/worker_host.go`:
  - request writing and response validation stay in the transport
  - listener-event semantics stay in the host service
- added worker-host method routing through `WorkerHost.Dispatch`
- validated worker response contracts for:
  - response id mismatches
  - missing result payloads
  - malformed error payloads
- covered the transport with focused Go tests for:
  - real Python worker `plugin.initialize`/`plugin.register` round-trips
  - nested `host.emit_listener_dependency_event` delivery through the Go host
    boundary into websocket listener output
  - nested host error propagation back through the worker call surface
  - response-contract failure handling

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/plugins ./internal/runs ./internal/app -count=1`

## Open Questions

- whether the first Go-owned worker process/session owner should wrap
  `WorkerRPCClient` directly or add a slightly broader lifecycle type around it
- whether listener endpoint registration should share the same initial host
  service or wait for a later plugin transport slice

## Next Recommended Step

- Treat this focused plan as complete for Phase 4 listener producer work.
- If plugin runtime work needs to continue soon, add a separate implementation
  plan for the first Go-owned worker process/session owner that can reuse
  `internal/plugins/worker_rpc.go` without pulling full plugin
  discovery/install/runtime work into the current phase.
