# Phase 6 Post-Project-State MCP Surface Inventory

## Purpose

This doc inventories the remaining Python-owned MCP surface after the completed
Go parity work for `BaseProjectManager.@project_state_tool`, the completed
general utility/read cluster, and the completed `report_completion_status`
slice.

The project-state overlap is closed. What remains is the broader Python MCP
tool set implemented in `backend/setta/mcp/tools/*.py`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go now has full parity for the Python
  `BaseProjectManager.@project_state_tool` surface
- Python currently exposes 25 non-project-state MCP tools in
  `backend/setta/mcp/tools/*.py`
- 11 of those now have Go parity:
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
  - `report_completion_status`
- the remaining 14 tools now fall into a bounded agent-profile store/read
  slice plus several larger missing runtime foundations

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-general-mcp-utility-read-tools-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-report-completion-status-tool-parity.md`
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
- `backend/setta/agentic/store.py`
- `backend/setta/database/db_objs.py`
- `backend/setta/types/agentic.py`
- `backend/setta/routers/agentic.py`
- `tests/mcp/test_base_tools.py`
- `tests/mcp/test_mcp_server_registration.py`
- `tests/agentic/test_agentic_store.py`
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
- `report_completion_status`

## Remaining Python-Owned MCP Surface

### 1. Agent-Profile Store And Read Gaps

- `list_agent_profiles`
- `get_agent_profile`
  - Python reads `agent_profiles.json` through the agentic store and validates
    entries as `AgentProfile`.
  - Go does not yet own the file-backed agent-profile store, schema
    validation, or the bounded read surface above it.

### 2. Agentic Run Gap

- `run_agent_profile`
  - Python depends on the same agent-profile store plus an agent-runner
    runtime. Go does not yet own that run boundary.

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
- treat `report_completion_status` as complete and closed
- keep the next step focused on the smallest remaining bounded non-run gap:
  agent-profile store plus read-tool parity
- do not route missing MCP tools back through Python
- keep transport thin and add explicit Go owners where the current runtime
  boundary is still implicit

## Recommended Next Step

Execute the bounded agent-profile store/read slice in
`phase-6-agent-profile-store-and-read-tools-parity.md`.

This is now the highest-leverage next slice because:

- it covers the smallest remaining user-facing MCP read tools
- it creates the storage foundation `run_agent_profile` will eventually need
- it avoids broadening immediately into the much larger agent-runner runtime

## Open Questions

- whether agent-profile default/example seeding should be included in the first
  Go store/read slice or deferred until broader agentic runtime migration

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'Test(BuildCompletionStatusReport|ServerListsToolsAndScopesToolCalls|ServerReportCompletionStatusBuildsStructuredReportAndRejectsInvalidChecks)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsUtilityReadInitTools|SupportsReportCompletionStatus|SupportsAppCatalogReadTools|SupportsGetTerminalOutput|GetSettaDocsRejectsPathEscapes)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsUtilityReadToolsOverAuthenticatedSSE|ServerSupportsReportCompletionStatusOverAuthenticatedSSE|ServerSupportsGetMCPServerRuntimeStatusOverAuthenticatedSSE|ServerSupportsGetTerminalOutputOverAuthenticatedSSE|ServerSupportsTemporaryIDsForGetTerminalOutputOverAuthenticatedSSE|ToolCallRouteSupportsUtilityReadInitTools|ToolCallRouteSupportsReportCompletionStatus|ToolCallRouteSupportsGetMCPServerRuntimeStatus|ToolCallRouteSupportsAppCatalogReadTools|ToolCallRouteSupportsGetTerminalOutput|ToolCallRouteGetSettaDocsRejectsPathEscapes|RuntimeStatusRouteReportsConnectedSelfClient)' -count=1 -timeout 420s`

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
- 2026-03-08: completed Go parity for `report_completion_status`, reducing the
  remaining non-project-state Python MCP gap count from 15 to 14.
