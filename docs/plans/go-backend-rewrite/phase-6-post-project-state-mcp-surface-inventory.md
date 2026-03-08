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
- 19 of those now have Go parity:
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
  - `search_ui_settings`
  - `get_ui_setting_value`
  - `set_ui_setting_value`
  - `reveal_ui_setting`
  - `stream_app_definition`
- the remaining 6 tools now fall into one plugin-management mutation/transport
  cluster plus one blocked environment-introspection gap

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
- `search_ui_settings`
- `get_ui_setting_value`
- `set_ui_setting_value`
- `reveal_ui_setting`
- `stream_app_definition`

## Remaining Python-Owned MCP Surface

### 1. Plugin Management Gaps

- `install_plugin`
- `uninstall_plugin`
- `rescan_plugins`
- `update_plugin`
- `rollback_plugin`

The full runtime owner is now in Go under `internal/plugins`, but the MCP
transport still needs to land for these five tools.

### 2. Environment Introspection Gap

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
- treat the bounded `stream_app_definition` slice as complete and closed
- do not route missing MCP tools back through Python
- keep transport thin and add explicit Go owners where the current runtime
  boundary is still implicit
- treat `getInstalledPythonPackages` as still blocked on explicit Go ownership
  of Python-environment selection instead of implementing heuristic interpreter
  discovery

## Recommended Next Step

Execute the dedicated plugin-management transport slice in
`phase-6-plugin-management-tool-parity.md`.

This is now the highest-leverage next slice because:

- it unblocks five remaining MCP tools instead of only one
- Go now has the shared plugin store/discovery/mutation foundation under
  `internal/plugins`, but it still lacks MCP server, route, SSE, and app
  transport wiring for those five tools
- `getInstalledPythonPackages` remains blocked on Python-environment
  source-of-truth work and should not leapfrog the plugin runtime gap with a
  heuristic shell-out

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/appspec -run 'Test(ParsePatchLinesIgnoresCommentsAndBlanks|ParsePatchLineReturnsNilForInvalidPayloads|ApplyPatchOpsAppliesRootAndElementSet|ApplyPatchOpsDoesNotMutateInitialSpec|ApplyPatchOpsRequiresExistingNestedElement|ApplyPatchOpsListMutationSemantics)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntime(StreamAppDefinitionUsesProvidedBaseSpecAndPersistsResult|StreamAppDefinitionUsesStoredSpecWhenBaseSpecOmitted|StreamAppDefinitionFallsBackToEmptySpecWhenConfiguredFileIsMissing|StreamAppDefinitionRejectsInvalidNestedElementPatch)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer(ListsToolsAndScopesToolCalls|StreamAppDefinition.*)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute(SupportsStreamAppDefinition|StreamAppDefinitionAcceptsTemporaryIDs)' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsStreamAppDefinitionOverAuthenticatedSSE|ServerSupportsTemporaryIDsForStreamAppDefinitionOverAuthenticatedSSE|ToolCallRouteSupportsStreamAppDefinition)' -count=1 -timeout 420s`

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
- 2026-03-08: completed Stage 2 of the UI-setting slice by adding Go MCP
  parity for `search_ui_settings`, `get_ui_setting_value`, and
  `set_ui_setting_value`, reducing the remaining non-project-state Python MCP
  gap count from 11 to 8.
- 2026-03-08: completed Stage 3 of the UI-setting slice by adding
  `reveal_ui_setting` parity, reducing the remaining non-project-state Python
  MCP gap count from 8 to 7.
- 2026-03-08: completed `stream_app_definition` parity, reducing the remaining
  non-project-state Python MCP gap count from 7 to 6 and closing the last
  bounded app-definition MCP transport gap.
- 2026-03-08: completed the plugin-management store/discovery foundation under
  `internal/plugins`, so the highest-leverage remaining runtime gap is now the
  plugin mutation owner above that shared store/discovery layer.
- 2026-03-08: completed the plugin-management mutation owner under
  `internal/plugins`, so the highest-leverage remaining plugin gap is now the
  bounded MCP transport slice for the five plugin-management tools.
