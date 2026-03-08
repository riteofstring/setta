# Phase 15 Plugin Config Write Transport

## Purpose

This doc narrows the next Phase 15 work to the remaining direct frontend plugin
config write gap after the landed runtime-read and asset-serving slice:

- `POST /plugins/config`

The goal is to move plugin-config persistence and validation onto the existing
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
- Python still owns the config write transport and validation path in:
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

## Scope

This slice should cover only:

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

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'WriteConfig|Runtime' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Plugin.*Config' -count=1`

## Open Questions

- whether a later Go-owned plugin restart slice should consume config-write
  outputs directly instead of relying on the existing frontend runtime refresh
  path
  - recommendation: no; keep restart behavior as a separate explicit slice

## Next Recommended Step

- implement the bounded Go-owned `POST /plugins/config` path described here
- if that lands cleanly, the next remaining direct frontend plugin transport
  gap becomes `POST /plugins/restart`
