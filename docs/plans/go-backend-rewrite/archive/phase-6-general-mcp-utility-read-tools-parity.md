# Phase 6 General MCP Utility Read Tools Parity

## Purpose

This doc records the completed Phase 6 slice that landed the first bounded
post-project-state Python MCP overlap outside
`BaseProjectManager.@project_state_tool`.

The goal of this slice was to move the highest-leverage remaining read-only and
init-oriented Python MCP tools onto explicit Go owners without routing anything
back through Python.

## Status

Completed on 2026-03-08.

Phase 6 MCP parity remains the active rewrite phase, and this bounded utility
cluster is now complete end-to-end.

## Scope Completed

This slice landed Go parity for:

- `search_mcp_tools`
- `get_mcp_server_runtime_status`
- `getProjectConfigNamesAndIds`
- `getTerminalOutput`
- `get_app_catalog`
- `list_app_components`
- `get_setta_docs`

It included:

- small owner additions below the MCP transport
- MCP parity in `internal/mcpx`
- focused HTTP tool-route coverage
- focused authenticated SSE coverage
- focused tests for runtime owners and tool-call behavior

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/base_tools.py`
- `backend/setta/mcp/tools/tool_search.py`
- `backend/setta/mcp/tools/listener_docs.py`
- `backend/setta/mcp/tools/app_tools.py`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/app/catalog.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/terminals/terminals.py`
- `tests/mcp/test_base_tools.py`
- `tests/mcp/test_mcp_server_registration.py`
- `tests/mcp/test_mcp_agentic_project_state_summary_filtering.py`
- `internal/mcpx/server.go`
- `internal/httpapi/mcp_routes.go`
- `internal/terminals/service.go`
- `internal/appspec/catalog.go`
- `internal/projectstate/document.go`

## Completed Work

### Runtime/Owner Layer

- added a discoverable-tool search owner in `internal/tools/search.go`
- added explicit project metadata reads in
  `internal/projectstate/project_metadata_reads.go`
- added a read-only terminal history accessor on `internal/terminals.Service`
- expanded the app catalog owner in `internal/appspec/catalog.go` to expose
  deterministic component order, prop defaults, and action metadata
- added explicit docs-root loading and path validation in
  `internal/settadocs/loader.go`

### MCP Transport Layer

- added server handlers in `internal/mcpx/utility_read_tools.go`
- wired the new tools into `internal/mcpx/server.go`
- injected the app MCP server with runtime-status, terminal, and docs-root
  dependencies from `internal/app/app.go`
- kept the transport thin by delegating behavior to the new explicit owners

### Verification Coverage

- added focused server tests in `internal/mcpx/server_test.go`
- added focused MCP HTTP route tests in
  `internal/httpapi/mcp_tool_routes_test.go`
- added authenticated SSE and app tool-route tests in
  `internal/app/mcp_test.go`

## Decisions Made

- `search_mcp_tools` stays server-local in Go over registered discoverable
  tools instead of bouncing through the internal MCP client
- `get_mcp_server_runtime_status` reads from the existing Go MCP client runtime
  snapshots
- project bootstrap metadata now has an explicit document/read owner instead of
  being synthesized inside the transport layer
- terminal output reads use buffered history directly instead of websocket
  attachment side effects
- `get_setta_docs` is bounded to the workspace `docs/` tree with explicit
  aliasing and path validation
- `getTerminalOutput` still returns raw string structured content even though
  the current `go-sdk/mcp` tool registration path requires an object-shaped
  output schema declaration

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools ./internal/projectstate ./internal/terminals ./internal/appspec ./internal/settadocs -run 'Test(SearchIndex|DocumentProjectConfigMetadata|ServiceHistory|DefaultCatalog|Loader)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SearchMCPToolsUsesDiscoverableToolsAndServerFilters|GetMCPServerRuntimeStatusReturnsClientStatuses|GetProjectConfigNamesAndIDsReturnsSortedMetadata|GetTerminalOutputReturnsBufferedHistory|GetAppCatalogAndListAppComponentsReturnDefaultCatalog|GetSettaDocsLoadsDefaultBundleAndRejectsEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsUtilityReadInitTools|SupportsAppCatalogReadTools|SupportsGetTerminalOutput|GetSettaDocsRejectsPathEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsUtilityReadToolsOverAuthenticatedSSE|ServerSupportsGetMCPServerRuntimeStatusOverAuthenticatedSSE|ServerSupportsGetTerminalOutputOverAuthenticatedSSE|ServerSupportsTemporaryIDsForGetTerminalOutputOverAuthenticatedSSE|ToolCallRouteSupportsUtilityReadInitTools|ToolCallRouteSupportsGetMCPServerRuntimeStatus|ToolCallRouteSupportsAppCatalogReadTools|ToolCallRouteSupportsGetTerminalOutput|ToolCallRouteGetSettaDocsRejectsPathEscapes|RuntimeStatusRouteReportsConnectedSelfClient)' -count=1 -timeout 420s`

## Open Questions

- none for this completed slice

## Next Recommended Step

Implement the bounded `report_completion_status` slice in
`phase-6-report-completion-status-tool-parity.md` before moving into the much
larger agent-profile, UI-setting registry, plugin-management, or app-definition
streaming gaps.
