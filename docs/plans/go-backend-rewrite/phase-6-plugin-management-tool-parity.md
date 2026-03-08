# Phase 6 Plugin Management Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
plugin-management runtime owner work.

The goal is to expose the remaining plugin-management MCP tools
`install_plugin`, `uninstall_plugin`, `rescan_plugins`, `update_plugin`, and
`rollback_plugin` as thin handlers over the completed Go mutation service.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the remaining non-project-state Python MCP gap count is 6
- Go now owns:
  - plugin manifest/state/install-metadata/history persistence
  - filesystem discovery/rescan ownership
  - plugin install/update/uninstall/rollback runtime ownership
  - source-spec parsing and retargeting for `github:` and `pypi:` requests
- Go does not yet own:
  - MCP tool registration and invocation handlers for the five remaining
    plugin-management tools
  - authenticated SSE and MCP HTTP route parity for those tools
  - app wiring for the plugin mutation service and candidate-provider boundary

## Scope

This slice should cover:

- MCP server registration for:
  - `install_plugin`
  - `uninstall_plugin`
  - `rescan_plugins`
  - `update_plugin`
  - `rollback_plugin`
- thin MCP handlers over `internal/plugins.Service`
- route and authenticated SSE coverage for the five tool calls
- app wiring for the plugin mutation service and any explicit “provider
  unavailable” behavior until real remote fetch backends are wired

## Non-Goals

- plugin CLI parity
- lockfile write/apply parity
- local-link, enable/disable, or plugin-config write parity
- `getInstalledPythonPackages`

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-plugin-management-mutation-owner.md`
- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `backend/setta/mcp/tools/plugins.py`
- `tests/mcp/test_plugin_tools.py`
- `internal/plugins/service.go`
- `internal/mcpx/server.go`
- `internal/httpapi/mcp_routes.go`
- `internal/app/app.go`

## Current Python Behavior

1. Tool policy
   - plugin mutation tools are blocked outside IDE mode
   - handlers are thin wrappers over the plugin manager

2. Transport behavior
   - tools surface plugin-manager errors directly
   - `rescan_plugins` returns aggregate installed/active counts
   - mutation tools return typed payloads including restart-required flags

## Working Decisions

- keep MCP transport thin over the completed Go mutation service
- keep remote fetch/install backends behind the service provider boundary rather
  than embedding network or package-manager logic in MCP handlers
- if no real provider is wired yet in the app, expose the explicit runtime
  unavailable/fetch unavailable failure instead of routing through Python

## Recommended Implementation Order

1. Server/tool registration
   - add the five plugin-management tools and their schemas

2. Handler wiring
   - map tool requests onto `internal/plugins.Service`
   - preserve explicit IDE-mode/runtime-availability failures

3. App/route transport
   - wire the service into app startup
   - add MCP HTTP route and authenticated SSE coverage

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx ./internal/httpapi ./internal/app -count=1 -timeout 420s`
