# Phase 15 Plugin Lifecycle Mutation Transport

## Purpose

This doc tracks the remaining direct frontend plugin mutation transport work
after the landed runtime-read, config-write, and restart slices.

The remaining caller-backed routes are:

- `POST /plugins/rescan`
- `POST /plugins/enable`
- `POST /plugins/disable`
- `POST /plugins/install`
- `POST /plugins/uninstall`
- `POST /plugins/update`
- `POST /plugins/rollback`

The goal is to move those direct frontend HTTP transports onto the existing Go
plugin service without broadening into backend plugin registration runtime
parity, new install orchestration beyond the current service contract, or
adjacent unused HTTP routes.

## Status

Current repo status as of 2026-03-09:

- Go already owns:
  - `GET /plugins/runtime`
  - `/plugins/{pluginId}/{assetPath:path}`
  - `POST /plugins/config`
  - `POST /plugins/restart`
- Slice A in this doc is now landed:
  - `POST /plugins/rescan`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
- Slice B in this doc is now landed:
  - `POST /plugins/install`
  - `POST /plugins/uninstall`
- `internal/plugins/service.go` already owns the source-of-truth mutation
  semantics for:
  - `Rescan()`
  - `Enable(...)`
  - `Disable(...)`
  - `Install(...)`
  - `Uninstall(...)`
  - `Update(...)`
  - `Rollback(...)`
- current direct frontend callers in
  `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx` use:
  - `route_plugins_rescan(...)`
  - `route_plugins_enable(...)`
  - `route_plugins_disable(...)`
  - `route_plugins_install(...)`
  - `route_plugins_uninstall(...)`
  - `route_plugins_update(...)`
  - `route_plugins_rollback(...)`
- Python still owns the HTTP transport for those routes in:
  - `backend/setta/routers/plugins.py`
  - `backend/setta/plugins/manager.py`

Inventory notes that matter for sequencing:

- `route_plugins_link(...)` is generated but has no current direct frontend
  caller in `frontend/src`
- `route_plugins_lock_write(...)` and `route_plugins_lock_apply(...)` likewise
  have no current direct frontend caller
- `Update(...)` and `Rollback(...)` depend on the same install-metadata and
  source-spec pathways already exercised by `Install(...)` and `Uninstall(...)`

## Scope

This plan covers only:

- thin Go HTTP transport for the caller-backed lifecycle routes listed above
- any small route-local or service-local response shaping needed to preserve
  the current direct frontend contracts
- focused Go tests for route, service, and real-app wiring of those routes
- doc updates as each bounded sub-slice lands

## Non-Goals

- `POST /plugins/link`
- `POST /plugins/lock/write`
- `POST /plugins/lock/apply`
- higher-level Go backend plugin runtime ownership for:
  - backend route registration
  - language-server registrations
  - external-agent-adapter registrations
  - codegen-target registrations
- plugin UI redesign or workflow changes in the frontend pane
- heuristic install/source-resolution shortcuts

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-config-write-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-restart-transport.md`
- `backend/setta/routers/plugins.py`
- `backend/setta/plugins/errors.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/plugins/models.py`
- `backend/setta/types/routes.py`
- `tests/routers/test_plugin_routes.py`
- `tests/plugins/test_plugin_manager.py`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/utils/generatedEndpoints.ts`
- `internal/plugins/service.go`
- `internal/plugins/mutation_types.go`
- `internal/httpapi/plugin_routes.go`
- `internal/httpapi/plugin_routes_test.go`
- `internal/app/app.go`

## Working Decisions

- keep transport thin
  - route handlers should decode request JSON, enforce IDE-only access, call
    the shared plugin service, map service errors, and serialize the result
- keep mutation semantics in `internal/plugins`
  - enablement, install metadata, rollback history, and pending-restart
    bookkeeping already belong to the shared service
- sequence by dependency and caller value, not by route count
  - take the smallest caller-backed slice first
  - do not bundle install/update/rollback into the same change unless the code
    proves they must move together
- keep direct frontend response contracts explicit
  - do not leak broader Go-only payloads like the full `DiscoverySnapshot`
    where the frontend currently expects a narrower response
- defer adjacent non-caller routes
  - `link` and `lock*` should stay out until they become direct blockers or a
    bounded dependency requires them

## Recommended Sequencing

### Slice A

Move the smallest direct frontend lifecycle transport cluster:

- `POST /plugins/rescan`
- `POST /plugins/enable`
- `POST /plugins/disable`

Rationale:

- `Enable(...)` and `Disable(...)` already expose the exact result contract
  needed by the frontend
- `Rescan()` is already implemented and only needs bounded response shaping
- this slice proves the thin-route pattern for the remaining lifecycle writes
  without introducing candidate-provider or install-metadata complexity

Status:

- landed
- Go now owns thin IDE-only transport for:
  - `POST /plugins/rescan`
  - `POST /plugins/enable`
  - `POST /plugins/disable`
- `Rescan()` is now narrowed at the route layer to the existing direct
  frontend response contract:
  - `schemaVersion`
  - `serverMode`
  - `installedPlugins`
  - `activePlugins`

### Slice B

Move the direct install/remove flows:

- `POST /plugins/install`
- `POST /plugins/uninstall`

Rationale:

- these are the next direct pane actions after enable/disable
- both route through the existing service/store/candidate-provider boundary
- uninstall and install share restart-required and source-of-truth filesystem
  mutation concerns

Status:

- landed
- Go now owns thin IDE-only transport for:
  - `POST /plugins/install`
  - `POST /plugins/uninstall`
- the shared install result now includes the direct frontend fields already
  consumed by the install confirmation UI:
  - `sourceScopeLabel`
  - `trustStatus`
  - `trustWarning`
- the real IDE app now wires the production candidate provider into the shared
  plugin service instead of preserving the older provider-unavailable runtime

### Slice C

Move the metadata-backed version-change flows:

- `POST /plugins/update`
- `POST /plugins/rollback`

Rationale:

- both depend on install metadata and rollback-history correctness
- both are easiest to verify once install/uninstall transport is already in
  place and covered

### Deferred Unless Needed

- `POST /plugins/link`
- `POST /plugins/lock/write`
- `POST /plugins/lock/apply`

Recommendation:

- leave them Python-owned until they become caller-backed or needed by a
  concrete follow-on boundary

## Decisions Made

- keep `rescan` response shaping in the route layer
  - the shared service still returns the broader `DiscoverySnapshot` used by
    other Go-owned callers
  - the HTTP transport now narrows that snapshot to the existing frontend
    contract instead of broadening the wire payload
- reuse one enable/disable request decoder
  - the transport stays thin and route-local while both endpoints continue to
    call the existing shared service methods directly
- keep share/app blocking at the route layer only
  - no mode-policy branching was added to the shared lifecycle semantics
- wire the real app to the production candidate provider for Slice B
  - direct frontend install cannot be considered landed if the shared app
    service still has a nil candidate-provider boundary
  - the older provider-unavailable app behavior is no longer correct for the
    current rewrite state and has been removed
- keep install response enrichment in the shared service
  - both direct HTTP routes and existing MCP tool results should come from the
    same install source-of-truth payload instead of route-local patching

## Landed in Slice A

- `internal/httpapi/plugin_routes.go`
  - thin IDE-only transport for:
    - `POST /plugins/rescan`
    - `POST /plugins/enable`
    - `POST /plugins/disable`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new plugin lifecycle route names
- focused coverage in:
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`

## Landed in Slice B

- `internal/plugins/mutation_types.go`
  - direct frontend install result fields now exist in the shared typed result
    payload
- `internal/plugins/service.go`
  - install results now include:
    - `sourceScopeLabel`
    - `trustStatus`
    - `trustWarning`
- `internal/httpapi/plugin_routes.go`
  - thin IDE-only transport for:
    - `POST /plugins/install`
    - `POST /plugins/uninstall`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new install/uninstall route names
- `internal/app/app.go`
  - real app wiring now attaches the production candidate provider to the
    shared plugin service
- focused coverage in:
  - `internal/plugins/service_test.go`
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`
  - `internal/app/mcp_plugin_management_test.go`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestService(InstallUpdateRollbackAndUninstallLifecycle|BackendUninstallSurfacesPendingRestartTombstone)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Plugin.*(InstallsAndUninstallsPluginRoutes|HandlesPluginRescanEnableAndDisable|RuntimeAndFrontendAssets|WritesPluginConfig|ServesManualPluginRestartRoute)|TestAppIDEMCP(ServerSupportsPluginManagementToolsOverAuthenticatedSSE|ToolCallRouteSupportsPluginManagementTools)' -count=1`
- `git diff --check`

## Immediate Next Step

Implement Slice C end-to-end:

1. add thin IDE-only Go transport for `update` and `rollback`
2. keep update/rollback payloads aligned with the current direct frontend
   contract over the existing install-metadata and rollback-history owners
3. add focused route tests for invalid JSON, missing metadata/history,
   local-source rejection, and share-mode blocking
4. add one real-app test proving metadata-backed update or rollback behavior
   over the production candidate-provider boundary without adding heuristics

## Open Questions

- whether `link` should stay deferred even if Python route coverage still
  touches it
  - recommendation: yes; test-only adjacency is not enough reason to broaden
    the direct frontend rewrite slice
