# Phase 6 Scoped Tool-Call Pilot

## Purpose

This doc narrows the next bounded Phase 6 slice after the completed internal
MCP client and runtime-status work.

Go already owns:

- Setta-native tool metadata and registration
- the authenticated `/mcp` SSE transport
- the internal namespaced MCP client and runtime-status route

This slice is now complete.

## Status

Current repo status as of 2026-03-07:

- `internal/tools.Metadata` now owns:
  - `AccessType`
  - `IDPathsByType`
  - `DefaultTargetSingletonSection`
  - `ResultFilter`
- `internal/mcpx/agentic_context.go` now owns:
  - normalized agentic-context extraction from MCP `_meta`, request headers, and
    session state
  - scope resolution over `projectConfig.agenticEdges`
  - fail-closed scope-denied result shaping
- `internal/mcpx/project_summary.go` now owns the first Go project-summary
  filter path for MCP agents
- `internal/mcpx/server.go` now owns:
  - a shared scoped invocation boundary for both MCP and HTTP tool calls
  - session-scoped `set_agentic_context`
  - filtered `get_latest_project_state_summary`
  - fail-closed scope requirements for non-allowlisted tools, including
    `read_file_range`
- `internal/httpapi/mcp_tool_routes.go` now owns authenticated
  `/__setta__/tools/call`

## Scope

This focused slice covers:

- a normalized Setta-owned agentic-context carrier for MCP tool calls
- one small unscoped allowlist
- one session-scoped init tool:
  - `set_agentic_context`
- one filtered scoped pilot tool:
  - `get_latest_project_state_summary`
- one thin non-MCP HTTP tool-call route only if it reuses the same invocation
  boundary cleanly

## Non-Goals

- temporary/canonical ID translation parity
- broad tool parity across project-state, UI-setting, or terminal tools
- LSP diagnostics MCP parity in the same slice
- chat/LLM runtime migration
- external-agent runtime migration

## Inputs

- `docs/plans/go-backend-rewrite/archive/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/archive/phase-6-internal-mcp-client-and-runtime-status.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/server.py`
- `backend/setta/mcp/tool_metadata.py`
- `backend/setta/agentic/agentic_scope.py`
- `backend/setta/routers/mcp_tools.py`
- `backend/setta/types/helpers_lvl3.py`
- `backend/setta/project_state/project_state_summary_types.py`
- `tests/mcp/test_mcp_agentic_project_state_summary_filtering.py`
- `tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py`

## Working Decisions

- choose `get_latest_project_state_summary` as the pilot tool
  - `read_file_range` is too weak because it does not prove Setta's
    project-state scope boundary
  - diagnostics filtering depends on more runtime surface than needed for the
    first slice
- keep scope ownership in Setta code, not in SDK types
  - SDK request metadata and headers are only carrier inputs
  - Setta code resolves agentic context, scope, and result filtering
- fail closed for non-allowlisted tools
  - missing context blocks scoped tools
  - missing `sectionId` blocks scoped tools unless `allowUnscoped` is true
- defer temporary/canonical ID translation
  - this pilot uses Go-owned canonical ids only
  - the later LLM/chat migration can add id translation at the invocation edge
- keep the HTTP route optional but preferred
  - only add `/__setta__/tools/call` if it can call the same server-owned
    invocation function without transport-specific branching

## Completed

- extended Setta tool metadata with `ResultFilter`
- added the first Go-owned agentic-context carrier precedence:
  - MCP `_meta`
  - request headers
  - session-scoped context set by `set_agentic_context`
- added a small explicit unscoped allowlist:
  - `list_mcp_tools`
  - `set_agentic_context`
- refactored MCP tool execution behind one shared invocation function under
  `internal/mcpx/server.go`
- added the first session-scoped init tool:
  - `set_agentic_context`
- added the first filtered scoped pilot tool:
  - `get_latest_project_state_summary`
- added the first Go-owned project-summary filter over the project runtime
  source of truth
- wired `/__setta__/tools/call` through the same invocation boundary instead of
  copying scope logic into the route
- updated app wiring so the Go MCP server receives the Go project runtime as the
  source of truth for scoped tool calls

## Decisions

- keep the project-summary pilot canonical-id only for now
  - do not add temporary/canonical id translation in Slice 4
  - the later LLM/chat migration can add that boundary once the call owner
    exists in Go
- require agentic context for `read_file_range`
  - this matches the Python fail-closed posture for non-allowlisted tools
  - untargeted read tools are still allowed once a valid readable scope exists
- keep `/__setta__/tools/call` stateless
  - request-body `agenticContext` is the source of truth for that route
  - `set_agentic_context` remains meaningful for persistent MCP sessions, not
    the synthetic HTTP route session

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools -count=1 -timeout 120s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'Test(MCPRuntimeStatusRoute|MCPToolCallRoute)' -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP' -count=1 -timeout 240s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools ./internal/mcpx ./internal/httpapi ./internal/app -run 'Test(Registry|ReadFileRangeHandler|Server|MCPRuntimeStatusRoute|MCPToolCallRoute|AppIDEMCP)' -count=1 -timeout 300s`

## Follow-On

- Slice 4 is complete.
- The next recommended step is a focused post-pilot parity slice for:
  - temporary/canonical ID translation ownership at the invocation boundary
  - `get_latest_lsp_diagnostics` as the next filtered read tool
  - the first write/structural tool using explicit `IDPathsByType` target
    extraction instead of the current no-target pilot path
