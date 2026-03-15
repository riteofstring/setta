# Phase 15 Plugin Backend Language-Server And External-Agent Registration Runtime

## Purpose

This doc records the next bounded higher-level Go backend plugin runtime slice
after the landed backend codegen registration and local-link transport work.

The remaining direct plugin runtime gap is worker-backed visibility for
`registeredLanguageServers` and `registeredExternalAgentAdapters`. The plugins
pane reads both arrays today, and the external-agent plugin E2E flow depends on
plugin-backed adapter registrations being present in runtime/status payloads.

The goal is not full plugin-defined language-server execution parity. The goal
is to land the smallest Go-owned registration owner that can surface real
worker-registered language servers and external-agent adapters through the
existing Go plugin runtime/status payloads.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- Go now owns worker-backed backend registration loading for:
  - `registeredLanguageServers`
  - `registeredExternalAgentAdapters`
  - `registeredCodegenTargets`
- `internal/plugins` now uses a single bounded registration loader in:
  - `internal/plugins/backend_registrations.go`
  instead of a codegen-only snapshot path
- worker host dispatch now normalizes and captures:
  - `host.register_language_server`
  - `host.register_external_agent_adapter`
  - `host.register_codegen_target`
- the shared plugin service now threads the combined backend registration owner
  through runtime/status payload building
- the real IDE app now wires the current-process worker runtime provider into
  that combined registration owner
- plugin-scoped backend registration failures still surface as
  `PLUGIN_BACKEND_REGISTER_FAILED` status errors instead of failing the entire
  runtime/status read
- bounded plugin-pane visibility coverage now exists in:
  - `frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`
  - `frontend/tests/e2e/overview/plugins/plugin-language-server-runtime.spec.ts`
- full plugin-defined language-server execution/runtime ownership remains
  deferred to the later LSP/runtime phases

## Scope

This slice covers only:

- worker-host normalization and capture for backend language-server
  registrations
- worker-host normalization and capture for backend external-agent adapter
  registrations
- a bounded Go-owned backend registration loader in `internal/plugins` that
  snapshots those registrations for active backend plugins
- status/runtime payload shaping for:
  - `registeredLanguageServers`
  - `registeredExternalAgentAdapters`
- real app wiring so the existing current-process worker runtime provider feeds
  the new registration owner
- focused Go tests and the most relevant existing plugin E2E coverage

## Non-Goals

- full plugin-defined LSP runtime, diagnostics, completion, or document sync
  parity
- plugin external-agent execution ownership beyond registration visibility
- router/static-dir/MCP/UI-setting backend registration parity
- a broad long-lived backend plugin supervisor or stateful global singleton
- widening scope to deferred `POST /plugins/lock/*`

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-backend-codegen-registration-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-link-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-5-lsp-diagnostics-and-completion-runtime.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `tests/plugins/test_plugin_manager.py`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`
- `internal/plugins/worker_host.go`
- `internal/plugins/runtime.go`
- `internal/plugins/status.go`
- `internal/plugins/backend_registrations.go`
- `internal/app/app.go`

## Decisions

- keep this slice registration-visibility only
  - the current concrete caller is plugins/runtime status hydration
  - plugin-defined language-server execution requires broader LSP ownership and
    should stay deferred
- reuse the existing one-shot worker-backed snapshot-loader pattern
  - start the backend worker, capture registrations, close it, cache by plugin
    runtime identity
- keep transport thin
  - `internal/httpapi` keeps serving runtime/status JSON only
  - registration normalization and worker ownership stay under
    `internal/plugins`
- preserve explicit plugin-scoped failure behavior
  - one plugin registration failure should append
    `PLUGIN_BACKEND_REGISTER_FAILED` to that plugin's status entry rather than
    fail the entire runtime/status read
- follow Python registration semantics where they matter for product behavior
  - plugin-relative `./...` launch commands resolve against the plugin root
  - plugin language servers cannot target Python
  - external-agent adapter ids remain namespaced as `<pluginID>:<localID>`
  - duplicate registration conflicts stay explicit

## Landed Work

- `internal/plugins/worker_host.go`
  - added typed request handling for language-server and external-agent adapter
    host methods
  - added plugin-root-aware launch-command normalization for `./...` backend
    commands
  - added explicit validation and duplicate-conflict handling for:
    - language servers
    - external-agent adapters
    - codegen targets
  - updated worker-RPC error mapping so new registration failures report as
    `PLUGIN_BACKEND_REGISTER_FAILED`
- `internal/plugins/backend_registrations.go`
  - new combined bounded backend registration owner
  - deterministic cache keyed by plugin runtime identity
  - one worker startup now captures language-server, external-agent adapter,
    and codegen registrations together
- `internal/plugins/service.go`
  - shared plugin service now accepts the combined backend registration owner
- `internal/plugins/status.go`
  - status payloads now merge plugin-scoped backend language-server and
    external-agent registrations into runtime details and digest computation
- `internal/plugins/runtime.go`
  - runtime payloads now reuse the same combined backend registration details
    path
- `internal/app/app.go`
  - real app wiring now creates the combined backend registration loader when
    worker runtime inputs are available
- focused coverage in:
  - `internal/plugins/worker_host_test.go`
  - `internal/plugins/runtime_test.go`
  - `internal/plugins/status_test.go`
  - `internal/app/app_test.go`
  - `frontend/tests/e2e/overview/plugins/plugin-language-server-runtime.spec.ts`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestWorkerHost|TestService(Runtime|Status)' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginRuntimeAndFrontendAssets|LinksPluginRoutesAndServesRuntime|ServesPluginRuntimeWithBackendRegistrations|WritesPluginConfigAndUpdatesRuntime|HandlesPluginRescanEnableAndDisableRoutes|InstallsAndUninstallsPluginRoutes|UpdatesAndRollsBackPluginRoutes|ServesManualPluginRestartRoute)' -count=1`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts frontend/tests/e2e/overview/plugins/plugin-language-server-runtime.spec.ts`
- `git diff --check`

## Exit Criteria

- active backend language-server plugins can surface non-empty
  `registeredLanguageServers` in Go runtime/status payloads
- active backend external-agent plugins can surface non-empty
  `registeredExternalAgentAdapters` in Go runtime/status payloads
- registration load failures are plugin-scoped
- existing runtime/status callers no longer depend on hardcoded empty arrays for
  those two registration types

## Next Recommended Step

- keep plugin-defined language-server execution work deferred until the later
  LSP/runtime phase owns that lifetime boundary
- keep plugin external-agent execution ownership deferred unless a concrete
  caller needs more than registration visibility
- do not broaden into router/static-dir/MCP registration parity unless a caller
  requires it
