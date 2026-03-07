# Phase 4 Plugin Codegen Refresh Owner

## Purpose

This doc narrows the first real caller above
`docs/plans/go-backend-rewrite/phase-4-plugin-codegen-worker-runtime.md`.

The worker runtime now exists in Go, but the earlier assumption that the next
adopter should live in `internal/runs` was too coarse. Current Python product
behavior does not invoke plugin codegen during `create_run_command(...)`.
Plugin codegen is owned by codegen refresh and filesystem materialization, and
the run path only consumes the files that refresh produced.

The goal here is to land the smallest Go-owned plugin codegen output
materializer that:

- reads configured plugin codegen targets from Go project state
- invokes the new worker-backed codegen runtime with explicit worker metadata
- writes generated plugin outputs into the Go-owned code root using deterministic
  paths

## Status

Current repo status as of 2026-03-06:

- Go already owns the backend worker lower layers and worker-backed codegen
  runtime under:
  - `internal/plugins/worker_host.go`
  - `internal/plugins/worker_rpc.go`
  - `internal/plugins/worker_session.go`
  - `internal/plugins/worker_launcher.go`
  - `internal/plugins/codegen_runtime.go`
- Go project state already stores plugin codegen targets as source-of-truth
  project config data under:
  - `internal/projectstate`
  - `internal/projectview`
- Python still owns plugin codegen output materialization under:
  - `backend/setta/project_state/base_project_manager.py`
  - `_refresh_plugin_codegen_outputs(...)`
- Go now also owns the first narrow plugin codegen materializer under:
  - `internal/codegen/plugin_materializer.go`
  - worker-spec resolution through an injected source-of-truth resolver
  - worker-backed generation plus deterministic target-root rewrites under
    `setta_files/code/sections/<project>/plugin_codegen`
- Go now also owns the first non-test worker-spec resolver dependency for that
  materializer under:
  - `internal/plugins/filesystem_worker_spec_resolver.go`
  - read-only plugin root precedence across workspace, `setta_files`, and
    `setta_home`
  - read-only enablement state from `plugins_state.json` and
    `plugins_global_state.json`
- Go now also owns the first explicit app/runtime worker input boundary for
  plugin codegen under:
  - `internal/plugins/worker_runtime.go`
  - lazy current-process worker runtime resolution from explicit env or the
    active virtualenv
  - explicit optional `SETTA_PLUGIN_WORKER_PYTHONPATH` injection instead of a
    hidden Python manager singleton
- Go now also owns the first central main-runtime save-triggered plugin codegen
  refresh path under:
  - `internal/projectstate/runtime.go`
  - `internal/projectstate/registry.go`
  - `internal/app/app.go`
  - document-level plugin codegen refresh and stale project-root pruning in
    `internal/codegen/plugin_materializer.go`

## Scope

This focused plan covers:

- a Go-owned plugin codegen materializer service above `internal/plugins`
- deterministic plugin codegen output-root and target-dir layout
- live worker-backed output generation against real backend-codegen fixtures
- narrow filesystem write/prune behavior needed for first ownership

## Non-Goals

- full project-state refresh parity in one slice
- first-party Python codegen generation
- watch-mode or incremental cache parity
- route transport or websocket migration
- plugin discovery, install, enable/disable, or persistence work

## Inputs

- `docs/plans/go-backend-rewrite/phase-4-plugin-codegen-worker-runtime.md`
- `docs/plans/go-backend-rewrite/phase-4-generated-entry-runs-and-temp-terminals.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/types/project_config.py`
- `backend/setta/utils/utils.py`
- `tests/project_state/test_codegen_targets.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/fixtures/plugins/backend-codegen/backend/entrypoint.py`

## Dependency Finding

The previous Slice 2 candidate in
`phase-4-plugin-codegen-worker-runtime.md` said the next adopter was likely in
`internal/runs`. Re-reading the Python product behavior showed a more specific
source-of-truth path:

- Python `create_run_command(...)` uses already-generated code files
- Python plugin codegen runs from `_refresh_codegen_state(...)`
- `_refresh_codegen_state(...)` generates first-party Python code first, then
  materializes plugin codegen outputs under the project code root

That means the first real caller above the worker runtime is not the run
planner. It is the owner that materializes configured plugin codegen outputs to
disk.

## Working Decisions

- put the first external caller in a narrow Go-owned materializer service
  - do not bury worker startup inside `internal/runs`
  - do not widen into a Python-shaped global plugin manager
- use project-state codegen target payloads as the source of truth
  - no inferred target options
  - no keyword-based target routing
- keep the first materializer explicit and stateless
  - resolve worker metadata per target from an injected source-of-truth resolver
  - generate outputs on demand
  - write and prune target-root contents deterministically
- defer cache/fingerprint optimization until after there is a correct owner

## Implementation Slices

### Slice 1: Worker-Backed Plugin Codegen Materializer

Deliver:

- a Go-owned materializer service above `internal/plugins` that:
  - reads plugin codegen targets from project-state payloads
  - resolves worker metadata for each configured target
  - starts the worker-backed runtime
  - invokes generation
  - writes generated files to deterministic project code roots
- focused tests against the backend-codegen fixture plus path/write behavior

Acceptance:

- Go can materialize plugin codegen outputs for a project config without Python
  plugin-manager ownership
- malformed project target payloads fail in Go
- repeated materialization can rewrite target roots deterministically without
  leaving stale files behind

Status:

- complete

Completed:

- added `internal/codegen/plugin_materializer.go` as a stateless owner above
  `internal/plugins`
- kept worker process ownership explicit by requiring an injected
  `WorkerSpecResolver` instead of reviving a Python-shaped global plugin manager
- matched the current Python target-dir naming contract in Go:
  - normalized target id plus `sha256(targetID)[:12]`
- used `internal/projectview.SingleConfigByProjectID(...)` as the source of
  truth for the worker `projectState` payload instead of reconstructing an
  ad-hoc shape inside the materializer
- validated plugin target payloads in Go before worker startup:
  - payload must be a JSON object
  - optional `language` must match the target language
  - optional `options` must be a JSON object
  - unsupported top-level fields fail explicitly
- materialized generated files under deterministic per-target roots and removed
  stale target contents by rewriting each target root on every successful
  generation
- removed the full plugin output root when a project has no plugin codegen
  targets
- covered the slice with focused Go tests for:
  - live backend-codegen fixture generation and on-disk writes
  - stale file and stale target-dir pruning on repeated materialization
  - malformed plugin target payload rejection before worker startup
  - removal of the previous output root when plugin targets disappear

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/plugins -count=1`

### Slice 2: Project-State Refresh Adoption

Deliver:

- the first project-state lifecycle owner that calls the new materializer when
  codegen refresh is required
- the first non-test source-of-truth worker-spec resolver that can map a
  configured plugin codegen target id to backend worker metadata
- explicit trigger points for:
  - project-state refresh after mutations
  - draw snapshot updates when relevant

Acceptance:

- Go project-state refresh owns plugin codegen output updates instead of Python
- generated-entry runs continue consuming generated files as a downstream effect,
  not as the owner of plugin codegen execution

Status:

- in_progress

Completed:

- added `internal/plugins/filesystem_worker_spec_resolver.go` as the first
  non-test source-of-truth worker-spec resolver for plugin codegen targets
- kept the resolver read-only and explicit instead of reviving Python's full
  plugin manager/runtime surface
- resolved plugin roots from the documented install roots:
  - `<workspace>/.setta_plugins/<plugin-id>`
  - `<setta_files_root>/plugins/<plugin-id>`
  - `<setta_home>/plugins/<plugin-id>`
- treated the configured target id namespace as source of truth by parsing
  `<plugin-id>:<local-id>` and resolving the owning plugin from the prefix
- matched current precedence and activation rules needed for this slice:
  - workspace beats `setta_files`, which beats global
  - higher-precedence disabled or invalid entries block lower fallbacks
  - global auto-enable state is read from `plugins_global_state.json`
  - effective capabilities are filtered by current server mode
- validated backend worker manifests in Go before returning worker metadata:
  - manifest schema version
  - plugin id shape and root/id match
  - known capability set with duplicate rejection
  - backend entrypoint path existence within plugin root
- covered the resolver with focused Go tests for:
  - worker-spec construction from the active workspace plugin
  - workspace/`setta_files`/global precedence
  - disabled plugin rejection
  - global auto-enable handling
  - mode-blocked codegen capability rejection
  - missing codegen capability rejection
  - invalid target id rejection
- added `internal/plugins/worker_runtime.go` as a lazy worker runtime provider
  boundary for app-owned plugin codegen refresh wiring
- kept worker runtime resolution explicit instead of silently guessing from
  `PATH`:
  - use `SETTA_PLUGIN_WORKER_PYTHON` when provided
  - otherwise use the active `VIRTUAL_ENV`
  - validate that the chosen interpreter can import
    `setta.plugins.worker`
  - optionally prepend `SETTA_PLUGIN_WORKER_PYTHONPATH` to `PYTHONPATH`
- rewired `internal/plugins/filesystem_worker_spec_resolver.go` to resolve
  runtime inputs lazily through that provider so app startup does not need to
  hard-fail just because plugin codegen is unused
- wired the non-deployment app path in `internal/app/app.go` to own:
  - current-process worker runtime resolution
  - filesystem worker-spec resolution
  - plugin codegen materializer construction
- added central post-save hook support in `internal/projectstate`:
  - `RuntimeOptions.AfterSave` in `internal/projectstate/runtime.go`
  - main/settings runtime option wiring in `internal/projectstate/registry.go`
- promoted `internal/codegen/plugin_materializer.go` to document-level refresh
  ownership so a main-runtime save now:
  - refreshes every current project deterministically
  - prunes stale `plugin_codegen` roots left behind by removed or renamed
    projects
- removed the `internal/runs/service.go` special case and moved plugin codegen
  refresh ownership into the central main-runtime save boundary instead
- covered the adoption slice with focused Go tests for:
  - explicit runtime provider resolution and `PYTHONPATH` wiring in
    `internal/plugins/worker_runtime_test.go`
  - runtime and registry after-save hook semantics in
    `internal/projectstate/runtime_test.go` and
    `internal/projectstate/registry_test.go`
  - document-level stale project-root pruning in
    `internal/codegen/plugin_materializer_test.go`
  - both direct-save and run-path app-level plugin codegen output
    materialization in `internal/app/app_test.go`

Tests:

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate ./internal/codegen ./internal/plugins ./internal/runs ./internal/app -count=1`

## Open Questions

- whether plugin codegen output caching should remain entirely absent until
  refresh ownership exists, or whether a minimal content fingerprint is worth
  adding before broader refresh ownership leaves the current save-hook
  boundary
- which first Go-owned IDE mutation/save transport should adopt the central
  runtime save hook so ordinary editor mutations persist and refresh plugin
  outputs without depending on run-triggered saves or test-only callers

## Next Recommended Step

- Continue Slice 2.
- Keep the new runtime save hook as the ownership boundary.
- Continue in
  `docs/plans/go-backend-rewrite/phase-4-codegen-targets-mutation-transport.md`
  with the first real Go-owned IDE mutation/save transport on top of it so
  ordinary project-state edits start persisting through that hook and refresh
  plugin codegen outputs automatically.
