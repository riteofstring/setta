# Phase 6 Post-Project-State MCP Surface Inventory

## Purpose

This doc inventories the remaining Python-owned MCP surface after the completed
Go parity work for `BaseProjectManager.@project_state_tool`.

The project-state overlap is now closed. What remains is the broader Python MCP
tool set implemented in `backend/setta/mcp/tools/*.py`.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go now has full parity for the Python
  `BaseProjectManager.@project_state_tool` surface
- Python currently exposes 25 non-project-state MCP tools in
  `backend/setta/mcp/tools/*.py`
- 3 of those already have Go parity:
  - `set_agentic_context`
  - `list_mcp_tools`
  - `read_file_range`
- the remaining 22 tools fall into a small read-only utility cluster plus
  several larger runtime-foundation gaps

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-app-definition-read-and-validation-tool-parity.md`
- `docs/plans/go-backend-rewrite/phase-6-remaining-mcp-mutation-gap-inventory.md`
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

## Remaining Python-Owned MCP Surface

### 1. Bounded Utility And Read Tools

These tools look like the highest-leverage follow-on because they are read-only
or init-oriented and mostly sit on top of owners that already exist in Go:

- `search_mcp_tools`
  - Go already normalizes search tags/categories in `internal/tools`, but does
    not yet expose a ranked search owner over the registered tool set.
- `get_mcp_server_runtime_status`
  - Go already exposes `/api/mcpServerRuntimeStatus` over
    `internal/mcpx.Client.RuntimeStatuses`.
- `getProjectConfigNamesAndIds`
  - Go already owns document/project metadata in `internal/projectstate`, but
    does not yet expose a small read owner for MCP bootstrap.
- `getTerminalOutput`
  - terminal history already exists in `internal/terminals.Service`, but there
    is no dedicated read-only accessor above the attachment path.
- `get_app_catalog`
  - `internal/appspec.DefaultCatalog` is already the source of truth.
- `list_app_components`
  - the same catalog owner can provide the allowed component set.
- `get_setta_docs`
  - bounded docs-root filesystem read; no large runtime dependency.

### 2. Agentic Utility And Agent-Run Gaps

- `report_completion_status`
  - bounded utility, but no Go owner exists yet.
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
arbitrary interpreter would violate the rewrite requirement to avoid heuristics.

## Working Decisions

- treat the Python project-state MCP overlap as complete and closed
- keep the follow-on work focused on bounded MCP utility/read tools before the
  larger UI-setting, plugin, and agent-runtime foundations
- do not route missing MCP tools back through Python
- keep transport thin and add explicit Go owners where the current runtime
  boundary is still implicit

## Recommended Next Step

Execute the bounded utility/read cluster in
`phase-6-general-mcp-utility-read-tools-parity.md`.

That slice should cover:

- `search_mcp_tools`
- `get_mcp_server_runtime_status`
- `getProjectConfigNamesAndIds`
- `getTerminalOutput`
- `get_app_catalog`
- `list_app_components`
- `get_setta_docs`

This cluster has the best leverage-to-scope ratio:

- it improves external MCP usability immediately
- most dependencies already exist in Go or are local to the MCP/runtime layer
- it avoids broadening into UI-setting, plugin, and agent-runner foundations

## Open Questions

- whether `getInstalledPythonPackages` belongs in a later explicit Python
  runtime-integration slice or should remain out of scope for the Go rewrite

## Verification

- doc-only inventory update; no tests run

## Progress Notes

- 2026-03-08: completed a repo-wide inventory of the remaining Python-owned MCP
  surface after the `BaseProjectManager.@project_state_tool` closeout.
- 2026-03-08: identified the bounded utility/read tool cluster as the highest
  leverage next slice and split the larger missing foundations into separate
  categories instead of mixing them into one oversized plan.
