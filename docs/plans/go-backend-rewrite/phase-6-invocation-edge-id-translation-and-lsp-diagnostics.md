# Phase 6 Invocation-Edge ID Translation And Scoped Diagnostics

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed scoped
tool-call pilot.

Go already owns:

- Setta-native tool metadata and registration
- the authenticated `/mcp` SSE transport
- the internal namespaced MCP client and runtime-status route
- the first shared scoped invocation boundary
- the first session-scoped agentic context tool
- the first filtered scoped project-summary tool

What Go still does not own is the temporary/canonical ID boundary that sits
between agent-facing MCP payloads and canonical project/runtime state.

## Status

Current repo status as of 2026-03-07:

- Go MCP calls still operate on canonical ids only
- `internal/mcpx/server.go` scopes calls correctly, but it does not yet:
  - translate agent-facing temporary ids to canonical ids before scope and
    handler execution
  - translate canonical result ids back to temporary ids before returning to
    MCP clients
- `get_latest_project_state_summary` is the only filtered scoped result tool
- `get_latest_lsp_diagnostics` is still Python-owned for MCP usage even though
  Go already owns the underlying diagnostics runtime and HTTP route

## Scope

This focused slice covers:

- a Go-owned persisted temporary-id map for MCP/runtime usage
- explicit invocation-edge translation for current scoped MCP carriers:
  - agentic context
  - known MCP tool arguments
  - filtered MCP tool results
- the first additional filtered scoped read tool:
  - `get_latest_lsp_diagnostics`
- thin app wiring so the MCP server uses the Go LSP diagnostics runtime as the
  source of truth

## Non-Goals

- broad generic temp-id translation for every future tool shape
- BM25/search parity work
- the first scoped write or structural mutation tool
- LLM/chat runtime migration
- external-agent runtime migration

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/plans/go-backend-rewrite/phase-6-scoped-tool-call-pilot.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/server.py`
- `backend/setta/mcp/utils.py`
- `backend/setta/agentic/agentic_context_payload_builder.py`
- `backend/setta/agentic/agentic_scope.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/database/db_objs.py`
- `tests/mcp/test_id_conversion.py`
- `tests/mcp/test_mcp_agentic_lsp_diagnostics_filtering.py`
- `tests/mcp/test_mcp_agentic_project_state_summary_filtering.py`

## Dependency Finding

The next MCP slice should not start with another tool port alone.

`get_latest_lsp_diagnostics` depends on the same temp-id boundary that later
chat/runtime work will depend on:

1. agent-facing MCP inputs may arrive with temporary ids
2. scope resolution and runtime lookup require canonical ids
3. filtered MCP results must return temporary ids back to the client

If we add diagnostics without first owning that boundary in Go, we either keep
canonical-only behavior or duplicate ad hoc translation in the tool handler.
Both options make later parity work harder.

## Working Decisions

- keep temp-id ownership inside `internal/mcpx`
  - this boundary belongs to MCP/chat-facing invocation, not project-state core
- persist the map under the Go runtime root
  - this is mutable runtime state, not static workspace config
- keep translation explicit for the current slice
  - translate known agentic-context fields
  - translate known tool arguments for the Go-owned MCP tool set
  - translate filtered result types through typed converters
- do not add heuristic string-rewrite fallbacks
  - any conversion path must be driven by known carrier fields or typed result
    shapes
- add diagnostics only after the translation path exists
  - diagnostics should reuse the same invocation boundary as project-summary

## Proposed Go Boundaries

### `internal/mcpx`

Own:

- temporary-id map load/refresh/persist
- temp-to-canonical argument/context translation for MCP invocation
- canonical-to-temp result translation for filtered MCP tools
- diagnostics result filtering and tool registration

Do not own:

- LSP process lifecycle
- diagnostics generation
- project-state mutation semantics

## Implementation Steps

1. Add a runtime-root-backed temporary-id store under `internal/mcpx`.
   - load canonical→temporary JSON
   - derive temporary→canonical in memory
   - persist atomically after new temp ids are introduced

2. Refactor MCP invocation to translate at the edge.
   - normalize agentic context to canonical ids before scope resolution
   - translate known tool arguments to canonical ids before handler execution
   - translate filtered tool results back to temporary ids before transport

3. Add `get_latest_lsp_diagnostics`.
   - register it as a discoverable/read tool with result filter
     `lsp_diagnostics`
   - source payloads from the Go LSP diagnostics registry
   - reuse the same scoped invocation path and filtered result translation

4. Cover the slice with focused tests.
   - temp-id conversion unit tests
   - MCP server tests for temp-id context/argument/result behavior
   - HTTP root tool-call route tests for temp-id request bodies
   - app integration tests for authenticated SSE and `/__setta__/tools/call`

## Acceptance

- MCP calls can send temporary ids for current scoped carriers and reach the
  same canonical runtime state
- filtered scoped results return temporary ids back to the caller
- `get_latest_lsp_diagnostics` is Go-owned on the MCP path
- temp-id persistence is written through one Go-owned source of truth
- no heuristic blanket string rewriting is introduced

## Recommended Follow-On

- extend explicit invocation-edge target extraction over `IDPathsByType` for the
  first scoped write/structural tool
- add more filtered read tools only when they can reuse the same translation and
  scope boundary cleanly
