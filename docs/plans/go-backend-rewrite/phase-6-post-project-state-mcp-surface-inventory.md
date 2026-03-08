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
- 14 of those now have Go parity:
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
  - `list_agent_profiles`
  - `get_agent_profile`
  - `run_agent_profile`
- the remaining 11 tools now fall into one UI-setting registry/reveal cluster
  plus several larger missing runtime foundations

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
- `list_agent_profiles`
- `get_agent_profile`
- `run_agent_profile`

## Remaining Python-Owned MCP Surface

### 1. Generic UI-Setting Registry And Reveal Gaps

- `search_ui_settings`
- `get_ui_setting_value`
- `set_ui_setting_value`
- `reveal_ui_setting`

Go only owns the bounded compare-and-set project-state subset in
`internal/projectstate/ui_settings_compare_and_set.go`. It does not yet own the
broader UI-setting registry, schema validation, plugin-setting integration, or
frontend reveal coordinator that Python keeps under `setta/ui_settings/`.

### 2. Plugin Management Gaps

- `install_plugin`
- `uninstall_plugin`
- `rescan_plugins`
- `update_plugin`
- `rollback_plugin`

These are blocked on missing Go ownership for plugin discovery/install/update
runtime behavior. Current Go plugin work is still centered on codegen/runtime
materialization, not MCP-facing package management.

### 3. App-Generation Patch Streaming Gap

- `stream_app_definition`

Go now owns stored app-definition reads, writes, and validation, but it does
not yet own the newline-delimited patch parser plus live-preview semantics that
Python exposes through `setta.app.spec_patch_stream`.

### 4. Environment Introspection Gap

- `getInstalledPythonPackages`

This should not be implemented until Go has an explicit source of truth for
which Python environment the tool is supposed to inspect. Shelling out to an
arbitrary interpreter would violate the rewrite requirement to avoid
heuristics.

## Working Decisions

- treat the Python project-state MCP overlap as complete and closed
- treat the general utility/read cluster as complete and closed
- treat `report_completion_status` as complete and closed
- treat the bounded agent-profile store/read slice as complete and closed
- treat the managed agent-run foundation as complete and closed
- treat `run_agent_profile` transport as complete and closed
- keep the next step focused on the UI-setting registry/reveal cluster before
  plugin-management or patch-stream work
- do not route missing MCP tools back through Python
- keep transport thin and add explicit Go owners where the current runtime
  boundary is still implicit
- treat the UI-setting Stage 1 registry foundation as complete and closed

## Recommended Next Step

Execute Stage 2 of the dedicated UI-setting plan in
`phase-6-ui-setting-registry-and-reveal-tools-parity.md`.

This is now the highest-leverage next slice because:

- four remaining Python MCP tools still sit behind the same missing Go-owned
  search/get/set/reveal subsystem
- the bounded compare-and-set and registry/value-schema UI-setting foundations
  now exist in Go, so the highest-leverage gap is the thin MCP transport over
  that runtime rather than more foundation work
- it reduces the largest remaining non-plugin MCP gap before broader plugin
  management or patch-stream work

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/agentprofiles -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/agentruns -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|RunAgentProfile|ListAgentProfilesAndGetAgentProfile)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsRunAgentProfile|SupportsAgentProfileReadTools|SupportsReportCompletionStatus|SupportsUtilityReadInitTools)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsAgentProfileReadToolsOverAuthenticatedSSE|ServerSupportsRunAgentProfileOverAuthenticatedSSE|ToolCallRouteSupportsAgentProfileReadTools|ToolCallRouteSupportsRunAgentProfile)' -count=1 -timeout 420s`

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
- 2026-03-08: completed Go parity for `list_agent_profiles` and
  `get_agent_profile`, reducing the remaining non-project-state Python MCP gap
  count from 14 to 12.
- 2026-03-08: confirmed that direct `run_agent_profile` parity is blocked on
  missing Go ownership for managed `agent_runs`, engine-config resolution,
  full `llm_config.json` semantics, and managed LLM execution, so the next
  step is now the dedicated managed-agent-run foundation slice.
- 2026-03-08: completed the dedicated managed-agent-run foundation slice in
  `internal/llmconfig`, `internal/agentruns`, and `internal/app`, so the next
  step is now the bounded `run_agent_profile` transport slice.
- 2026-03-08: completed Go parity for `run_agent_profile`, reducing the
  remaining non-project-state Python MCP gap count from 12 to 11 and removing
  the last remaining agentic MCP transport gap.
- 2026-03-08: completed Stage 1 of the UI-setting slice by adding
  app-definition compare-and-set owners plus the bounded core UI-setting
  registry, schema validator, search layer, and read/write delegates in Go.
