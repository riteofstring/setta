# Phase 15 Plugin Static Dir Runtime

## Purpose

This doc scopes the next bounded plugin backend-runtime slice after the landed
backend MCP tool runtime.

The goal is to make backend plugin static-directory mounts available through
the Go-owned HTTP root transport in IDE mode, without widening into listener-
endpoint dispatch, live `host.read_project_state`, or plugin runtime refresh.

## Current Status

As of 2026-03-09:

- Go already owns:
  - plugin discovery, runtime/status/config/lifecycle/link/lock transport
  - live backend route proxying for `register_router(...)`
  - plugin-defined backend MCP tool runtime
- Go now also owns backend plugin static-directory serving for
  `register_static_dir(...)` in IDE mode
- current concrete Python reference material for this gap lives in:
  - `tests/plugins/test_plugin_manager.py`
    - backend static/router fixture registration
    - malformed static-dir payload rejection
    - partial-registration rollback expectations
  - `tests/routers/test_plugin_routes.py`
    - linked backend static-router fixture serving `/plugin-static/...`
  - `tests/fixtures/plugins/backend-static-router/`
- Go plugin frontend asset serving under `/plugins/{pluginId}/...` remains
  separate from backend static-dir serving under
  `/plugin-static/{pluginId}/...`
- worker-host dispatch now implements `host.register_static_dir` and the
  backend runtime captures typed static-dir registrations during plugin startup

## Scope

This slice should cover only:

- worker-host support for `host.register_static_dir`
- typed Go registration capture for backend static-dir mounts
- IDE startup/runtime ownership for plugins that register static dirs
- HTTP root serving for `/plugin-static/{pluginId}/...`
- focused tests proving:
  - static-dir registration normalization
  - static file serving for the backend static-router fixture
  - mixed route + static-dir plugin startup
  - traversal / not-found handling

## Non-Goals

- plugin listener-endpoint registration or dispatch
- `host.read_project_state` support for backend plugins
- plugin static-dir serving in share/app modes
- plugin runtime refresh after install/link/rescan/update flows
- new plugin runtime payload fields for static-dir discovery

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-route-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-mcp-tool-runtime.md`
- `backend/setta/plugins/worker.py`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/routers/test_plugin_routes.py`
- `tests/fixtures/plugins/backend-static-router/`
- `internal/plugins/worker_host.go`
- `internal/plugins/backend_route_runtime.go`
- `internal/plugins/runtime.go`
- `internal/httpapi/plugin_routes.go`
- `internal/app/app.go`

## Working Decisions

- keep static-dir ownership explicit
  - capture mount registrations from the worker instead of guessing from the
    filesystem or manifest
- reuse the existing backend runtime startup boundary
  - route/tool/static backend plugins should share one startup path
  - static-dir-only plugins do not need a live worker session after
    registration capture
- keep root transport thin
  - `internal/httpapi` should only decode the request path and delegate to a
    typed static-dir resolver
- keep serving bounded to IDE mode
  - do not widen static-dir transport into share/app until a caller needs it

## Landed Design

1. Worker-host static-dir registration is now typed and validated.
   - `host.register_static_dir` now normalizes `urlPrefix`.
   - static-dir paths resolve relative to the plugin root and must exist as
     directories.

2. `internal/plugins` now owns a typed static-dir registry.
   - registrations store plugin id, normalized mount prefix, and source root
   - duplicate prefix registration within one plugin is rejected explicitly

3. The existing backend runtime startup path now covers route/tool/static
   plugins together.
   - route, MCP-tool, and static-dir plugins all start through the same worker
     launcher/runtime boundary
   - static-dir-only plugins close their worker session after registration
     capture because later file serving does not need live worker calls
   - mixed route+static plugins keep one live worker session for the route
     side while static serving resolves directly from registered source roots

4. Go now serves `/plugin-static/{pluginId}/...` from thin root transport.
   - `internal/httpapi` decodes the request path and delegates to the backend
     runtime resolver
   - path traversal still maps to `PLUGIN_ASSET_INVALID_PATH`
   - unknown plugins / missing files still map to HTTP 404
   - only regular files are served

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'Test(WorkerHostRegister(StaticDir(NormalizesRegistration|RequiresCapability)|MCPTool(NormalizesRegistration|RequiresCapability)|Router(NormalizesRegistration|RequiresCapability))|BackendRouteRuntime(ProxiesFixtureRoutePayloads|InvokesToolOnlyFixtureMCPTools|SupportsMixedRouteAndMCPFixtures|ResolvesStaticOnlyFixtureAssets|SupportsMixedRouteAndStaticFixtures))' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterPlugin(RootRoutes(ServesFrontendAssetsAndImmutableCache|RejectsTraversalAndUnknownPlugins|ServesBackendStaticAssets|RejectsBackendStaticTraversalAndUnknownPlugins)|BackendRoutesProxiesWorkerPayloads)' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginBackendRoutes|ServesPluginBackendStaticAssets|ServesPluginRuntimeWithBackendRegistrations)' -count=1`

## Decisions

- keep frontend and backend asset roots separate
  - `/plugins/{pluginId}/...` still resolves declared frontend assets through
    the plugin service
  - `/plugin-static/{pluginId}/...` now resolves worker-registered backend
    static directories through the backend runtime
- keep static-dir lifetime explicit
  - a live worker is only retained when the plugin also owns routes or MCP
    tools
  - static-dir-only plugins register, persist typed source roots, and shut down
    immediately

## Open Questions

- No blocking question remains inside this bounded slice.
- The listener-endpoint registration/dispatch and
  `host.read_project_state` follow-ons that were deferred here landed later in:
  - `phase-15-plugin-read-project-state-and-listener-registration-runtime.md`
  - `phase-15-plugin-listener-endpoint-websocket-dispatch.md`
- The remaining deferred follow-on from this slice is plugin runtime refresh
  after install/link/rescan/update flows.

## Next Recommended Step

Do not broaden plugin backend-host ownership speculatively.

The next plugin follow-on should only be pulled forward when a concrete caller
requires one of:

1. plugin runtime refresh/hot-reload after mutation flows
2. built-in listener endpoint dispatch with a Go-owned source of truth
3. listener temporary-id negotiation on the Go websocket route
