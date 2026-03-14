# Phase 15 Plugin Link Transport

## Purpose

This doc records the bounded Phase 15 follow-on that moved `POST /plugins/link`
onto the shared Go plugin service after the landed direct
runtime/config/restart/lifecycle route work and the landed backend codegen
registration runtime slice.

`internal/plugins` already owns local plugin linking through `Link(...)`, but
Go still does not expose `POST /plugins/link`. That route is not a current
`frontend/src` caller, but it is the concrete setup dependency for many plugin
end-to-end and manual verification flows:

- `frontend/tests/e2e/overview/plugins/plugins-pane.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-external-agent.spec.ts`

The goal here was to land only the thin Go transport for `POST /plugins/link`
over the existing shared plugin service, without broadening into lockfile
routes or a new backend plugin runtime.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- Go already owns:
  - `GET /plugins/runtime`
  - `/plugins/{pluginId}/{assetPath:path}`
  - `POST /plugins/config`
  - `POST /plugins/restart`
  - `POST /plugins/rescan`
  - `POST /plugins/install`
  - `POST /plugins/uninstall`
  - `POST /plugins/update`
  - `POST /plugins/rollback`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
- `internal/plugins/authoring.go` already owns:
  - `Link(...)`
  - local plugin validation
  - symlink activation
  - local install metadata persistence
  - restart-required handling for backend-linked plugins
- Go now owns thin IDE-only `POST /plugins/link` transport in:
  - `internal/httpapi/plugin_routes.go`
  - `internal/httpapi/route_names.go`
- the real app now exposes that route through the shared plugin service, so
  local-link setup works for existing plugin E2E/manual flows
- `POST /plugins/lock/write` and `POST /plugins/lock/apply` remain deferred and
  have no current frontend caller dependency

## Scope

This slice covered only:

- thin Go HTTP transport for `POST /plugins/link`
- any small shared-result shaping needed so the route returns the existing
  `PluginInstallResult` contract cleanly
- focused Go route and real-app coverage for local plugin linking
- doc updates once this slice lands

## Non-Goals

- `POST /plugins/lock/write`
- `POST /plugins/lock/apply`
- lockfile inventory or reconciliation changes
- backend language-server registration runtime work
- backend external-agent registration runtime work
- backend route/static/UI-setting registration work

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-lifecycle-mutation-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-backend-codegen-registration-runtime.md`
- `backend/setta/routers/plugins.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/tests/e2e/overview/plugins/plugins-pane.spec.ts`
- `frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `internal/plugins/authoring.go`
- `internal/plugins/authoring_test.go`
- `internal/httpapi/plugin_routes.go`
- `internal/httpapi/plugin_routes_test.go`
- `internal/app/app.go`

## Working Decisions

- keep the route thin
  - decode JSON
  - enforce IDE-only access
  - call `Service.Link(...)`
  - map existing service errors
  - serialize the shared typed result
- do not reopen `install` semantics for local plugin roots
  - local linking already has separate shared-service semantics and metadata
  - do not paper over that with install-route heuristics
- keep `lock*` deferred
  - they are adjacent only by old Python router shape, not by a current caller
    or implementation dependency
- treat this route as a verification and developer-workflow dependency
  - the missing route currently blocks many plugin E2E/manual flows even though
    it is not a direct `frontend/src` production caller

## Landed Work

- `internal/plugins/authoring.go`
  - shared local-link results now include:
    - `sourceScopeLabel`
    - `trustStatus`
    - `trustWarning`
- `internal/httpapi/plugin_routes.go`
  - thin IDE-only transport for:
    - `POST /plugins/link`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new link route name
- focused coverage in:
  - `internal/plugins/authoring_test.go`
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`
- existing Playwright plugin-codegen target flow now runs end-to-end against
  the Go app because the setup dependency on `POST /plugins/link` is gone

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestService(Link|InitTemplate|ValidateFolder)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPluginRoutes(LinksLocalPlugin|MapsLinkSourceValidationErrors|RejectInvalidJSONForLink|BlocksLifecycleSlicesOutsideIDE)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(LinksPluginRoutesAndServesRuntime|ServesPluginRuntimeAndFrontendAssets|WritesPluginConfigAndUpdatesRuntime|HandlesPluginRescanEnableAndDisableRoutes|InstallsAndUninstallsPluginRoutes|UpdatesAndRollsBackPluginRoutes|ServesManualPluginRestartRoute|ServesPluginRuntimeWithBackendCodegenRegistrations)' -count=1`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-codegen-target.spec.ts`
- `git diff --check`

## Next Recommended Step

- keep `POST /plugins/lock/write` and `POST /plugins/lock/apply` deferred
  unless they become caller-backed or a bounded dependency requires them
- if plugin follow-on work resumes beyond this route, take a concrete
  higher-level backend runtime slice only when a caller needs it
  - likely candidates remain language-server or external-agent registration
    ownership

## Open Questions

- whether `lock*` should be pulled forward now that `link` is landed
  - recommendation: no; adjacency to the old Python router shape is still not a
    good enough reason without a real caller or dependency
