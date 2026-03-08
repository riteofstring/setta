# Phase 15 Plugin Backend Route Runtime And Transport

## Purpose

This doc scopes the next higher-level plugin backend-runtime slice after the
completed Go plugin runtime/config/lifecycle transport work and the completed
backend registration-visibility slices.

Go now owns plugin discovery, status/runtime payloads, config/lifecycle
transport, and worker-backed registration loading for backend language servers,
external-agent adapters, and codegen targets.

What Go still does not own is live backend HTTP route serving for active
plugins that call `register_router(...)`.

The active frontend caller is:

- `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`

## Current Status

As of 2026-03-09:

- Go now starts an IDE-only live backend route runtime for discovered
  route-owning plugins at app startup
- Go now serves `/api/plugins/{pluginId}/...` backend plugin routes through
  long-lived worker sessions and `plugin.invoke_route`
- Go now preserves the active caller’s request/response contract for:
  - repeated query params
  - JSON and text request bodies
  - raw-body passthrough when the worker marks `needsRawBody`
  - status code, headers, media type, and JSON/text/base64 response bodies
- mixed route + language-server backend fixtures now stay loadable because the
  live route runtime absorbs route registration alongside the existing worker
  host registration surfaces

## Scope

This slice should cover only:

- a Go-owned live backend route runtime for active backend plugins in IDE mode
- startup-time worker registration for plugins that request `registerRouter`
- normalized route prefix ownership under:
  - `/api/plugins/{pluginId}`
  - optional plugin-provided sub-prefixes
- thin HTTP proxying from incoming requests to `plugin.invoke_route`
- request translation for:
  - repeated query params
  - JSON request bodies
  - text bodies
  - raw-body passthrough when the worker marks `needsRawBody`
- response translation for:
  - status code
  - headers
  - media type
  - JSON/text/base64 bodies
- focused Go app/runtime/route tests and the existing Playwright route-payload
  caller

## Non-Goals

- plugin static-dir serving
- plugin listener-endpoint runtime ownership
- plugin MCP tool runtime ownership
- `host.read_project_state` or `host.emit_listener_dependency_event` runtime
  ownership for general backend plugins
- hot-reloading backend plugin routes after `link` or lifecycle mutations
  without restart
- share/app-mode widening unless a real caller appears

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-language-server-and-external-agent-registration-runtime.md`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/worker.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`
- `internal/plugins/backend_routes.go`
- `internal/plugins/worker_host.go`
- `internal/plugins/worker_session.go`
- `internal/plugins/worker_launcher.go`
- `internal/httpapi/httpapi.go`
- `internal/httpapi/plugin_routes.go`
- `internal/app/app.go`

## Landed Implementation

The landed implementation keeps the transport thin and the worker lifetime
explicit:

- `internal/plugins` now owns a live `BackendRouteRuntime` that:
  - rescans discovery at startup
  - starts long-lived worker sessions for route-owning backend plugins
  - captures normalized route registrations
  - proxies HTTP request/response payloads over `plugin.invoke_route`
- `internal/httpapi` now owns the thin chi binding layer under
  `/api/plugins/{pluginId}/...`
- `internal/app` now wires that runtime only in IDE mode and closes it during
  app shutdown

The runtime also absorbs worker `register_language_server`,
`register_external_agent_adapter`, and `register_codegen_target` calls during
route-worker startup so mixed backend plugins do not fail registration just
because they expose more than one backend surface.

## Decisions Made

- keep backend route transport thin
  - HTTP binding and response writing stay in `internal/httpapi`
  - worker contract normalization stays in `internal/plugins`
- keep live backend worker lifetime explicit
  - startup owns worker creation
  - app shutdown owns worker close
- keep this slice IDE-only
  - no share/app widening without a concrete caller
- reuse the existing worker RPC contract
  - no second backend route protocol
- register concrete plugin-id route patterns
  - this avoids broad dynamic route shapes that could collide with existing
    `/api/plugins/runtime`-style API routes
- keep hot reload deferred
  - `link`, `rescan`, install, update, rollback, and uninstall do not
    re-register backend routes in-process yet

## Verification

The landed slice is covered by:

- `./scripts/go.sh test ./internal/plugins -run 'Test(BackendRouteRuntimeProxiesFixtureRoutePayloads|Service(Runtime|Status)|WorkerHost)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginRuntimeAndFrontendAssets|PluginLanguageServerRoutesDiagnosticsAndCompletion|ServesPluginBackendRoutes|ServesPluginRuntimeWithBackendRegistrations|LinksPluginRoutesAndServesRuntime|WritesPluginConfigAndUpdatesRuntime|HandlesPluginRescanEnableAndDisableRoutes|InstallsAndUninstallsPluginRoutes|UpdatesAndRollsBackPluginRoutes|ServesManualPluginRestartRoute)' -count=1`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`

## Open Questions

- whether a later backend-runtime owner should clear persisted
  `pending_restart` backend state on real process restart the way the Python
  runtime does, instead of leaving that to a later dedicated runtime-state
  slice
- whether the remaining listener-endpoint or broader backend host surfaces need
  live runtime ownership once a concrete caller appears

## Next Recommended Step

This route-runtime slice is complete and later bounded follow-ons for MCP tools
and static-dir serving have since landed.

Keep the remaining listener-endpoint and broader backend-host runtime
ownership caller-driven instead of speculatively broadening this route
boundary.

## Exit Criteria

This slice is now complete for its bounded scope:

- active route-owning backend plugins are started by the Go app at runtime
  startup
- `/api/plugins/{pluginId}/...` now proxies to `plugin.invoke_route`
- query, body, status, header, and media-type behavior matches the active
  backend-route caller
- focused Go tests plus
  `frontend/tests/e2e/overview/plugins/plugin-backend-route-payload.spec.ts`
  pass
