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
- Go does not yet own backend plugin static-directory serving for
  `register_static_dir(...)`
- current concrete Python reference material for this gap lives in:
  - `tests/plugins/test_plugin_manager.py`
    - backend static/router fixture registration
    - malformed static-dir payload rejection
    - partial-registration rollback expectations
  - `tests/routers/test_plugin_routes.py`
    - linked backend static-router fixture serving `/plugin-static/...`
  - `tests/fixtures/plugins/backend-static-router/`
- current Go plugin asset serving under `/plugins/{pluginId}/...` only exposes
  declared frontend asset roots via `plugins.Service.ResolveAssetPath(...)`
- current Go worker launcher allowlist already includes
  `host.register_static_dir`, but `internal/plugins/worker_host.go` does not
  implement it yet

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

## Recommended Design

1. Add worker-host static-dir registration support.
   - Validate `urlPrefix` and `path`.
   - Resolve the source directory relative to the plugin root.

2. Add a typed static-dir registry in `internal/plugins`.
   - Store plugin id, normalized mount prefix, and source root.

3. Extend the existing backend runtime startup path.
   - Start plugins that own routes, MCP tools, and/or static dirs.
   - Keep the worker session only when later live calls are needed.

4. Add root HTTP serving for `/plugin-static/{pluginId}/...`.
   - Resolve the request against registered static-dir mounts.
   - Preserve traversal rejection and regular-file-only serving.

## Test Strategy

- `internal/plugins`
  - worker-host static-dir registration validation
  - backend runtime capture for static-dir-only and mixed route+static plugins
  - static asset path resolution and traversal rejection
- `internal/httpapi`
  - `/plugin-static/{pluginId}/...` serving
  - not-found / invalid-path behavior
- `internal/app`
  - real app serves the backend static-router fixture

## Next Recommended Step

Implement this slice in a bounded way:

1. worker-host static-dir registration support
2. backend runtime static-dir capture/resolution
3. root transport serving at `/plugin-static/{pluginId}/...`
4. focused plugin/http/app tests
