# Phase 6 General MCP Utility Read Tools Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
project-state MCP closeout and the broader post-project-state inventory.

The goal is to land the highest-leverage remaining Python-owned MCP tools that
are read-only, init-oriented, or otherwise close to existing Go owners.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go already owns the full Python `BaseProjectManager.@project_state_tool`
  overlap
- the remaining Python-owned MCP surface is now tracked in
  `phase-6-post-project-state-mcp-surface-inventory.md`
- the best next bounded slice is the general utility/read tool cluster

## Scope

This slice should cover:

- `search_mcp_tools`
- `get_mcp_server_runtime_status`
- `getProjectConfigNamesAndIds`
- `getTerminalOutput`
- `get_app_catalog`
- `list_app_components`
- `get_setta_docs`

It should include:

- any small Go owners needed below the MCP transport
- MCP parity in `internal/mcpx`
- focused HTTP tool-route and authenticated SSE coverage where applicable
- focused tests for runtime owners and tool-call behavior

## Non-Goals

- `getInstalledPythonPackages`
- `report_completion_status`
- agent-profile or agent-run execution tools
- generic UI-setting search/read/write/reveal tools
- plugin install/update/rollback tools
- `stream_app_definition`
- frontend UI changes outside the existing MCP transport surfaces

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/base_tools.py`
- `backend/setta/mcp/tools/tool_search.py`
- `backend/setta/mcp/tools/listener_docs.py`
- `backend/setta/mcp/tools/app_tools.py`
- `tests/mcp/test_base_tools.py`
- `tests/mcp/test_mcp_server_registration.py`
- `internal/mcpx/server.go`
- `internal/tools/registry.go`
- `internal/tools/metadata.go`
- `internal/mcpx/client.go`
- `internal/httpapi/mcp_routes.go`
- `internal/terminals/service.go`
- `internal/appspec/catalog.go`
- `internal/projectstate/document.go`
- `internal/projectstate/runtime.go`

## Current Python Behavior

1. `search_mcp_tools`
   - searches discoverable tool names, descriptions, parameter docs, and
     search tags/categories
   - rejects empty queries
   - can filter by server ID

2. `get_mcp_server_runtime_status`
   - returns current runtime connection state for configured MCP servers

3. `getProjectConfigNamesAndIds`
   - returns bootstrap metadata for all known project configs

4. `getTerminalOutput`
   - returns terminal history for the requested terminal section

5. `get_app_catalog`
   - returns the app-render catalog JSON used for app generation

6. `list_app_components`
   - returns the allowed component type names from the catalog

7. `get_setta_docs`
   - returns bundled docs content from `docs/`, with a default listener-focused
     subset when no IDs are supplied

## Working Decisions

- keep `search_mcp_tools` server-local in Go over the registered tool set; do
  not bounce search through the internal MCP client
- use the existing `internal/mcpx.Client.RuntimeStatuses` owner for
  `get_mcp_server_runtime_status`
- add an explicit read owner for project config metadata instead of reading
  random transport DTOs
- add a read-only terminal history accessor instead of reusing websocket
  attachment side effects for MCP reads
- use `internal/appspec.DefaultCatalog()` as the app catalog source of truth
- keep docs loading bounded to the repo `docs/` tree with explicit path
  validation

## Dependency Status

Existing Go owners already available:

- MCP client runtime status snapshots
- tool registry metadata normalization
- terminal history buffering
- app catalog source of truth
- repo-local docs tree

Small new owners still needed:

- a discoverable-tool search owner/ranker over the Go registry
- a project metadata read owner for project IDs and names
- a read-only terminal history accessor above `internal/terminals.Service`

## Verification Targets

- `internal/mcpx`
  - tool registration/listing
  - search result behavior
  - runtime-status tool behavior
  - bootstrap/read tool call behavior
- `internal/httpapi`
  - MCP tool-route coverage for each new tool
- `internal/app`
  - authenticated SSE and MCP tool-route coverage
- any new local owner packages
  - project metadata read behavior
  - terminal history accessor behavior
  - docs path validation behavior

## Open Questions

- whether `search_mcp_tools` should stay in this slice if its ranking owner
  turns out materially larger than expected; current recommendation is yes
  because the registry metadata work is already in place

## Next Recommended Step

- implement this utility/read cluster end-to-end before moving to UI-setting,
  plugin, or agent-profile MCP gaps
