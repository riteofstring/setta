# Phase 4 Plugin Codegen Worker Runtime

## Purpose

This doc narrows the next concrete adopter of the new Go backend-worker
transport/session stack.

After `phase-4-plugin-worker-session-owner.md`, the remaining abstract gap was
"some real caller outside the lowest worker layers." The current repo already
had one concrete blocked product path waiting on that: plugin codegen targets.

The goal here is not full plugin discovery or general backend-plugin load
parity. The goal is to land the smallest Go-owned worker-backed codegen runtime
that can:

- register plugin codegen targets through worker `plugin.register`
- invoke those targets through `plugin.invoke_codegen_target`
- normalize generated file payloads with Go-owned validation

## Status

Current repo status as of 2026-03-06:

- Go already owns the backend worker lower layers under:
  - `internal/plugins/worker_host.go`
  - `internal/plugins/worker_rpc.go`
  - `internal/plugins/worker_session.go`
  - `internal/plugins/worker_launcher.go`
- Go now also owns the first worker-backed plugin codegen runtime under:
  - `internal/plugins/codegen_runtime.go`
  - `CodegenTargetRegistry`
  - `StartCodegenRuntime(...)`
  - `(*CodegenRuntime).Generate(...)`
- Go project state already models plugin codegen target payloads and explicit
  plugin-generated sections under:
  - `internal/projectstate`
  - `internal/projectview`
- Python currently owns plugin codegen registration and invocation under:
  - `backend/setta/plugins/manager.py`
  - `backend/setta/plugins/worker.py`
  - `tests/plugins/test_plugin_manager.py`
  - `tests/plugins/test_plugin_worker.py`
- Python still owns plugin codegen output materialization under:
  - `backend/setta/project_state/base_project_manager.py`
  - `_refresh_plugin_codegen_outputs(...)`

## Scope

This focused plan covers:

- worker-host support for plugin codegen target registration
- the first worker-backed codegen runtime above the launcher/session layers
- Go-owned normalization of worker codegen result payloads
- live-worker tests against real backend-codegen fixture plugins

## Non-Goals

- full plugin discovery, install, enable/disable, or persistence work
- router/static-dir/MCP/language-server worker adoption
- direct generated-entry run adoption in the same slice
- preserving Python manager class layout as a compatibility contract

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-generated-entry-runs-and-temp-terminals.md`
- `docs/plans/go-backend-rewrite/phase-4-plugin-worker-session-owner.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `backend/setta/types/project_config.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/fixtures/plugins/backend-codegen/backend/entrypoint.py`

## Dependency Finding

This focused plan is now complete for the worker-runtime layer.

Re-reading Python `create_run_command(...)` and `_refresh_codegen_state(...)`
showed that the first real caller above this runtime is not the run planner.
Python materializes plugin codegen outputs during codegen refresh and the run
path consumes those files later.

That follow-up work is now tracked separately in:

- `docs/plans/go-backend-rewrite/phase-4-plugin-codegen-refresh-owner.md`

## Working Decisions

- keep the first adopter inside `internal/plugins`
  - there is not yet a higher-level Go plugin runtime to own this boundary
  - codegen target execution is still a real product caller above the launcher
- extend `WorkerHost` only for codegen target registration that is required by
  the worker protocol
- keep codegen target result validation Go-owned
  - no blind trust of worker payloads
  - no heuristic path normalization
- let the codegen runtime own a per-worker registration registry
  - do not recreate Python manager-global registration maps
  - the first runtime only needs registrations for one live worker session
- leave output materialization ownership for a later slice once the codegen
  runtime exists

## Implementation Slices

### Slice 1: Worker-Backed Codegen Runtime

Deliver:

- worker-host support for `host.register_codegen_target`
- a Go-owned codegen runtime in `internal/plugins` that:
  - launches and registers a backend worker
  - captures registered codegen targets
  - invokes `plugin.invoke_codegen_target`
  - normalizes generated file payloads
- focused live-worker tests using the backend-codegen fixture

Acceptance:

- Go can start/register the backend-codegen fixture worker and collect its
  registered target metadata
- Go can invoke the registered codegen target and receive normalized generated
  files
- malformed generated file payloads fail in Go instead of silently passing

Status:

- complete

Completed:

- extended `internal/plugins/worker_host.go` to support
  `host.register_codegen_target` alongside listener dependency-event host
  requests
- added a `CodegenTargetRegistry` registration sink so worker register-time
  codegen targets are stored through an explicit Go boundary instead of hidden
  transport state
- added `internal/plugins/codegen_runtime.go` with:
  - `RegisteredCodegenTarget`
  - `GeneratedCodegenFile`
  - `StartCodegenRuntime(...)`
  - `(*CodegenRuntime).Registrations()`
  - `(*CodegenRuntime).Generate(...)`
  - `(*CodegenRuntime).Close()`
- kept nested worker host failures typed by extending worker RPC error mapping
  for:
  - `PLUGIN_CAPABILITY_DENIED`
  - `PLUGIN_BACKEND_REGISTER_FAILED`
  - existing listener emit failures
- matched the Python product semantics for codegen result normalization in Go:
  - payload must be an object with `files`
  - file entries must be objects
  - `relativePath` defaults to the registered target default file name
  - paths are canonicalized with slash normalization plus `.` collapse
  - absolute paths, root escape, duplicates, and non-string content are
    rejected
- covered the slice with focused Go tests for:
  - host service requirements
  - host capability-gated codegen registration
  - normalized target registration storage
  - live backend-codegen fixture startup/register/generate round-trip
  - typed capability-denied propagation through worker registration
  - generated file normalization failures and canonicalization

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -count=1`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/realtime ./internal/plugins ./internal/runs ./internal/app -count=1`

### Slice 2: First External Caller Adoption

Status:

- moved to `phase-4-plugin-codegen-refresh-owner.md`

## Open Questions

- whether later refresh ownership should live in `internal/projectstate` or a
  future dedicated Go codegen subsystem
- whether worker-backed codegen sessions should stay warm once a caller outside
  `internal/plugins` owns their lifecycle

## Next Recommended Step

- Follow
  `docs/plans/go-backend-rewrite/phase-4-plugin-codegen-refresh-owner.md`.
- The next concrete step is the first Go-owned plugin codegen output
  materializer above `internal/plugins`.
