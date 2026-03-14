# Phase 15 Plugin Lock Transport

## Purpose

This doc records the bounded Phase 15 follow-on that moved the last remaining
plugin HTTP lockfile transport from Python to Go.

The goal was to keep transport thin and finish the existing plugin service
boundary without broadening into speculative new plugin runtime ownership.

## Status

Current repo status as of 2026-03-09:

- this slice is now landed
- Go now owns:
  - `POST /plugins/lock/write`
  - `POST /plugins/lock/apply`
- `internal/plugins.Service` already owned the source-of-truth lockfile
  semantics in:
  - `WriteLockfile()`
  - `ApplyLockfile(...)`
- the direct Python transport in `backend/setta/routers/plugins.py` no longer
  covers any remaining plugin HTTP route that matters for the current clean-
  break rewrite scope
- missing-lockfile errors now preserve the existing route contract by mapping
  `PLUGIN_LOCKFILE_NOT_FOUND` to HTTP 404 from the Go transport

## Scope

This slice covers only:

- thin IDE-only Go HTTP transport for:
  - `POST /plugins/lock/write`
  - `POST /plugins/lock/apply`
- route-name registration for those endpoints
- route/app tests for:
  - lockfile write/apply roundtrip
  - invalid JSON on apply
  - missing-lockfile error mapping
  - IDE-only gating

## Non-Goals

- plugin UI changes
- new lockfile semantics
- plugin CLI changes
- broader plugin backend runtime work like static-dir, listener, or MCP
  surfaces

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-15-plugin-lifecycle-mutation-transport.md`
- `backend/setta/routers/plugins.py`
- `backend/setta/plugins/manager.py`
- `tests/routers/test_plugin_routes.py`
- `tests/plugins/test_plugin_manager.py`
- `internal/plugins/lockfile.go`
- `internal/httpapi/plugin_routes.go`
- `internal/httpapi/plugin_routes_test.go`
- `internal/app/app_test.go`

## Decisions Made

- keep transport thin
  - `internal/httpapi` decodes the small request payload, enforces IDE mode,
    calls the shared service, and writes JSON only
- keep lockfile semantics in `internal/plugins`
  - route handlers do not reshape lockfile planning or convergence behavior
- preserve explicit not-found mapping
  - `PLUGIN_LOCKFILE_NOT_FOUND` stays a 404 instead of collapsing into the
    default bad-request path
- finish the bounded HTTP surface without inventing a caller
  - these routes still have no current direct frontend caller in `frontend/src`
  - they were still a low-risk, high-leverage cleanup because the service and
    route contract already existed and were well covered in Python

## Landed Work

- `internal/httpapi/plugin_routes.go`
  - thin IDE-only transport for:
    - `POST /plugins/lock/write`
    - `POST /plugins/lock/apply`
  - explicit 404 mapping for `PLUGIN_LOCKFILE_NOT_FOUND`
- `internal/httpapi/route_names.go`
  - bare-route registration for the new lock route names
- focused coverage in:
  - `internal/httpapi/plugin_routes_test.go`
  - `internal/app/app_test.go`

## Verification

- `./scripts/go.sh test ./internal/plugins -run 'TestService(WriteLockfileIncludesMetadataAndExcludesShadowedAndPackageManagerEntries|ApplyLockfile)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'Plugin' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestApp(WritesAndAppliesPluginLockRoutes|ServesPluginRuntimeAndFrontendAssets|WritesPluginConfigAndUpdatesRuntime|HandlesPluginRescanEnableAndDisableRoutes|InstallsAndUninstallsPluginRoutes|UpdatesAndRollsBackPluginRoutes|ServesManualPluginRestartRoute)' -count=1`
- `git diff --check`

## Exit Criteria

- Go serves both plugin lockfile HTTP routes in IDE mode
- write/apply requests hit the existing shared plugin service
- missing lockfiles return HTTP 404 with `PLUGIN_LOCKFILE_NOT_FOUND`
- focused Go route and app tests pass

## Next Recommended Step

Do not broaden plugin work speculatively. The remaining plugin follow-ons
should stay caller-driven, with static-dir, listener-endpoint, MCP-tool, or
broader backend-host runtime work only pulled forward when a concrete caller
requires one of those surfaces.
