# Phase 15 Plugin Backend Runtime Refresh After Mutations

## Purpose

This doc records the bounded Phase 15 follow-on that moved live IDE-mode plugin
backend runtime refresh after plugin-set mutations into Go.

The goal was to make the existing Go-owned plugin mutation callers update live
backend route, MCP-tool, static-dir, and listener-endpoint ownership through a
single explicit runtime-refresh boundary instead of leaving the startup backend
snapshot in place until manual restart.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- Go now refreshes the live IDE-mode plugin backend runtime after successful:
  - `POST /plugins/rescan`
  - `POST /plugins/install`
  - `POST /plugins/link`
  - `POST /plugins/uninstall`
  - `POST /plugins/update`
  - `POST /plugins/rollback`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
  - `POST /plugins/lock/apply`
- backend plugin HTTP transport now resolves routes dynamically against the
  current runtime instead of depending on chi registrations frozen at startup
- plugin-owned MCP tools now refresh as a set on the live authenticated Go MCP
  server during those mutation flows
- the refresh boundary now builds the next runtime from an explicit preview
  snapshot that reflects the post-refresh plugin state before persisted
  pending-restart cleanup is committed

## Scope

This slice covers only:

- live IDE-mode refresh of the Go plugin backend runtime after successful:
  - `POST /plugins/rescan`
  - `POST /plugins/install`
  - `POST /plugins/link`
  - `POST /plugins/uninstall`
  - `POST /plugins/update`
  - `POST /plugins/rollback`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
  - `POST /plugins/lock/apply`
- dynamic backend-route dispatch so newly added or removed plugin routes do not
  require startup-time chi registration
- live replacement of plugin-defined MCP tools on the authenticated Go MCP
  server
- runtime-owner updates for:
  - backend routes
  - backend static dirs
  - backend listener endpoints
  - backend MCP tools
- focused Go tests in:
  - `internal/plugins`
  - `internal/httpapi`
  - `internal/mcpx`
  - `internal/app`

## Non-Goals

- plugin config-write-triggered backend runtime reload
- plugin-defined language-server runtime refresh in this slice
  - that later landed separately in
    `phase-15-plugin-language-server-runtime-refresh-after-plugin-mutations.md`
- plugin-defined external-agent adapter runtime refresh
- plugin-defined codegen-target runtime refresh
- built-in listener endpoint dispatch
- listener temporary-id negotiation
- share/app-mode plugin backend-host ownership changes

## Inputs

- `docs/plans/go-backend-rewrite/phase-15-plugin-lifecycle-mutation-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-mcp-tool-runtime.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-static-dir-runtime.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-read-project-state-and-listener-registration-runtime.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-listener-endpoint-websocket-dispatch.md`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/app/app.go`
- `internal/httpapi/plugin_backend_routes.go`
- `internal/httpapi/plugin_routes.go`
- `internal/mcpx/server.go`
- `internal/plugins/backend_route_runtime.go`
- `internal/plugins/service.go`

## Decisions Made

- treat the live backend runtime as an explicit app-owned refreshable boundary
  - keep `internal/plugins.BackendRouteRuntime` immutable once built
  - add a thin holder/owner above it instead of mutating route/tool/session
    maps in place
- replace startup-only backend-route registration with runtime matching
  - register one catch-all authenticated backend plugin route transport
  - resolve method/path against the current runtime at request time
  - preserve 404 vs 405 semantics from the Go HTTP layer instead of returning a
    generic worker error for unmatched paths
- replace plugin MCP tools as a set
  - use the Go MCP server and registry as the source of truth
  - remove old plugin tool names before exposing new ones
  - preflight conflicts against non-plugin tools before mutating the live MCP
    registry
- do not preserve restart-gated backend mutation behavior in the live IDE app
  - the app refresh boundary should clear persisted pending-restart backend ids
    only after the new runtime is ready
  - direct mutation responses should reflect the live post-refresh state instead
    of a stale `restartRequired=true` marker when refresh succeeds
- build refreshed runtime ownership from a preview snapshot
  - `internal/plugins.Service` now exposes a post-refresh discovery preview
    that clears pending-restart ids and omits uninstall tombstones without
    persisting that cleanup yet
  - `internal/plugins.NewBackendRouteRuntime(...)` now accepts an explicit
    discovery snapshot so the refreshed runtime can be built from that preview
  - this keeps disabled/uninstalled backends out of the live runtime before the
    persisted cleanup commit while preserving the explicit commit step
- keep the refresh trigger explicit
  - only the mutation flows in this doc trigger runtime rebuilds
  - read routes stay thin and do not try to self-heal or lazily rebuild on
    demand

## Landed Work

- `internal/plugins`
  - added `BackendRuntimeHolder` as the app-owned refreshable runtime boundary
  - added chi-compatible runtime route matching plus allowed-method lookup in
    `BackendRouteRuntime`
  - added `Service.PreviewBackendRuntimeRefresh()` so the app can build the
    next runtime from the post-refresh discovery view before persisting cleanup
  - kept `CommitBackendRuntimeRefresh()` as the explicit persisted convergence
    step for pending-restart ids and uninstall tombstones
- `internal/httpapi`
  - replaced startup-time backend plugin route registration with one catch-all
    dispatcher that resolves method/path against the current runtime
  - preserved typed 404 vs 405 API behavior for unmatched backend plugin paths
- `internal/mcpx`
  - added runtime plugin tool removal and replacement support on the Go MCP
    server and internal tool registry/search index
- `internal/app`
  - wrapped the live IDE plugin mutation service with a runtime refresher that
    rebuilds route/static/listener/tool ownership after successful backend-
    affecting mutations
  - swapped the live runtime holder, updated MCP tools, then committed the
    persisted pending-restart cleanup
  - returned post-refresh mutation payloads with live `state` values and
    `restartRequired=false` when refresh succeeded
- focused app coverage now proves live refresh after:
  - install / uninstall
  - enable / disable
  - rescan
  - one backend MCP-tool-owning plugin flow

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestBackendRouteRuntime|TestBackendRuntimeHolder|TestService.*BackendRuntime' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPlugin' -count=1`
- `./scripts/go.sh test ./internal/mcpx -run 'TestServer.*Tool' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(RefreshesPluginBackendRuntimeAfterLifecycleMutations|RescanRefreshesPluginBackendRuntime|IDEMCPServerRegistersPluginBackendMCPTools|IDEMCPServerRefreshesPluginBackendMCPToolsAfterLifecycleMutations)' -count=1`
- `git diff --check`

## Deferred

- plugin config-write-triggered backend runtime reload
- plugin-defined external-agent adapter runtime refresh
- plugin-defined codegen-target runtime refresh
- built-in listener endpoint dispatch
- listener temporary-id negotiation
- share/app-mode plugin backend-host ownership changes

The later follow-on
`phase-15-plugin-language-server-runtime-refresh-after-plugin-mutations.md`
closed the plugin language-server hot-refresh gap without widening the rest of
this backend runtime-refresh boundary.

## Next Recommended Step

Do not widen plugin backend-host work speculatively.

The next plugin follow-on should only be pulled forward when a concrete caller
requires one of:

1. plugin config-write-triggered backend runtime reload
2. plugin-defined external-agent adapter or codegen-target hot refresh
3. built-in listener endpoint dispatch with a Go-owned source of truth
4. listener temporary-id negotiation on the Go websocket route
