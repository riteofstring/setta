# Phase 4 Plugin Worker Session Owner

## Purpose

This doc covers the next step after
`docs/plans/go-backend-rewrite/phase-4-plugin-worker-listener-event-bridge.md`.

The listener-event host and JSON-RPC transport boundaries now exist in Go. The
next missing piece is the first Go-owned process/session lifecycle wrapper that
can start a backend worker, attach the Go RPC client, and shut the worker down
cleanly.

This is still not a full plugin runtime migration. The goal is to land the
smallest explicit lifecycle boundary that later plugin discovery/load work can
reuse.

## Status

Current repo status as of 2026-03-06:

- Go already owns:
  - worker listener-event host semantics in `internal/plugins/worker_host.go`
  - worker JSON-RPC transport in `internal/plugins/worker_rpc.go`
- Go now also owns the first worker process/session lifecycle wrapper under:
  - `internal/plugins/worker_session.go`
- Go now also owns the first caller-facing worker launcher boundary under:
  - `internal/plugins/worker_launcher.go`
- Go now also owns the first narrow adopter above the launcher under:
  - `internal/plugins/codegen_runtime.go`
- Python still owns broader worker adoption/load lifecycle under:
  - `backend/setta/plugins/manager.py`
  - `tests/plugins/test_plugin_manager.py`
- the next dependency is not more listener transport logic
- the next dependency is the first non-`internal/plugins` caller that adopts
  the new codegen runtime boundary

## Scope

This focused plan covers:

- starting a backend worker process with explicit command/env inputs
- attaching `internal/plugins.WorkerRPCClient` to that process
- exposing a small Go-owned session boundary for:
  - `plugin.initialize`
  - `plugin.register`
  - `plugin.shutdown`
  - direct method calls where needed
- deterministic close/cleanup behavior for worker subprocesses

## Non-Goals

- full plugin discovery, enable/disable, or load order work
- runtime preparation, venv management, or dependency installation
- router/listener endpoint registration ownership beyond what the worker
  already exposes
- plugin registry persistence or manifest policy work
- preserving Python manager class shapes as a compatibility contract

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-plugin-worker-listener-event-bridge.md`
- `docs/plans/go-backend-rewrite/phase-4-listener-realtime-producer-migration.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/plugins/test_plugin_worker.py`

## Dependency Finding

Go already has the worker host service and JSON-RPC client. The missing
boundary is:

- a small lifecycle owner that turns command/env/plugin metadata into:
  - an `exec.Cmd`
  - stdio pipes
  - a `WorkerRPCClient`
  - deterministic shutdown/cleanup

That layer now exists in `internal/plugins/worker_session.go`.

The first caller-facing adoption boundary now also exists in
`internal/plugins/worker_launcher.go`.

The first narrow adopter above that boundary now also exists in
`internal/plugins/codegen_runtime.go`.

## Working Decisions

- keep lifecycle ownership separate from listener semantics
- keep process startup explicit:
  - command arguments are built from worker metadata
  - environment is passed in explicitly by the caller
- keep the first owner small:
  - one worker process
  - one RPC client
  - no broad supervisor or registry yet
- prefer explicit close/shutdown methods over implicit finalizers or global
  process maps
- validate worker handshakes at the launcher boundary using the worker protocol
  contract instead of passing untyped initialize payloads deeper into later
  runtime work

## Implementation Slices

### Slice 1: Worker Session Lifecycle Wrapper

Deliver:

- a Go-owned worker session type in `internal/plugins`
- explicit worker startup options for:
  - python binary
  - plugin id/version/root
  - backend entrypoint path
  - server mode
  - requested/effective capabilities
  - environment and working directory
- direct `Initialize`, `Register`, `Shutdown`, `Call`, and `Close` methods
- focused tests against a real Python worker process

Acceptance:

- Go can start a real Python backend worker and call `plugin.initialize`
- Go can call `plugin.register` through the new session type and still route
  nested listener dependency events through the Go host boundary
- closing the session deterministically tears down the subprocess

Status:

- complete

Completed:

- added `internal/plugins/worker_session.go` as the first Go-owned worker
  process/session lifecycle wrapper
- kept command/env/process ownership explicit in startup options instead of
  reviving a Python-shaped global manager
- exposed direct `Initialize`, `Register`, `Shutdown`, `Call`, and `Close`
  methods around one worker process + one `WorkerRPCClient`
- kept listener-event semantics in the existing host + transport layers instead
  of pulling them into the session owner
- covered the slice with focused Go tests for:
  - required startup metadata validation
  - real Python worker initialize/register/shutdown lifecycle
  - nested listener dependency-event delivery through the Go host boundary
  - deterministic close behavior and closed-session rejection

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/plugins ./internal/runs ./internal/app -count=1`

### Slice 2: First Caller-Facing Adoption Boundary

Deliver:

- the first narrow service that can create a worker session from already
  resolved plugin metadata
- no discovery/install/runtime-prep broadening beyond what Slice 1 needs

Acceptance:

- later plugin runtime work can reuse the session owner without re-implementing
  process lifecycle and stdio wiring

Status:

- complete

Completed:

- added `internal/plugins/worker_launcher.go` as the first caller-facing
  adoption boundary around the lower-level session type
- introduced `BackendWorkerSpec` as the resolved worker metadata DTO for later
  plugin runtime callers
- introduced typed initialize handshake decoding and validation for:
  - plugin id
  - plugin version
  - backend API version
  - required worker RPC methods
- kept failure cleanup explicit by closing worker sessions when initialize or
  register fails during launcher-owned startup
- covered the slice with focused Go tests for:
  - launcher host requirements
  - real Python worker start + initialize + register round-trip through the
    launcher
  - live handshake API mismatch rejection
  - typed handshake validation failures for invalid payload shapes/contracts

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/plugins ./internal/runs ./internal/app -count=1`

## Open Questions

- how much stderr buffering the first session wrapper should keep versus simply
  streaming to logs

## Next Recommended Step

- Treat this focused plan as complete.
- Follow
  `docs/plans/go-backend-rewrite/phase-4-plugin-codegen-worker-runtime.md`.
- The next concrete step is Slice 2 there: adopt the new worker-backed codegen
  runtime from `internal/runs` so generated-entry/plugin-codegen flows stop
  failing with an explicit unsupported error.
