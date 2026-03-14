# Phase 15 Plugin Backend Codegen Registration Runtime

## Purpose

This doc records the first higher-level Go backend plugin runtime slice after
the landed Phase 15 direct frontend transport closeout.

The bounded caller gap here was backend codegen target registration visibility.
The plugins pane and run instructions read `registeredCodegenTargets`, but the
Go plugin runtime/status payload still hardcoded backend registration arrays to
empty.

The goal was not a full backend plugin hot-load supervisor. The goal was to
land the smallest Go-owned registration owner that can surface real worker-
registered codegen targets through the existing Go plugin runtime/status
payloads.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- Go now owns worker-backed `registeredCodegenTargets` loading for active
  backend plugins in:
  - `internal/plugins/backend_codegen_registrations.go`
  - `internal/plugins/status.go`
  - `internal/plugins/runtime.go`
- the shared plugin service now threads that registration owner through
  runtime/status payload building in:
  - `internal/plugins/service.go`
- the real IDE app now wires the current-process worker runtime provider into
  that registration owner in:
  - `internal/app/app.go`
- `GET /plugins/runtime` can now return real backend codegen registrations for
  the backend-codegen fixture plugin
- registration-load failures stay plugin-scoped as
  `PLUGIN_BACKEND_REGISTER_FAILED` status errors instead of failing the entire
  runtime/status read
- the later combined backend registration follow-on is now landed in
  `phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`

## Scope

This slice covered only:

- a Go-owned backend codegen registration loader/owner in `internal/plugins`
- worker-backed registration capture for plugins that effectively expose
  `registerCodegenTarget`
- status/runtime payload shaping for `registeredCodegenTargets`
- app wiring so the real IDE app uses the worker runtime provider for this
  registration owner
- focused Go tests for runtime/status/app behavior

## Non-Goals

- plugin external-agent adapter registration parity
- plugin language-server registration parity
- plugin router/static-dir/MCP/UI-setting registration parity
- a broad long-lived backend plugin supervisor or global singleton
- changing install/restart policy semantics for backend plugins
- widening scope to the deferred `lock*` routes

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-lifecycle-mutation-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-plugin-codegen-worker-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-4-plugin-codegen-refresh-owner.md`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_manager.py`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- `frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `internal/plugins/runtime.go`
- `internal/plugins/status.go`
- `internal/plugins/codegen_runtime.go`
- `internal/plugins/filesystem_worker_spec_resolver.go`
- `internal/app/app.go`

## Decisions Made

- keep the first higher-level backend registration slice codegen-only
  - codegen already has a real Go worker/runtime path
  - language-server and external-agent registrations need different owners and
    broader runtime contracts
- keep transport thin
  - runtime/status routes continue shaping JSON only
  - worker startup and registration capture live under `internal/plugins`
- reuse the existing worker-backed codegen runtime instead of creating another
  worker protocol client path
  - the registration loader starts the existing codegen runtime and reads its
    registrations
- cache registrations by deterministic plugin runtime identity
  - plugin id/version/source digest/effective capabilities/backend entrypoint
    changes invalidate the cached snapshot
- keep failure handling explicit and plugin-scoped
  - one plugin registration failure should not take down the entire
    `/plugins/runtime` or `/plugins/status` payload

## Landed Work

- `internal/plugins/types.go`
  - typed registration payloads now exist for:
    - `registeredLanguageServers`
    - `registeredExternalAgentAdapters`
    - `registeredCodegenTargets`
- `internal/plugins/backend_codegen_registrations.go`
  - bounded backend codegen registration loader
  - deterministic cache keyed by plugin runtime identity
  - worker-backed registration capture via `StartCodegenRuntime(...)`
  - plugin-scoped `PLUGIN_BACKEND_REGISTER_FAILED` error snapshots
- `internal/plugins/service.go`
  - shared plugin service now accepts the backend codegen registration owner
- `internal/plugins/status.go`
  - status payloads now merge plugin-scoped dynamic backend registration data
    and plugin-scoped registration errors
- `internal/plugins/runtime.go`
  - runtime payloads now reuse the same status registration details path
- `internal/app/app.go`
  - real app wiring now creates the backend codegen registration loader when
    worker runtime inputs are available
- focused coverage in:
  - `internal/plugins/runtime_test.go`
  - `internal/plugins/status_test.go`
  - `internal/app/app_test.go`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestService(RuntimeIncludesBackendCodegenTargetRegistrations|StatusSurfacesPluginScopedBackendCodegenRegistrationErrors)' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginRuntimeAndFrontendAssets|ServesPluginRuntimeWithBackendCodegenRegistrations)' -count=1`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `git diff --check`

## Next Recommended Step

- the bounded local-link transport follow-on is now landed in
  `phase-15-plugin-link-transport.md`
- the combined backend registration follow-on is now landed in
  `phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
- keep `POST /plugins/lock/*` deferred unless they become caller-backed or a
  bounded dependency requires them
- do not introduce a broad backend plugin supervisor until a real lifetime or
  multi-registration dependency makes it necessary

## Open Questions

- whether future backend registration slices should share a longer-lived worker
  supervisor instead of bounded snapshot loaders
  - recommendation: no for now; keep the one-shot source-of-truth loader until
    a caller needs shared lifetime semantics
