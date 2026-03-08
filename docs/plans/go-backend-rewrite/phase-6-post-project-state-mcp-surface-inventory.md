# Phase 6 Post-Project-State MCP Surface Inventory

## Purpose

This doc inventories the remaining Python-owned MCP surface after the completed
Go parity work for `BaseProjectManager.@project_state_tool` and the completed
general utility/read cluster.

The project-state overlap is closed. What remains is the broader Python MCP
tool set implemented in `backend/setta/mcp/tools/*.py`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go now has full parity for the Python
  `BaseProjectManager.@project_state_tool` surface
- Python currently exposes 25 non-project-state MCP tools in
  `backend/setta/mcp/tools/*.py`
- 10 of those now have Go parity:
  - `set_agentic_context`
  - `list_mcp_tools`
  - `read_file_range`
  - `search_mcp_tools`
  - `get_mcp_server_runtime_status`
  - `getProjectConfigNamesAndIds`
  - `getTerminalOutput`
  - `get_app_catalog`
  - `list_app_components`
  - `get_setta_docs`
- the remaining 15 tools now fall into one small completion-report slice plus
  several larger missing runtime foundations

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-app-definition-read-and-validation-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-general-mcp-utility-read-tools-parity.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tool_registry.py`
- `backend/setta/mcp/tool_setup.py`
- `backend/setta/mcp/tools/base_tools.py`
- `backend/setta/mcp/tools/tool_search.py`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/mcp/tools/file_read.py`
- `backend/setta/mcp/tools/listener_docs.py`
- `backend/setta/mcp/tools/plugins.py`
- `backend/setta/mcp/tools/ui_settings.py`
- `backend/setta/mcp/tools/app_tools.py`
- `backend/setta/routers/status.py`
- `backend/setta/routers/agentic.py`
- `backend/setta/routers/project_manager.py`
- `tests/mcp/test_base_tools.py`
- `tests/mcp/test_mcp_server_registration.py`
- `tests/mcp/test_ui_setting_tools.py`
- `tests/routers/test_agentic_routes.py`
- `internal/mcpx/server.go`
- `internal/mcpx/client.go`
- `internal/httpapi/mcp_routes.go`
- `internal/terminals/service.go`
- `internal/appspec/catalog.go`
- `internal/projectstate/ui_settings_compare_and_set.go`

## What Is Already Complete Outside Project State

Go already owns the following Python MCP tools that do not come from
`BaseProjectManager.@project_state_tool`:

- `set_agentic_context`
- `list_mcp_tools`
- `read_file_range`
- `search_mcp_tools`
- `get_mcp_server_runtime_status`
- `getProjectConfigNamesAndIds`
- `getTerminalOutput`
- `get_app_catalog`
- `list_app_components`
- `get_setta_docs`

## Remaining Python-Owned MCP Surface

### 1. Bounded Completion-Report Tool

- `report_completion_status`
  - Python behavior is small and local: validate the structured report payload,
    normalize optional text fields, and derive `verificationStatus`.
  - Go does not yet own that completion-report schema or derivation logic.

### 2. Agentic Utility And Agent-Run Gaps

- `list_agent_profiles`
- `get_agent_profile`
- `run_agent_profile`
  - Python depends on agent-profile storage plus an agent-runner runtime. Go
    does not yet own that store/runtime boundary.

### 3. Generic UI-Setting Registry And Reveal Gaps

- `search_ui_settings`
- `get_ui_setting_value`
- `set_ui_setting_value`
- `reveal_ui_setting`

Go only owns the bounded compare-and-set project-state subset in
`internal/projectstate/ui_settings_compare_and_set.go`. It does not yet own the
broader UI-setting registry, schema validation, plugin-setting integration, or
frontend reveal coordinator that Python keeps under `setta/ui_settings/`.

### 4. Plugin Management Gaps

- `install_plugin`
- `uninstall_plugin`
- `rescan_plugins`
- `update_plugin`
- `rollback_plugin`

These are blocked on missing Go ownership for plugin discovery/install/update
runtime behavior. Current Go plugin work is still centered on codegen/runtime
materialization, not MCP-facing package management.

### 5. App-Generation Patch Streaming Gap

- `stream_app_definition`

Go now owns stored app-definition reads, writes, and validation, but it does
not yet own the newline-delimited patch parser plus live-preview semantics that
Python exposes through `setta.app.spec_patch_stream`.

### 6. Environment Introspection Gap

- `getInstalledPythonPackages`

This should not be implemented until Go has an explicit source of truth for
which Python environment the tool is supposed to inspect. Shelling out to an
arbitrary interpreter would violate the rewrite requirement to avoid
heuristics.

## Working Decisions

- treat the Python project-state MCP overlap as complete and closed
- treat the general utility/read cluster as complete and closed
- keep the next step focused on the small completion-report tool before the
  much larger agent-profile, UI-setting, plugin, and streaming foundations
- do not route missing MCP tools back through Python
- keep transport thin and add explicit Go owners where the current runtime
  boundary is still implicit

## Recommended Next Step

Execute the bounded `report_completion_status` slice in
`phase-6-report-completion-status-tool-parity.md`.

This is now the highest-leverage next slice because:

- it is the smallest remaining Python-owned MCP gap
- it is independent of the larger agent-profile and plugin foundations
- it supports the existing completion-guard contract without broadening into
  agent-run execution work

## Open Questions

- whether `getInstalledPythonPackages` belongs in a later explicit Python
  runtime-integration slice or should remain out of scope for the Go rewrite

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools ./internal/projectstate ./internal/terminals ./internal/appspec ./internal/settadocs -run 'Test(SearchIndex|DocumentProjectConfigMetadata|ServiceHistory|DefaultCatalog|Loader)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|SearchMCPToolsUsesDiscoverableToolsAndServerFilters|GetMCPServerRuntimeStatusReturnsClientStatuses|GetProjectConfigNamesAndIDsReturnsSortedMetadata|GetTerminalOutputReturnsBufferedHistory|GetAppCatalogAndListAppComponentsReturnDefaultCatalog|GetSettaDocsLoadsDefaultBundleAndRejectsEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsUtilityReadInitTools|SupportsAppCatalogReadTools|SupportsGetTerminalOutput|GetSettaDocsRejectsPathEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsUtilityReadToolsOverAuthenticatedSSE|ServerSupportsGetMCPServerRuntimeStatusOverAuthenticatedSSE|ServerSupportsGetTerminalOutputOverAuthenticatedSSE|ServerSupportsTemporaryIDsForGetTerminalOutputOverAuthenticatedSSE|ToolCallRouteSupportsUtilityReadInitTools|ToolCallRouteSupportsGetMCPServerRuntimeStatus|ToolCallRouteSupportsAppCatalogReadTools|ToolCallRouteSupportsGetTerminalOutput|ToolCallRouteGetSettaDocsRejectsPathEscapes|RuntimeStatusRouteReportsConnectedSelfClient)' -count=1 -timeout 420s`

## Progress Notes

- 2026-03-08: completed a repo-wide inventory of the remaining Python-owned MCP
  surface after the `BaseProjectManager.@project_state_tool` closeout.
- 2026-03-08: identified the bounded utility/read tool cluster as the highest
  leverage next slice and split the larger missing foundations into separate
  categories instead of mixing them into one oversized plan.
- 2026-03-08: completed Go parity for `search_mcp_tools`,
  `get_mcp_server_runtime_status`, `getProjectConfigNamesAndIds`,
  `getTerminalOutput`, `get_app_catalog`, `list_app_components`, and
  `get_setta_docs`, reducing the remaining non-project-state Python MCP gap
  count from 22 to 15.
