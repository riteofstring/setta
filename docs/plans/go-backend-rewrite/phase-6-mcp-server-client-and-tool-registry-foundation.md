# Phase 6 MCP Server, Client, And Tool Registry Foundation

## Purpose

This doc scopes the first bounded Phase 6 work after the completed Phase 4 and
Phase 5 runtime migration slices.

The Go rewrite now owns the backend runtime foundations that MCP needs to sit
on top of:

- auth and mode-aware request context
- project-state runtime ownership
- realtime/frontend websocket delivery
- deployment/share session ownership
- terminal/LSP/plugin/runtime process supervision primitives

What Go still does not own is any MCP runtime surface. Python remains the
source of truth for:

- the MCP server transport
- the internal multi-server MCP client
- tool registration, metadata, and namespacing
- agentic scope enforcement for tool calls
- MCP runtime status used by the frontend and chat stack

## Status

Current repo status as of 2026-03-07:

- Go now owns a transport-free Phase 6 Slice 1 foundation:
  - `internal/tools` registry and metadata normalization
  - `internal/mcpx` namespacing helpers for Setta's namespaced tool identity
- there is no Go-owned MCP HTTP route or stdio bridge
- there is no Go-owned namespaced tool registry or internal MCP client
- there is no Go-owned LLM/chat runtime yet, so MCP should be scoped as a
  foundation layer instead of being coupled to chat migration immediately
- the MCP spike already narrowed the library choice toward
  `github.com/modelcontextprotocol/go-sdk` with a tight wrapper boundary

## Scope

This focused Phase 6 plan covers:

- the first Go-owned MCP abstraction boundary under `internal/mcpx`
- a custom Setta tool registry and metadata model that stays independent from
  SDK request/response types
- one authenticated Go MCP server transport for a minimal Setta-owned tool set
- one Go internal MCP client that can connect, list tools, namespace them, and
  call them
- one explicit scoped tool-call decision point using Setta-owned agentic
  context and access metadata
- runtime-status reporting needed by later frontend/chat adoption

## Non-Goals

- migrating the full LLM/chat manager in the same slice
- broad MCP tool parity with the Python backend in the first step
- full BM25 tool search parity in the first step
- UI-setting reveal flows in the first step
- rich temporary/canonical ID translation for every tool in the first step
- external-agent shell integration beyond the minimal MCP boundary

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/spike-mcp.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/external-agents.md`
- `docs/reference/logging-and-error-handling.md`
- `backend/setta/mcp/server.py`
- `backend/setta/mcp/client.py`
- `backend/setta/mcp/tool_setup.py`
- `backend/setta/mcp/tool_registry.py`
- `backend/setta/mcp/tool_metadata.py`
- `backend/setta/mcp/tools/project_state_registry.py`
- `backend/setta/mcp/namespacing.py`
- `tests/mcp/test_mcp_server_registration.py`
- `tests/mcp/test_multi_mcp_client.py`
- `tests/routers/test_mcp_tools_call_agentic_scope_enforcement.py`
- `tests/routers/test_mcp_server_runtime_status_route.py`

## Dependency Finding

The MCP migration should not start with a route port.

There are four source-of-truth layers missing in Go:

1. a custom Setta tool registry and annotation model
2. an MCP server runtime that keeps auth, scope, and transport concerns outside
   the SDK core
3. an internal multi-server MCP client with namespaced tool routing and runtime
   status
4. a custom scoped invocation boundary for Setta-owned tools

The important constraint is architectural, not transport-level: SDK types and
transport handlers cannot become the product source of truth for metadata,
scope, or namespacing.

## Working Decisions

- use `modelcontextprotocol/go-sdk` behind a tight wrapper
  - SDK types stay inside `internal/mcpx`
  - Setta runtime code talks to our own registry and invocation interfaces
- keep tool metadata custom
  - access type, id paths, scope rules, search tags, and tool kind stay in our
    types, not SDK annotations alone
- keep namespacing outside the SDK
  - internal tool identity remains `<serverId>__<toolName>`
  - routing maps stay custom and explicit
- keep auth and agentic context transport-adjacent
  - route/middleware layers extract auth and context
  - invocation services receive normalized context structs
- start with one minimal end-to-end path
  - one init-like tool
  - one discoverable regular tool
  - one scoped decision point
  - one client-side namespaced call path

## Recommended Option

Implement Phase 6 MCP in four bounded slices:

1. registry and metadata foundation
2. external server transport for a minimal tool set
3. internal namespaced client and runtime status
4. scoped tool-call pilot for Setta-owned tools

Rationale:

- it preserves explicit Go runtime boundaries instead of letting the SDK shape
  the backend
- it gives the later LLM/chat migration a real tool substrate instead of
  another planning-only dependency
- it keeps the first MCP implementation narrow enough to test thoroughly before
  tool parity work starts

## Proposed Go Boundaries

### `internal/mcpx`

Own:

- SDK wrapper types and session/runtime management
- MCP server and client transport adapters
- Setta tool registry adapters
- namespaced client routing
- MCP runtime status tracking

Do not own:

- auth cookie/session extraction
- project-state mutation rules
- LLM/chat orchestration

### `internal/tools`

Own:

- Setta-native tool registration metadata
- tool kind classification
- access metadata and search annotations
- invocation interfaces independent from transport

Do not own:

- SDK session handling
- HTTP route registration

### `internal/httpapi`

Own:

- authenticated external MCP route mounting
- request-context extraction for scoped tool calls
- any explicit runtime-status route needed by the frontend

Do not own:

- tool metadata derivation
- namespaced routing
- scope evaluation logic

## Implementation Slices

### Slice 1: Registry And Metadata Foundation

Deliver:

- `internal/tools` registry primitives for:
  - init tools
  - discoverable tools
  - Setta-owned metadata annotations
- a thin `internal/mcpx` adapter that can expose registry entries to the SDK
- one minimal Setta-owned tool registration path with tests

Acceptance:

- SDK types do not leak outside `internal/mcpx`
- tool metadata stays available without reflecting over SDK internals
- tool identity and kind are explicit before transport is added

Status:

- complete

Completed:

- added `internal/tools` with:
  - `Kind`, `AccessType`, and `IDType` source-of-truth enums
  - `Metadata.Normalize(...)` for explicit kind/access validation
  - Python-parity search-tag/category derivation from tool names
  - a deterministic in-memory `Registry` with duplicate rejection and sorted
    listing
- kept the first handler boundary transport-free:
  - registry entries store Setta-owned handler functions instead of MCP SDK
    tool/session types
- added `internal/mcpx/namespacing.go` with Python-parity helpers for:
  - building `<serverId>__<toolName>`
  - splitting namespaced tool ids
  - normalizing legacy Setta tool-name prefixes
- covered Slice 1 with focused Go tests in:
  - `internal/tools/registry_test.go`
  - `internal/mcpx/namespacing_test.go`

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/tools ./internal/mcpx -count=1 -timeout 180s`

### Slice 2: External MCP Server Transport

Deliver:

- Go-owned MCP server mounting under a clean `internal/httpapi` boundary
- authenticated transport wiring for one minimal tool set
- one init-like tool and one regular tool callable end to end
- structured error mapping for tool failures

Acceptance:

- one external MCP client can initialize, list tools, and call a tool
- auth is enforced outside the SDK instead of inside tool handlers
- tool failures are surfaced as structured MCP tool errors

### Slice 3: Internal Namespaced Client And Runtime Status

Deliver:

- Go internal MCP client for one or more configured servers
- namespaced tool catalog and call routing
- runtime-status tracking for connection state and failures
- one focused status transport surface for later frontend/chat use

Acceptance:

- internal callers can list and call namespaced tools without ambiguity
- disconnected servers fail explicitly and update runtime status
- runtime status is a Go-owned source of truth, not a route-local adapter

### Slice 4: Scoped Tool-Call Pilot

Deliver:

- normalized agentic context carrier for MCP tool calls
- one scoped Setta-owned tool call path
- one small unscoped allowlist for init/discovery tools
- explicit scope-denied result shaping

Acceptance:

- missing or invalid scope context fails closed
- allowed unscoped init/discovery tools still work
- scope decisions use Setta-owned metadata and context, not keyword heuristics

## Open Questions

- whether the first Go server transport should expose SSE only, or both SSE and
  streamable HTTP immediately
- which minimal scoped pilot tool is the best anchor:
  - project-state summary
  - diagnostics summary
  - file-read
- whether temporary/canonical ID translation should start in the scoped pilot
  slice or wait for the later LLM/chat migration

## Next Recommended Step

- Implement Slice 2 next.
- Keep the first tool set intentionally small and avoid pulling LLM/chat
  orchestration into the MCP foundation work.
- Do not pin the MCP SDK in `go.mod` until Slice 2 actually needs the server
  transport adapter.
