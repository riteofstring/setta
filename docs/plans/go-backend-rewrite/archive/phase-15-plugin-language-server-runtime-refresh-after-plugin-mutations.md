# Phase 15 Plugin Language-Server Runtime Refresh After Plugin Mutations

## Purpose

This doc records the bounded Phase 15 follow-on after the landed plugin
backend-runtime refresh slice and the earlier plugin language-server runtime
slice.

Go already refreshed plugin backend routes, MCP tools, static dirs, and
listener endpoints after successful plugin-set mutations. The remaining
caller-backed gap was that the app-owned LSP router still loaded plugin
language-server specs only at startup, so install/link/enable/rescan changes
did not update live diagnostics or completion routing until restart.

The goal of this slice was to refresh only plugin-provided language-server
specs from the same explicit post-mutation preview snapshot already used by the
backend runtime refresher, without widening into external-agent adapter or
codegen-target hot refresh.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- the live IDE app now refreshes plugin-defined language-server specs after
  successful:
  - `POST /plugins/rescan`
  - `POST /plugins/install`
  - `POST /plugins/link`
  - `POST /plugins/uninstall`
  - `POST /plugins/update`
  - `POST /plugins/rollback`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
  - `POST /plugins/lock/apply`
- the LSP router now treats built-in Python as a fixed base spec set and
  replaces only plugin-provided additional specs during those refreshes
- removed or changed plugin language-server specs now drop their live router
  sessions explicitly instead of leaving stale services running
- startup and post-mutation language-server snapshot loading now tolerates
  mixed backend plugins that also register unrelated backend surfaces such as
  MCP tools, static dirs, or listener endpoints

## Scope

This slice covers only:

- live IDE-mode replacement of plugin-provided language-server specs after the
  already-landed plugin mutation refresh triggers
- reuse of the existing post-refresh preview snapshot as the source of truth
  for those app-owned LSP specs
- bounded backend-registration snapshot tolerance for mixed backend plugins
  when the caller only needs language-server registrations
- focused Go coverage in:
  - `internal/lsp`
  - `internal/app`
  - `internal/plugins`

## Non-Goals

- plugin config-write-triggered backend or LSP runtime reload
- plugin-defined external-agent adapter hot refresh
- plugin-defined codegen-target hot refresh
- deployment/share-mode language-server hot refresh
- broad plugin worker supervision beyond the existing explicit refresh
  boundary

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-backend-runtime-refresh-after-mutations.md`
- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
- `docs/plans/go-backend-rewrite/archive/phase-5-plugin-language-server-code-section-runtime.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `tests/lsp/test_fixture_language_server_integration.py`
- `tests/plugins/test_plugin_manager.py`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`
- `internal/app/app.go`
- `internal/app/lsp_language_specs.go`
- `internal/app/plugin_backend_runtime_refresh.go`
- `internal/lsp/router.go`
- `internal/plugins/backend_registrations.go`

## Decisions Made

- keep the app-owned LSP boundary explicit
  - refresh plugin language-server specs through the existing app refresher
    instead of letting transport handlers rebuild router state ad hoc
- reuse the same preview snapshot already used for backend route/tool/static
  refresh
  - post-mutation app routing should come from one source of truth
  - do not reintroduce a second discovery path that can drift from the live
    backend runtime refresh
- preserve built-in Python as a non-plugin base spec
  - plugin refresh only replaces the additional plugin spec set
  - plugin registrations still cannot override Python
- tolerate mixed backend plugin registrations in the snapshot loader
  - registration loading should not fail just because one plugin entrypoint
    also calls `register_mcp_tool(...)` or other unrelated backend host
    methods
  - use explicit no-op registrars for those unrelated surfaces instead of
    broadening the language-server snapshot caller into full backend runtime
    startup
- close stale plugin language services on replacement
  - changed or removed plugin specs must tear down the old service/session so
    diagnostics and completion do not keep routing to outdated commands

## Landed Work

- `internal/lsp/router.go`
  - split router ownership into fixed `baseSpecs` plus refreshable
    `additionalSpecs`
  - added `ReplaceAdditionalSpecs(...)` to atomically replace plugin-provided
    specs and close removed/changed services
- `internal/app/lsp_language_specs.go`
  - added `appLanguageServerSpecsForSnapshot(...)` so startup and post-mutation
    refresh use the same snapshot-to-spec translation path
- `internal/app/plugin_backend_runtime_refresh.go`
  - extended the existing plugin runtime refresher to rebuild plugin
    language-server specs from the preview snapshot and push them into the live
    router before commit
- `internal/app/app.go`
  - wired the app-owned LSP router and backend registration source into the
    plugin runtime refresher
- `internal/plugins/backend_registrations.go`
  - added explicit no-op registrars for backend static-dir, MCP-tool, and
    listener-endpoint registration loading so mixed backend plugins can still
    surface language-server registrations during startup and refresh snapshots
- focused coverage now proves:
  - router-level replacement enables a plugin-defined language server after
    startup
  - app-level plugin link refresh updates diagnostics and completion routing
  - mixed backend plugin registration snapshots still load language-server
    registrations

## Verification

- `./scripts/go.sh test ./internal/lsp -run 'TestRouter|TestResolveLanguageServerSettingsWrapsNestedKey' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Test(SnapshotAppLanguageServerSpecsIncludesPluginRegistration|AppPluginLanguageServerRoutesDiagnosticsAndCompletion|AppLinkRefreshesPluginLanguageServerRouter)' -count=1`
- `./scripts/go.sh test ./internal/plugins -run 'Test(Service(RuntimeIncludesBackendRegistrations|StatusSurfacesPluginScopedBackendRegistrationErrors)|WorkerHost(RegisterExternalAgentAdapterNormalizesRegistration|RegisterListenerEndpointNormalizesRegistration|RegisterMCPToolNormalizesRegistration|RegisterStaticDirNormalizesRegistration))' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(RefreshesPluginBackendRuntimeAfterLifecycleMutations|RescanRefreshesPluginBackendRuntime|LinksPluginRoutesAndServesRuntime|ServesPluginRuntimeWithBackendRegistrations)' -count=1`
- `git diff --check`

## Open Questions

- none for the current caller-backed scope

## Next Recommended Step

Do not widen plugin hot-refresh ownership speculatively.

The next follow-on should only be pulled forward when a concrete caller needs
one of:

1. plugin config-write-triggered backend/LSP runtime reload
2. plugin-defined external-agent adapter hot refresh
3. plugin-defined codegen-target hot refresh

