# Phase 15 Plugin Restart Transport

## Purpose

This doc narrows the next bounded Phase 15 follow-on to the remaining direct
frontend plugin restart transport gap after the landed runtime-read and config
write slices:

- `POST /plugins/restart`

The goal is to move plugin restart request handling onto the existing Go plugin
service without broadening into a brand-new app restart runtime, daemon
supervisor work, or unrelated plugin mutation routes.

## Status

Current repo status as of 2026-03-09:

- Go already owns:
  - `GET /plugins/runtime`
  - `/plugins/{pluginId}/{assetPath:path}`
  - `POST /plugins/config`
- `internal/plugins/status.go` already owns most restart semantics used by the
  Go CLI and runtime payloads:
  - restart capability shaping
  - restart-required summary shaping
  - a bounded `Service.Restart(...)` entrypoint
- the current direct frontend callers still depend on generated
  `route_plugins_restart(...)` through:
  - `frontend/src/plugins/restart.ts`
  - `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
  - `frontend/src/components/AppHeader/PluginRestartBanner.tsx`
- Python still owns the HTTP restart transport in:
  - `backend/setta/routers/plugins.py`
  - `backend/setta/plugins/manager.py`

Current Python behavior relevant to this slice:

- the route is IDE-only
- the transport is thin:
  - call `restart_backend()`
  - return `{accepted, mode, command, reason}`
- manager restart behavior is:
  - manual in share/app even if a callback exists
  - programmatic in IDE only when a restart callback exists
  - accepted when the callback returns truthy
  - manual-fallback payload when the callback returns falsy
  - `PLUGIN_RESTART_FAILED` with HTTP 503 when the callback raises

## Scope

This slice should cover only:

- thin IDE-only Go transport for:
  - `POST /plugins/restart`
- completing the optional programmatic restart callback boundary in
  `internal/plugins`
- focused tests for:
  - manual response payloads
  - programmatic accepted and rejected payloads
  - restart callback failure mapping
  - share-mode gating at the route layer
- real app wiring proving the route exists and currently remains manual-only
  when no restart hook is configured

## Non-Goals

- implementing a new real app restart daemon/hook
- changing frontend restart UX or runtime hydration flows
- altering pending-restart bookkeeping
- bundling any install/link/enable/disable/update/rollback routes
- websocket broadcasts around restart attempts

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-config-write-transport.md`
- `backend/setta/routers/plugins.py`
- `backend/setta/plugins/manager.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/routers/test_plugin_routes.py`
- `frontend/src/plugins/restart.ts`
- `frontend/src/plugins/restart.test.ts`
- `frontend/src/components/Panes/Overview/Plugins/PluginsPane.tsx`
- `frontend/src/components/AppHeader/PluginRestartBanner.tsx`
- `internal/plugins/status.go`
- `internal/httpapi/plugin_routes.go`
- `internal/app/app.go`

## Working Decisions

- keep transport thin
  - the route should only enforce IDE mode, call the service, and serialize the
    response/error
- keep restart semantics in `internal/plugins`
  - capability and callback handling belong with the plugin runtime owner, not
    route code
- complete the optional callback boundary now
  - the service/CLI/frontend types already model programmatic accept/reject
    outcomes
  - the real app can still supply no callback and remain manual-only
- do not invent a restart mechanism in this slice
  - if no real callback exists in the app, keep the route manual-only there
  - do not add a fake or heuristic process restart path

## Recommended Design

1. Extend `plugins.Service` with an optional restart callback.
   - Keep it nil by default.
   - Use it only in IDE mode.

2. Align `internal/plugins/status.go` with the Python semantics.
   - `restartCapability()` should return:
     - manual in share/app
     - programmatic in IDE only when the callback exists
     - manual otherwise
   - `Restart(...)` should return:
     - accepted payload on truthy callback result
     - manual-fallback payload on falsy callback result
     - explicit restart-failed service error on callback failure

3. Add thin HTTP transport in `internal/httpapi/plugin_routes.go`.
   - Register `POST /plugins/restart` under `RequireIDEMode(...)`.
   - Reuse the existing plugin-route error mapper, adding explicit 503 mapping
     for restart-callback failure.

4. Keep the real app manual-only for now.
   - Wire the route through the shared service.
   - Do not claim a real app restart hook unless one already exists.

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'Restart' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'Plugin.*Restart|PluginRuntimeAndFrontendAssets' -count=1`

## Open Questions

- whether the real app should later attach a concrete restart hook in IDE mode
  - recommendation: only when there is a real process-lifecycle owner for it;
    do not fabricate one in this transport slice

## Next Recommended Step

- implement the bounded `POST /plugins/restart` slice above
- after that, the remaining direct frontend plugin mutation routes are the
  install/link/enable/disable/update/rollback cluster
