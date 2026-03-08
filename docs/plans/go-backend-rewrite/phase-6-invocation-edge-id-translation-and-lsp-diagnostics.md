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

This slice is now complete.

Current repo status as of 2026-03-07:

- `internal/mcpx/temporary_ids.go` now owns:
  - runtime-root-backed `temporary_id_map.json` load/refresh/persist
  - canonical→temporary and temporary→canonical lookup
  - monotonic numeric temporary-id allocation
- `internal/mcpx/translation.go` now owns explicit invocation-edge translation
  for:
  - agentic context carriers
  - current Go-owned MCP tool arguments
  - filtered project-summary and diagnostics results
- `internal/mcpx/server.go` now owns:
  - temp-id translation before scope resolution and handler execution
  - filtered LSP diagnostics application before result translation
  - the new init tool `get_latest_lsp_diagnostics`
- `internal/mcpx/lsp_diagnostics.go` now owns the first Go MCP-side
  diagnostics result filter
- `internal/app/app.go` now wires the MCP server to:
  - the Go LSP diagnostics registry
  - the runtime-root temporary-id map path

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
  - the file now lives under `cfg.Paths.RuntimeRoot`
  - this keeps mutable agent/runtime state out of static workspace config
- keep translation explicit for the current slice
  - current Go-owned tools translate only known carrier fields and typed result
    shapes
  - no blanket recursive string rewriting was added
- keep temporary-id detection format-based at explicit carrier fields
  - mapped temporary ids resolve to canonical ids
  - unknown numeric ids fail as invalid MCP arguments
  - canonical ids that are already known to the map still pass through cleanly
- add diagnostics only through the shared invocation boundary
  - `get_latest_lsp_diagnostics` reuses the same scope, filtering, and
    temp-id translation path as the project-summary pilot

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

## Completed

- added a Go-owned temporary-id store under `internal/mcpx`
- persisted the temp-id map as runtime-owned JSON under the Go runtime root
- translated current MCP agentic-context carriers to canonical ids before scope
  resolution
- translated current Go-owned MCP tool arguments to canonical ids before
  handler execution
- translated filtered MCP tool results back to temporary ids before transport
- added `get_latest_lsp_diagnostics` as the next Go-owned filtered init tool
- wired MCP server construction to the Go LSP diagnostics registry
- covered the slice with focused unit, server, HTTP-route, and app tests

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'Test(TemporaryIDStore|Server)' -count=1 -timeout 300s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi ./internal/app -run 'Test(MCPToolCallRoute|AppIDEMCP(ServerSupportsAuthenticatedSSECalls|ServerSupportsTemporaryIDsOverAuthenticatedSSE|RuntimeStatusRouteReportsConnectedSelfClient|ToolCallRouteSupportsAgenticContextBody))' -count=1 -timeout 360s`

## Open Questions

- the current temp-id boundary is explicit for the current Go-owned tool set,
  but broader write/structural tool parity still needs explicit target-path
  extraction over `IDPathsByType`
- generic arbitrary MCP argument/result conversion should remain deferred until
  a stronger Go-owned id-path source of truth exists for those tools

## Recommended Follow-On

- Slice 5 is complete.
- The next recommended step is a focused write/structural slice that:
  - extracts explicit target ids through `IDPathsByType`
  - uses the completed temp-id boundary instead of adding tool-local
    translation
  - lands the first real scoped mutation tool rather than another read-only
    pilot
