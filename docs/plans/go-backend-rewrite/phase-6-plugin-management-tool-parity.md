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
- the remaining non-project-state Python MCP gap count is 0
- Go now owns:
  - plugin manifest/state/install-metadata/history persistence
  - filesystem discovery/rescan ownership
  - plugin install/update/uninstall/rollback runtime ownership
  - source-spec parsing and retargeting for `github:` and `pypi:` requests
  - MCP registration and transport parity for:
    - `install_plugin`
    - `uninstall_plugin`
    - `rescan_plugins`
    - `update_plugin`
    - `rollback_plugin`
  - app wiring for the plugin mutation service
- Go still does not own:
  - a real remote plugin candidate provider for install/update in the
    production app

## Scope

This slice covered:

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
- keep `rescan_plugins` aligned with the Python aggregate-count response shape
  instead of leaking the larger Go discovery snapshot directly

## Completed Work

1. Server/tool registration
   - added the five plugin-management tools and their schemas

2. Handler wiring
   - mapped tool requests onto `internal/plugins.Service`
   - normalized plugin runtime errors into MCP `invalid_arguments` or
     `internal_error` results

3. App/route transport
   - wired the plugin mutation service into IDE app startup
   - added MCP HTTP route and authenticated SSE coverage

## Next Recommended Step

Move to the post-MCP runtime inventory in
`phase-7-runtime-surface-inventory.md`.

Plugin-management MCP parity is complete, and the rewrite now needs a bounded
Phase 7 entry point outside the closed Python MCP surface.

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/plugins -run 'Test(ParseSourceSpec|RetargetSourceSpec|Service)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|PluginManagementTools)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsPluginManagementTools|SupportsAgentProfileReadTools|SupportsRunAgentProfile|SupportsStreamAppDefinition|SupportsUISettingSearchReadWrite)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsPluginManagementToolsOverAuthenticatedSSE|ToolCallRouteSupportsPluginManagementTools|ServerSupportsRunAgentProfileOverAuthenticatedSSE|ToolCallRouteSupportsRunAgentProfile|ServerSupportsStreamAppDefinitionOverAuthenticatedSSE|ToolCallRouteSupportsStreamAppDefinition|ServerSupportsUISettingSearchReadWriteOverAuthenticatedSSE|ToolCallRouteSupportsUISettingSearchReadWrite)' -count=1 -timeout 420s`

## Progress Notes

- 2026-03-08: completed MCP transport parity for `install_plugin`,
  `uninstall_plugin`, `rescan_plugins`, `update_plugin`, and
  `rollback_plugin`.
- 2026-03-08: wired the IDE app to a real Go plugin mutation service while
  preserving explicit provider-unavailable failures for install/update until a
  real candidate provider lands.
- 2026-03-08: completed the follow-on Python-environment introspection slice,
  so the Python-owned MCP surface is now fully closed and the next step has
  moved to the broader Phase 7 runtime inventory.
