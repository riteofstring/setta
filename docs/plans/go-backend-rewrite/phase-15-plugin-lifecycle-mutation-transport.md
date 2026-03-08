# Phase 15 Plugin Lifecycle Mutation Transport

## Purpose

This doc records the bounded closeout of the remaining caller-backed direct
frontend plugin mutation transport work after the landed runtime-read,
config-write, and restart slices.

The direct frontend lifecycle routes covered here were:

- `POST /plugins/rescan`
- `POST /plugins/enable`
- `POST /plugins/disable`
- `POST /plugins/install`
- `POST /plugins/uninstall`
- `POST /plugins/update`
- `POST /plugins/rollback`

The goal was to move those direct frontend HTTP transports onto the existing Go
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
- Slice C in this doc is now landed:
  - `POST /plugins/update`
  - `POST /plugins/rollback`
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
- the caller-backed direct frontend HTTP transport for those routes is now
  Go-owned
- the bounded follow-on in `phase-15-plugin-link-transport.md` is now also
  landed:
  - `POST /plugins/link`
- the later bounded follow-on in `phase-15-plugin-lock-transport.md` is now
  also landed:
  - `POST /plugins/lock/write`
  - `POST /plugins/lock/apply`
- the thin plugin HTTP transport surface is now Go-owned for the current
  clean-break rewrite scope

Inventory notes that matter for sequencing:

- `route_plugins_link(...)` still has no current direct frontend caller in
  `frontend/src`, but it became a concrete plugin E2E/manual-flow dependency
  and is now Go-owned through the separate bounded follow-on doc
- `route_plugins_lock_write(...)` and `route_plugins_lock_apply(...)` likewise
  still have no current direct frontend caller, but they later moved through a
  separate bounded follow-on because the shared Go service already owned the
  source-of-truth semantics
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
  - `lock*` should stay out until they become direct blockers or a bounded
    dependency requires them

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

Status:

- landed
- Go now owns thin IDE-only transport for:
  - `POST /plugins/update`
  - `POST /plugins/rollback`
- the update route now accepts the current direct frontend `to: null` payload
  shape and passes the existing source-spec through unchanged when no retarget
  is requested
- the rollback route now surfaces the existing shared-service unavailable
  errors for missing history, missing metadata, and linked local sources
- the real IDE app now proves metadata-backed update and rollback behavior over
  the production candidate-provider boundary

### Deferred Unless Needed

- `POST /plugins/lock/write`
- `POST /plugins/lock/apply`

Outcome:

- these were later moved in the bounded follow-on doc
  `phase-15-plugin-lock-transport.md`

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
- keep update/rollback response shaping in the shared service
  - the HTTP layer forwards the existing typed result payloads instead of
    introducing route-local response adapters
- accept nullable `to` in the route request contract
  - the current frontend already sends `to: null` for default updates
  - the Go route now decodes that explicitly instead of relying on fragile JSON
    coercion

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

## Landed in Slice C

- `internal/httpapi/plugin_routes.go`
  - thin IDE-only transport for:
    - `POST /plugins/update`
    - `POST /plugins/rollback`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new update/rollback route names
- focused coverage in:
  - `internal/httpapi/plugin_routes_test.go`
    - update/rollback success
    - invalid JSON
    - missing metadata/history
    - linked local-source rejection
    - share-mode blocking
  - `internal/app/app_test.go`
    - real app update + rollback roundtrip over the production candidate
      provider
  - `internal/plugins/service_test.go`
    - existing update/rollback lifecycle coverage remains the service-level
      source-of-truth guardrail

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestService(InstallUpdateRollbackAndUninstallLifecycle|UpdateRejectsLocalSourceMetadata|RollbackRequiresHistory)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(ServesPluginRuntimeAndFrontendAssets|WritesPluginConfigAndUpdatesRuntime|HandlesPluginRescanEnableAndDisableRoutes|InstallsAndUninstallsPluginRoutes|UpdatesAndRollsBackPluginRoutes|ServesManualPluginRestartRoute)' -count=1`
- `git diff --check`

## Next Recommended Step

- the first higher-level backend plugin runtime follow-on is now landed in
  `phase-15-plugin-backend-codegen-registration-runtime.md`
- the bounded local-link transport follow-on is now also landed in
  `phase-15-plugin-link-transport.md`
- the bounded lockfile transport follow-on is now also landed in
  `phase-15-plugin-lock-transport.md`
- if plugin rewrite work resumes beyond that bounded codegen slice, focus next
  on a concrete higher-level backend plugin runtime boundary only when a caller
  requires it
  - likely candidates are backend language-server or external-agent
    registrations rather than reopening thin transport work already completed

## Open Questions

- no unresolved thin-transport question remains for this cluster
- later plugin work should stay runtime-boundary-driven rather than reopening
  already-landed route transport
