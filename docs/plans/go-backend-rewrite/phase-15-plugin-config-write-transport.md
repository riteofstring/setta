# Phase 15 Plugin Config Write Transport

## Purpose

This doc records the landed bounded Phase 15 follow-on for the remaining direct
frontend plugin config write gap after the runtime-read and asset-serving slice:

- `POST /plugins/config`

The goal was to move plugin-config persistence and validation onto the existing
Go plugin service without broadening into restart orchestration, install/link
flows, or higher-level backend plugin registration ownership.

## Status

Current repo status as of 2026-03-09:

- Go already owns:
  - plugin discovery and precedence resolution in `internal/plugins/discovery.go`
  - plugin lifecycle mutation foundations in `internal/plugins/service.go`
  - direct frontend plugin runtime read + asset transport in:
    - `internal/plugins/runtime.go`
    - `internal/httpapi/plugin_routes.go`
    - `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- the current direct frontend plugin config editor still calls:
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
  - generated `route_plugins_config(...)`
- Python owned the config write transport and validation path in:
  - `backend/setta/routers/plugins.py`
  - `backend/setta/plugins/manager.py`

Current Python behavior relevant to this slice:

- the route is IDE-only
- the transport is thin:
  - decode `{pluginId, config}`
  - call `write_plugin_config(...)`
- the manager:
  - resolves the highest-precedence plugin entry for the id
  - rejects missing plugins
  - rejects entries without a manifest/config surface
  - validates config against `configSchemaPath` when present
  - persists config under `pluginConfigById["{scope}:{pluginId}"]`
  - rescans so runtime/status reads observe the update
  - returns:
    - `pluginId`
    - `config`
    - `validation: {"ok": true}`

Landed in this slice:

- Go now owns the direct frontend plugin config write route:
  - `POST /plugins/config`
- `internal/plugins` now owns:
  - highest-precedence plugin config write resolution
  - schema-backed config validation
  - persistence into `plugins_state.json`
  - runtime readback over the existing rescan path
- focused coverage now exists in:
  - `internal/plugins/config_write_test.go`
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`

## Scope

This slice covered only:

- a Go-owned plugin config-write owner in `internal/plugins`
- schema-backed plugin config validation using a robust JSON-schema pathway
- persistence into the existing `plugins_state.json` source of truth
- thin IDE-only Go HTTP transport for:
  - `POST /plugins/config`
- focused tests for:
  - successful config write and runtime readback
  - invalid config rejection
  - missing-plugin rejection
  - invalid JSON and IDE-mode gating at the route layer

## Non-Goals

- `POST /plugins/restart`
- install/link/enable/disable/update/rollback HTTP routes
- websocket fan-out for plugin config changes
- backend worker/plugin registration runtime ownership
- plugin config path-by-path mutation helpers used by backend UI settings

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `backend/setta/routers/plugins.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/models.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/plugins/runtime.ts`
- `internal/plugins/service.go`
- `internal/plugins/runtime.go`
- `internal/plugins/store.go`
- `internal/httpapi/plugin_routes.go`
- `internal/app/app.go`

## Working Decisions

- keep transport thin
  - HTTP should decode request JSON, enforce IDE-only access, map service
    errors, and write JSON only
- keep config validation and persistence in `internal/plugins`
  - plugin config semantics belong with plugin discovery/store ownership, not
    route handlers
- use a robust schema-validation path
  - prefer a real JSON-schema validator over handwritten keyword checks
  - do not add heuristic fallback validation
- keep persistence keyed by the active highest-precedence entry scope
  - the runtime read path already treats `pluginConfigById["{scope}:{pluginId}"]`
    as the source of truth
- do not broaden the response contract
  - the current frontend save flow only needs the saved config plus a success
    marker before it refreshes runtime state

## Recommended Design

1. Add a dedicated config-write owner in `internal/plugins`.
   - Introduce a small request/result type for plugin config writes.
   - Reuse the existing service lock and rescan path.

2. Validate config through the plugin manifest's declared schema file.
   - Resolve `configSchemaPath` relative to the active plugin root.
   - Load and validate the schema with a real JSON-schema library.
   - Return explicit plugin-scoped service errors for invalid schema or config.

3. Persist only through the existing plugin state store.
   - Load `plugins_state.json`.
   - Write `pluginConfigById["{scope}:{pluginId}"] = config`.
   - Save and rescan before returning.

4. Keep the HTTP route IDE-only and explicit.
   - Add `POST /plugins/config` beside the landed runtime route.
   - Decode a small route-local request struct.
   - Map invalid JSON to `400 invalid_json`.

## Decisions Made

- keep the transport split explicit
  - `internal/plugins` owns config validation and persistence
  - `internal/httpapi` owns JSON decode, IDE-mode gating, and HTTP error
    mapping only
- use a real JSON-schema validation path
  - Go now validates plugin config through `github.com/google/jsonschema-go`
    instead of handwritten keyword checks
  - local schema-file `$ref` resolution stays file-backed and explicit
- keep the response contract narrow
  - the route returns the saved config plus `validation: {"ok": true}`
  - restart signaling remains deferred to later runtime/read slices because the
    current frontend already refreshes `/plugins/runtime` after save

## Landed in This Slice

- `internal/plugins/config_write.go`
  - Go-owned config-write owner for highest-precedence plugin entries
  - schema-backed plugin config validation over declared `configSchemaPath`
  - persistence into scoped `pluginConfigById` state keys
- `internal/httpapi/plugin_routes.go`
  - thin IDE-only `POST /plugins/config`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new config route
- `internal/app/app.go`
  - real app wiring for the new route over the shared plugin service
- focused coverage in:
  - `internal/plugins/config_write_test.go`
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'WriteConfig|Runtime' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Plugin.*Config|PluginRuntimeAndFrontendAssets' -count=1`
- `git diff --check`

## Open Questions

- whether the later restart slice should expose config-write-specific restart
  reasoning instead of relying only on subsequent runtime refresh state
  - recommendation: keep that as a separate explicit restart/runtime decision
    once `POST /plugins/restart` is in scope

## Closeout

- the direct frontend plugin config editor no longer depends on
  `backend/setta/routers/plugins.py`
- runtime reads now observe saved plugin config purely through the Go
  `plugins_state.json` source-of-truth path
- `POST /plugins/restart` is now the next remaining direct frontend plugin
  HTTP ownership gap
