# Phase 15 Plugin Caller And Runtime Closeout

## Purpose

This doc records the bounded closeout inventory after the landed Phase 15
plugin transport and runtime slices.

The goal of this closeout was to verify whether any real caller-backed plugin
gap still remained after Go took ownership of:

- direct frontend plugin runtime/config/restart/lifecycle transport
- plugin backend registration visibility in runtime/status payloads
- live IDE-mode backend route, MCP-tool, static-dir, and listener runtime
- plugin-defined language-server execution for `Code` sections
- live language-server spec refresh after plugin-set mutations

## Current Status

Completed before this closeout:

- Phase 14 bounded agentic runtime and stabilization closeout
- the full caller-backed Phase 15 plugin slice set recorded in the Phase 15
  docs under this folder

Current Go state after this closeout:

- `internal/httpapi/plugin_routes.go`
  - owns the direct frontend plugin transport surface:
    - `GET /plugins/runtime`
    - `POST /plugins/config`
    - `POST /plugins/restart`
    - `POST /plugins/rescan`
    - `POST /plugins/install`
    - `POST /plugins/link`
    - `POST /plugins/uninstall`
    - `POST /plugins/update`
    - `POST /plugins/rollback`
    - `POST /plugins/enable`
    - `POST /plugins/disable`
    - `POST /plugins/lock/write`
    - `POST /plugins/lock/apply`
- `internal/httpapi/plugin_backend_routes.go`
  - owns live IDE-mode backend plugin route dispatch at
    `/api/plugins/{pluginId}/...`
- `internal/plugins`
  - owns discovery, precedence, persistence, backend registration loading,
    runtime/status shaping, backend runtime ownership, and plugin codegen
    worker-spec resolution
- `internal/lsp`
  - owns app-level plugin language-server routing for active `Code` sections
- `frontend/src/plugins/runtime.ts`
  - still treats `GET /plugins/runtime` as the source of truth for plugin
    bootstrap, status, and registration visibility

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-config-write-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-restart-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-lifecycle-mutation-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-runtime-refresh-after-mutations.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-language-server-runtime-refresh-after-plugin-mutations.md`
- `docs/plans/go-backend-rewrite/phase-5-plugin-language-server-code-section-runtime.md`
- `frontend/src/plugins/runtime.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/Panes/Overview/RunInstructions.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectAISettings.tsx`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-language-server-runtime.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `internal/externalagentconfigs/preflight.go`
- `internal/plugins/filesystem_worker_spec_resolver.go`

## Findings

### 1. The direct frontend plugin route surface is now Go-owned

Repo search across `frontend/src` shows the active direct plugin management
callers all use the Go-owned generated endpoints for:

- runtime bootstrap
- config writes
- restart
- lifecycle mutations
- rescan

Those callers are centered in:

- `frontend/src/plugins/runtime.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/AppHeader/PluginRestartBanner.tsx`

There is no remaining direct frontend plugin route in active use that still
depends on Python for the current clean-break scope.

### 2. The caller-backed plugin runtime visibility surfaces are covered

Current frontend/plugin E2E callers already exercise the bounded runtime
visibility requirements for:

- language-server registrations
- external-agent adapter registrations
- codegen target registrations

Those callers are:

- `frontend/tests/e2e/overview/plugins/plugin-language-server-runtime.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`

The Go plugin runtime/status path now supplies those registration arrays, and
the app-owned language-server runtime also handles the caller-backed execution
path used by `plugin-language-server.spec.ts`.

### 3. Codegen does not have a separate Phase 15 hot-refresh gap

The active codegen caller path is:

- `frontend/src/components/Panes/Overview/RunInstructions.tsx`
  - reads plugin codegen registrations from plugin runtime status
- `POST /setProjectConfigCodegenTargets`
  - persists selected targets through Go project-state transport

The underlying plugin target resolution path is not startup-frozen app state.
`internal/plugins/filesystem_worker_spec_resolver.go` resolves plugin codegen
worker specs directly from the current filesystem/plugin state when validation
or generation runs.

That means there is no separate caller-backed app-level "codegen target hot
refresh" slice to pull forward today.

Focused app coverage now also proves that a backend-codegen plugin linked after
startup can immediately:

- appear in `GET /plugins/runtime` with its registered codegen target
- satisfy `POST /setProjectConfigCodegenTargets`
- materialize plugin codegen output without a restart-specific app refresh path

### 4. Plugin external-agent execution is still not a current caller-backed rewrite slice

The current plugin external-agent caller proves:

- runtime/status visibility in the plugins pane
- plugin adapter selection in AI settings

It does not prove plugin-backed external-agent execution as an active required
surface in this rewrite phase.

That remains explicit in the Go runtime:

- `internal/externalagentconfigs/preflight.go` does not treat
  `ToolTypePlugin` as a supported executable external-agent runtime
- current bounded execution ownership continues to target Codex, Claude, and
  OpenCode

So "plugin external-agent adapter hot refresh" is not hidden rewrite debt for
an active caller. It is future product/runtime work only if execution is
explicitly pulled into scope.

### 5. Config-write-triggered backend/LSP reload has no current caller-backed proof

`POST /plugins/config` is Go-owned and the active caller in
`frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` refreshes
plugin runtime state after save.

But the current fixture/test surface does not show a caller where plugin config
changes backend route ownership, language-server registration, or another
startup-owned runtime boundary that must be hot-reloaded immediately.

Without that caller-backed proof, widening config writes into backend/LSP
runtime reload would be speculative.

## Decisions Made

- treat Phase 15 as complete for the current clean-break rewrite scope
- stop describing config-write-triggered backend reload plus external-agent or
  codegen hot refresh as implied remaining Phase 15 parity gaps
- keep those items explicitly deferred until a concrete caller or product
  requirement appears
- keep future plugin follow-ons bounded to:
  - a proven config-driven backend/runtime caller
  - plugin external-agent execution ownership
  - a new plugin-backed runtime surface not already covered by filesystem or
    runtime-status source-of-truth paths

## Progress Notes

- 2026-03-09: reran the Phase 15 caller inventory after the landed
  language-server hot-refresh follow-on.
- 2026-03-09: confirmed the active direct frontend plugin route surface is
  Go-owned for the current rewrite scope.
- 2026-03-09: confirmed plugin codegen callers already resolve against current
  filesystem/plugin state and do not require a separate app-owned hot-refresh
  slice.
- 2026-03-09: added real app coverage proving a backend-codegen plugin linked
  after startup can be selected through `setProjectConfigCodegenTargets`
  immediately.
- 2026-03-09: confirmed plugin external-agent execution remains outside the
  current caller-backed scope even though runtime visibility and config
  selection are now Go-owned.

## Verification

- `./scripts/go.sh test ./internal/app -run '^TestAppServesSetProjectConfigCodegenTargetsRoute$' -count=1`
- `./scripts/go.sh test ./internal/app -run '^TestAppLinkedPluginCodegenTargetsWorkWithoutRestart$' -count=1`

## Next Recommended Step

- treat Phase 15 as complete for the current clean-break rewrite scope
- start any new work from a newly chosen caller-backed or product-backed phase
  doc instead of reopening plugin runtime work speculatively
- if plugin work is reopened later, require one of:
  - a concrete config-driven backend/runtime caller
  - explicit plugin external-agent execution requirements
  - a new plugin-owned runtime surface that is not already satisfied by the
    current Go source-of-truth paths
