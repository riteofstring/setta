# Phase 15 Plugin Runtime Read And Asset Transport

## Purpose

This doc records the landed bounded post-Phase-14 plugin-runtime read slice.

The goal was to move the direct frontend plugin-runtime hydration read onto the
Go app without broadening into the full plugin mutation/config/restart HTTP
surface or claiming a complete higher-level plugin backend-runtime migration.

## Current Status

Completed in this slice:

- Go already owns the packaged plugin CLI plus the shared plugin discovery and
  mutation foundations in:
  - `internal/plugins/discovery.go`
  - `internal/plugins/service.go`
  - `internal/plugins/status.go`
  - `internal/plugins/store.go`
- Go already owns plugin-management MCP tooling over those same mutation
  foundations.
- Go now owns the direct frontend plugin runtime route:
  - `GET /plugins/runtime`
- Go now owns the direct frontend plugin asset route:
  - `/plugins/{pluginId}/{assetPath:path}`
- `internal/plugins` now also owns:
  - plugin runtime list/status payload shaping for direct frontend bootstrap
  - share/app source/config redaction for that payload
  - declared frontend asset resolution for active plugins
- current frontend callers still bootstrap from:
  - `frontend/src/plugins/runtime.ts`
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
  - `frontend/src/components/AppHeader/PluginRestartBanner.tsx`
  - related Playwright coverage under `frontend/tests/e2e/overview/plugins/`
    and `frontend/tests/e2e/header/plugin-restart-banner.spec.ts`
- the slice intentionally does not claim a complete higher-level plugin
  backend-runtime migration:
  - registered language-server / external-agent-adapter / codegen-target arrays
    stay empty until a real Go backend plugin runtime owns those registrations
  - plugin mutation/config/restart HTTP routes remain deferred

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `backend/setta/routers/plugins.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/models.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/src/plugins/runtime.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `internal/plugins/discovery.go`
- `internal/plugins/service.go`
- `internal/plugins/status.go`
- `internal/plugins/store.go`
- `internal/httpapi/httpapi.go`
- `internal/app/app.go`

## Problem Shape

The frontend plugin bootstrap path currently depends on one Python-owned route
that is not just a thin discovery read:

1. `GET /plugins/runtime` returns two coordinated payloads:
   - `list`: active plugin entries used for frontend module/style loading,
     content availability, config hydration, and restart capability
   - `status`: full discovered-entry state used by the plugins pane and restart
     UX
2. the route also depends on a root-level asset-serving path:
   - frontend entrypoint/style URLs point at `/plugins/{pluginId}/...`
3. the current Go plugin service already owns most of the source-of-truth data:
   - filesystem and package-manager discovery
   - precedence and enablement resolution
   - pending-restart bookkeeping
   - canonical plugin state files

That makes plugin runtime read + asset serving the smallest high-leverage
frontend plugin slice.

## Scope

This slice should cover only:

- a Go-owned plugin runtime read owner in `internal/plugins` that can build:
  - active plugin list payloads for frontend bootstrap
  - discovered status payloads for the plugins pane
  - share/app redaction of source/config fields
- a Go-owned root asset-serving path for declared frontend plugin assets:
  - `/plugins/{pluginId}/{assetPath:path}`
- thin Go HTTP transport for:
  - `GET /plugins/runtime`
- app wiring for the new read/asset routes
- focused Go route/service/app tests for:
  - active list + status roundtrip
  - asset serving for declared frontend files
  - traversal / non-frontend asset rejection
  - share/app redaction behavior

Do not include:

- `POST /plugins/config`
- `POST /plugins/restart`
- `POST /plugins/install|link|enable|disable|update|rollback|lock*`
- a higher-level Go backend plugin runtime that owns:
  - backend route registration
  - language-server registrations
  - external-agent-adapter registrations
  - codegen-target registrations in direct frontend runtime payloads
- deployment packaging redesign for plugins

## Working Decisions

- keep transport thin
  - route handlers should decode path params, map service errors, and write JSON
    or files only
- keep plugin runtime payload ownership in `internal/plugins`
  - list/status shaping belongs with plugin discovery/runtime semantics, not
    `internal/httpapi`
- keep asset serving bounded to declared frontend roots
  - do not expose arbitrary plugin files
  - allow only files under the declared frontend entrypoint/style parent roots
- keep redaction explicit in share/app
  - redact source identity deterministically
  - redact config/schema payload contents while preserving `hasSchema`
- do not claim backend-registration parity yet
  - until Go owns the higher-level plugin backend runtime, direct frontend
    runtime payloads can expose deterministic discovery state plus empty
    registration arrays

## Recommended Design

1. Add a dedicated plugin runtime-read owner in `internal/plugins`.
   - Introduce typed Go payloads for:
     - plugin list entries
     - config/content/frontend descriptors
     - combined runtime response
   - Build them from the existing service/store/discovery data.

2. Reuse the existing service as the source of truth.
   - Rescan through the existing service/discovery path.
   - Build:
     - list entries from active/pending-restart plugins only
     - status entries from the full discovered snapshot

3. Keep asset URL construction injectable but deterministic.
   - Let the runtime owner accept a small URL-builder callback for declared
     frontend asset files.
   - Keep path escaping and route shape in HTTP transport.

4. Add explicit frontend asset resolution ownership in `internal/plugins`.
   - Resolve asset paths relative to the active plugin root.
   - Reject traversal and non-frontend-root file reads.

5. Wire the service in the real app, not only MCP tests.
   - Instantiate the plugin service for app modes that can serve the runtime
     route.
   - Reuse the same owner for future plugin HTTP slices instead of creating a
     second service boundary.

## Test Strategy

- add focused `internal/plugins` tests for:
  - runtime payload list/status composition
  - frontend asset URL encoding
  - share/app source redaction
  - share/app config redaction
  - asset resolution rejection for traversal and non-frontend files
- add focused `internal/httpapi` tests for:
  - `GET /plugins/runtime`
  - `/plugins/{pluginId}/{assetPath:path}`
  - root/API route wiring and error mapping
- add one app-level integration test proving the real app serves:
  - `/api/plugins/runtime`
  - a linked frontend asset

## Open Questions

- whether direct frontend runtime payloads should later include real backend
  registration data once the higher-level Go plugin runtime lands
  - recommendation: yes, but only in a separate slice above the current worker
    and discovery foundations
- whether deployment/plugin packaging needs its own follow-on before share/app
  plugin runtime behavior can be considered fully product-complete
  - recommendation: treat that as a separate packaging/runtime boundary, not as
    a blocker for this direct read transport slice

## Decisions Made

- keep the transport split explicit:
  - `internal/plugins` owns runtime payload shaping and asset-path resolution
  - `internal/httpapi` owns only route binding, URL construction, and HTTP
    error/file responses
- reuse one shared `plugins.Service` in the real app
  - the same Go service now backs MCP plugin mutations and direct runtime
    reads instead of creating separate route-only discovery state
- keep share/app payload redaction in scope now
  - source identity is deterministically redacted
  - config/schema contents are withheld while `hasSchema` stays truthful
- do not fake backend-registration parity
  - the route returns empty registration arrays until a higher-level Go plugin
    backend runtime exists

## Landed in This Slice

- `internal/plugins/runtime.go`
  - Go-owned plugin runtime list/status payloads for direct frontend callers
  - Go-owned declared frontend asset resolution for active plugins
  - deterministic share/app redaction helpers
- `internal/plugins/discovery.go`
  - blocked-capability propagation now survives into runtime/status payloads
- `internal/httpapi/plugin_routes.go`
  - thin `GET /plugins/runtime`
  - thin root asset route for declared frontend files
- `internal/app/app.go`
  - real app wiring now instantiates the shared plugin service for direct
    runtime reads and registers the new API/root routes
- focused coverage in:
  - `internal/plugins/runtime_test.go`
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'Runtime|Status|ResolveAssetPath|FilesystemWorkerSpecResolver' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'PluginRuntimeAndFrontendAssets' -count=1`

## Closeout

- the direct frontend plugin bootstrap read no longer depends on
  `backend/setta/routers/plugins.py`
- declared frontend asset serving for active plugins no longer depends on the
  Python asset router
- plugin lifecycle/config mutation HTTP routes remain the next direct frontend
  plugin ownership gap
- higher-level backend plugin runtime registration parity remains deferred and
  is no longer a hidden blocker for direct frontend plugin bootstrap

## Recommended Next Step

Write a focused follow-on doc for the next bounded plugin HTTP mutation slice.

Recommendation:

- move `POST /plugins/config` next
  - it reuses the landed runtime read owner and closes the direct
    read/edit/save loop for the plugin config editor without forcing the much
    larger install/update/restart transport cluster into the same change

## Progress Notes

- 2026-03-09: created this doc to keep the next plugin HTTP work bounded around
  the direct frontend runtime hydration path instead of widening into the full
  mutation surface.
- 2026-03-09: completed the bounded runtime-read and asset-serving slice.
  - Go now serves `GET /plugins/runtime`
  - Go now serves declared frontend plugin assets from `/plugins/...`
  - direct frontend plugin bootstrap no longer depends on the Python route
