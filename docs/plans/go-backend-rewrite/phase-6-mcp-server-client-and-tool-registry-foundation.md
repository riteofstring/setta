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

What Go still does not own is the remaining MCP runtime surface above the first
external transport slice. Python remains the source of truth for:

- the internal multi-server MCP client
- tool registration, metadata, and namespacing
- agentic scope enforcement for tool calls
- MCP runtime status used by the frontend and chat stack

## Status

Current repo status as of 2026-03-07:

- Go now owns Phase 6 Slice 1, Slice 2, and Slice 3 foundations:
  - `internal/tools` registry and metadata normalization
  - `internal/mcpx` namespacing helpers for Setta's namespaced tool identity
  - `internal/mcpx/server.go` for the first Go-owned MCP SSE server runtime
  - `internal/mcpx/config.go` for the minimal MCP server config loader over
    `setta_files/llm_config.json`
  - `internal/mcpx/client.go` for the first Go-owned internal MCP client
    runtime
  - authenticated `/mcp` mounting in `internal/httpapi` via a root-level auth
    hook that keeps auth outside the SDK
  - `/api/mcpServerRuntimeStatus` as a thin Go-owned runtime-status transport
  - one minimal Go-owned tool set:
    - `list_mcp_tools` as the init-like tool
    - `read_file_range` as the first discoverable regular tool
  - structured tool failures surfaced as MCP `CallToolResult` errors with
    Setta-owned error codes
  - namespaced multi-server tool routing and per-server runtime status tracking
- the MCP SDK is now pinned in `go.mod`
- the first Go server transport is SSE-only
- there is no Go-owned stdio bridge yet
- there is no Go-owned LLM/chat runtime yet, so MCP should be scoped as a
  foundation layer instead of being coupled to chat migration immediately
- the MCP spike recommendation is now exercised in real code:
  `github.com/modelcontextprotocol/go-sdk` behind a tight wrapper boundary

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

Status:

- complete

Completed:

- added `internal/mcpx/server.go` as the first tight SDK wrapper boundary for
  server transport
  - the SDK remains contained inside `internal/mcpx`
  - Setta-owned tool metadata stays in `internal/tools` and is exposed to MCP
    clients under tool `_meta.setta`
- mounted the first authenticated MCP transport under `/mcp`
  - `internal/httpapi` now supports authenticated root routes separate from the
    `/api` subtree
  - auth is enforced by `httpapi` middleware before requests reach the MCP SDK
- shipped the first minimal Setta-owned tool set:
  - `list_mcp_tools` returns the sorted registered tool names
  - `read_file_range` reads UTF-8 workspace files with explicit path-root
    enforcement and line-range validation
- kept the first regular tool unscoped on purpose
  - this slice proves transport + metadata + structured tool errors
  - scoped invocation stays deferred to Slice 4
- added focused Go tests for:
  - file-read tool behavior parity over temp workspaces
  - Setta metadata exposure and structured tool errors over in-memory MCP
    sessions
  - authenticated root-route enforcement in `internal/httpapi`
  - black-box authenticated SSE MCP calls through `internal/app`

Decisions:

- expose SSE only in Slice 2
  - this keeps the first transport slice narrow and matches the documented
    Python external-agent posture closely enough to move Phase 6 forward
  - streamable HTTP remains a possible later addition if it becomes necessary
- use SDK-native SSE endpoint shape at `/mcp`
  - do not preserve the Python `/mcp/messages/` split route shape
  - the clean-break rewrite can adopt the SDK's single-endpoint SSE flow
- do not allow per-call workspace-root overrides on the Go file-read tool
  - workspace confinement is owned by server construction, not by tool-call
    arguments

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx ./internal/httpapi -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run TestAppIDEMCPServerRejectsUnauthorizedClients -count=1 -timeout 45s -v`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run TestAppIDEMCPServerSupportsAuthenticatedSSECalls -count=1 -timeout 45s -v`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx ./internal/httpapi ./internal/app -run 'Test(Server|ReadFileRange|HandlerProtectsAuthenticatedRootRoutes|AppIDEMCPServer)' -count=1 -timeout 180s`

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

Status:

- complete

Completed:

- added `internal/mcpx/config.go` with:
  - `mcpServers` loading from `setta_files/llm_config.json`
  - default Setta self-server config when the file is missing/empty and the Go
    runtime host/port is known
  - Setta self-server URL normalization to the active Go runtime endpoint
- added `internal/mcpx/client.go` with:
  - transport support for `sse`, `streamable_http`, and `stdio`
  - one connection loop per configured server
  - namespaced tool catalogs split into init/discoverable sets
  - explicit routing from `<serverId>__<toolName>` to the upstream tool name
  - runtime status transitions and read-only reconnect retry
- added `internal/httpapi/mcp_routes.go`
  - `POST /api/mcpServerRuntimeStatus`
  - full-IDE mode gate
  - thin response shaping over runtime-owned statuses
  - `externalServers: []` until the external-agent runtime moves to Go
- wired `internal/app/app.go` to:
  - construct the internal MCP client in IDE mode
  - inject Setta self-auth headers at the app boundary
  - start connection loops after handler construction
  - stop the client during app shutdown
- added focused tests in:
  - `internal/mcpx/config_test.go`
  - `internal/mcpx/client_test.go`
  - `internal/httpapi/mcp_routes_test.go`
  - `internal/app/mcp_test.go`

Decisions:

- keep `llm_config.json` loading narrow in Slice 3
  - this slice only owns the MCP server registry, not broader LLM config
    semantics
- use the active Go host/port as the source of truth for the Setta server URL
  - do not trust stale persisted loopback ports for self-connect
- keep external runtime status explicitly out of scope
  - the route returns `externalServers: []` instead of adding a temporary
    compatibility adapter

Verification:

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi ./internal/app -run 'Test(MCPRuntimeStatusRoute|AppIDEMCPRuntimeStatusRoute|AppIDEMCPServer)' -count=1 -timeout 240s`

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

- which minimal scoped pilot tool is the best anchor:
  - project-state summary
  - diagnostics summary
  - file-read
- whether temporary/canonical ID translation should start in the scoped pilot
  slice or wait for the later LLM/chat migration

## Next Recommended Step

- Implement Slice 4 next.
- Use the completed internal client/runtime-status layer as the source of truth
  for scoped tool invocation.
- Keep scope enforcement in Setta-owned metadata/context services instead of
  pushing it into transport handlers.
- Use `phase-6-scoped-tool-call-pilot.md` as the active implementation doc for
  the bounded Slice 4 work.
