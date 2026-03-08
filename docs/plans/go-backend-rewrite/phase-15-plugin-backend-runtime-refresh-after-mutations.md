# Phase 15 Plugin Backend Runtime Refresh After Mutations

## Purpose

This doc scopes the next bounded Phase 15 follow-on: refreshing the live
IDE-mode plugin backend runtime after plugin-set mutations instead of keeping
the startup snapshot until manual restart.

The goal is to make the current Go-owned plugin mutation callers update live
backend route, MCP-tool, static-dir, and listener-endpoint ownership through a
single explicit runtime-refresh boundary.

## Status

Planned.

## Scope

This slice covers:

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
- plugin-defined language-server runtime refresh
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

## Working Decisions

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
- keep the refresh trigger explicit
  - only the mutation flows in this doc trigger runtime rebuilds
  - read routes stay thin and do not try to self-heal or lazily rebuild on
    demand

## Implementation

### Slice 1: Refreshable Runtime And Dynamic Transport

Planned:

- add a refreshable holder for the current `BackendRouteRuntime`
- add runtime route matching inside `internal/plugins` using chi-compatible
  matching over the registered plugin backend patterns
- switch `internal/httpapi.RegisterPluginBackendRoutes(...)` from startup-time
  per-route registration to a catch-all runtime dispatcher
- keep plugin static-asset and listener-endpoint callers on the same holder so
  swaps update every live transport consumer together

Done when:

- installing or removing a backend-route-owning plugin no longer requires app
  restart for HTTP route ownership changes
- unmatched plugin backend paths return normal API 404 / 405 envelopes instead
  of worker transport errors

### Slice 2: MCP Tool Replacement Support

Planned:

- add explicit remove/replace support in `internal/mcpx.Server`
- remove plugin-owned tool names from both the SDK server and the internal tool
  registry/search index before registering refreshed names
- keep built-in tools untouched during plugin refresh

Done when:

- newly installed plugin MCP tools appear in `tools/list` without restart
- disabled or removed plugin MCP tools disappear from `tools/list` and reject
  further calls

### Slice 3: Mutation Wrapper And Pending-Restart Convergence

Planned:

- add an app-owned wrapper around the Go plugin mutation service for live IDE
  use
- after successful backend-affecting mutations:
  - build the next runtime
  - replace plugin MCP tools
  - swap the runtime holder
  - clear pending-restart backend ids / removed-plugin tombstones through an
    explicit Go service hook
- leave mutations that do not affect backend ownership on the existing thin
  service path

Done when:

- the live IDE app reports backend plugin mutations as already applied when the
  refresh succeeds
- `/plugins/runtime` no longer stays stuck in `pending_restart` for those live
  app mutation flows

### Slice 4: Verification And Closeout

Planned:

- add runtime matcher tests in `internal/plugins`
- extend `internal/httpapi` tests to cover dynamic route dispatch plus 404 / 405
- extend `internal/mcpx` tests for plugin tool removal/replacement
- add real app tests proving live refresh after:
  - install / uninstall
  - enable / disable
  - rescan
  - at least one MCP-tool-owning backend plugin flow

## Verification Plan

- `./scripts/go.sh test ./internal/plugins -run 'TestBackendRouteRuntime|TestBackendRuntimeHolder|TestService.*BackendRuntime' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPlugin' -count=1`
- `./scripts/go.sh test ./internal/mcpx -run 'TestServer.*Tool' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp.*Plugin.*Runtime' -count=1`
- `git diff --check`

## Open Questions

- No blocking design question remains for this bounded slice.
- If a later concrete caller needs plugin-defined language-server,
  external-agent, or codegen-target hot refresh, that should start as a
  separate follow-on instead of being silently folded into this work.

## Next Recommended Step

Implement Slice 1 first so the app has a real refreshable runtime boundary
before mutating the live MCP registry or adjusting mutation responses.
