# Phase 6 Scoped Tool-Call Pilot

## Purpose

This doc narrows the next bounded Phase 6 slice after the completed internal
MCP client and runtime-status work.

Go already owns:

- Setta-native tool metadata and registration
- the authenticated `/mcp` SSE transport
- the internal namespaced MCP client and runtime-status route

What Go does not yet own is the first Setta-native scoped invocation boundary.
Today the Go MCP server still treats every registered tool call like a plain
transport invocation with no agentic context, session-scoped context, or
project-state filtering.

## Status

Current inspection as of 2026-03-07:

- `internal/mcpx/server.go` still invokes registered tool handlers directly
  after JSON argument decode
- `internal/tools.Metadata` already owns the core access metadata needed for
  scope decisions:
  - `AccessType`
  - `IDPathsByType`
  - `DefaultTargetSingletonSection`
- the Go runtime already owns the project-state source of truth needed for a
  scoped pilot:
  - `internal/projectstate`
  - `internal/projectview`
- the Python backend remains the source of truth for:
  - agentic-context carrier precedence
  - scope resolution over `agenticEdges`
  - project-state summary result filtering
  - the synthetic `/__setta__/tools/call` route behavior

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

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-internal-mcp-client-and-runtime-status.md`
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

## Planned Implementation

### 1. Agentic context + invocation boundary

Add Setta-owned types under `internal/mcpx` for:

- agentic context
- normalized request context for tool calls
- session-scoped context storage
- scope-denied tool error payloads

Refactor tool execution so both MCP transport handlers and any future HTTP tool
route call the same invocation function.

### 2. Scoped pilot tool

Add:

- `set_agentic_context`
- `get_latest_project_state_summary`

Use the Go project runtime as the source of truth for:

- project existence checks
- `agenticEdges` traversal
- filtered project-summary construction

### 3. Thin HTTP tool-call route

If the invocation refactor is clean, add a thin authenticated route for
`/__setta__/tools/call` that:

- validates the bare tool name
- accepts an optional `agenticContext` object
- synthesizes the normalized request context
- forwards directly into the shared server invocation path

## Expected Exit Criteria

- `list_mcp_tools` remains callable without scope context
- `set_agentic_context` can establish session-scoped agentic context
- `read_file_range` and `get_latest_project_state_summary` fail closed when
  context is missing
- `get_latest_project_state_summary` returns a filtered result based on the
  resolved scope instead of the full project snapshot
- if added, `/__setta__/tools/call` reuses the same scoped invocation pathway
  instead of copying scope logic into the route
