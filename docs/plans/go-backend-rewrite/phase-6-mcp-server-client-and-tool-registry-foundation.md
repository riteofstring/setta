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

- Go now owns Phase 6 Slice 1 through Slice 10 foundations:
  - `internal/tools` registry and metadata normalization
  - `internal/mcpx` namespacing helpers for Setta's namespaced tool identity
  - `internal/mcpx/server.go` for the first Go-owned MCP SSE server runtime
  - `internal/mcpx/config.go` for the minimal MCP server config loader over
    `setta_files/llm_config.json`
  - `internal/mcpx/client.go` for the first Go-owned internal MCP client
    runtime
  - `internal/mcpx/temporary_ids.go` for the Go-owned temp-id map boundary
  - authenticated `/mcp` mounting in `internal/httpapi` via a root-level auth
    hook that keeps auth outside the SDK
  - `/api/mcpServerRuntimeStatus` as a thin Go-owned runtime-status transport
  - one minimal Go-owned tool set:
    - `list_mcp_tools` as the init-like tool
    - `set_agentic_context` as the first session-scoped init tool
    - `create_top_level_section` as the first structural MCP tool
    - `get_latest_project_state_summary` as the first filtered scoped pilot tool
    - `get_latest_lsp_diagnostics` as the second filtered scoped init tool
    - `set_code_section_diagnostics_mute` as the first scoped write pilot tool
    - `set_code_section_diagnostic_code_suppression` as the next scoped write
      tool
    - `read_file_range` as the first discoverable regular tool
  - structured tool failures surfaced as MCP `CallToolResult` errors with
    Setta-owned error codes
  - scoped agentic-context extraction from MCP `_meta`, request headers, and
    session state
  - invocation-edge temporary/canonical id translation for current Go-owned MCP
    carriers and filtered results
  - generic result-id temp-id translation from `Metadata.ResultIDPathsByType`
  - metadata-driven target extraction from `Metadata.IDPathsByType`
  - effective `codeObj -> section` target mapping from project-state view data
  - metadata-driven singleton target fallback
  - targeted scope-denial payloads with explicit `blockedSectionIds` and
    `targetSectionIds`
  - targeted scope-denial payloads with explicit `unmappedCodeObjIds` when
    applicable
  - a Go-owned project-state owner for top-level section construction, layout
    bookkeeping, and bounded meta-control param creation
  - authenticated `/__setta__/tools/call` reusing the shared MCP invocation
    path
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

Status:

- complete

Reference:

- `phase-6-scoped-tool-call-pilot.md`

### Slice 5: Invocation-Edge ID Translation And Scoped Diagnostics

Deliver:

- temp/canonical id translation at the MCP invocation edge
- the next filtered scoped read tool
- app/runtime wiring for Go-owned diagnostics runtime usage

Acceptance:

- current Go-owned scoped tools translate ids before scope/handler execution
- filtered results translate ids back to MCP-facing temporary ids
- diagnostics filtering reuses Go runtime state instead of route-local adapters

Status:

- complete

Reference:

- `phase-6-invocation-edge-id-translation-and-lsp-diagnostics.md`

### Slice 6: First Scoped Write Tool And Target Extraction

Deliver:

- metadata-driven target extraction from `Metadata.IDPathsByType`
- the first explicit scoped write tool
- scope-denial payloads for blocked write targets

Acceptance:

- section-targeted writes derive targets from metadata paths
- blocked writes surface explicit target and blocked section ids
- the write path reuses Go runtime owners instead of transport duplication

Status:

- complete

Reference:

- `phase-6-first-scoped-write-tool-and-target-extraction.md`

### Slice 7: CodeObj Target Mapping, Singleton Fallback, And Suppression

Deliver:

- effective `codeObj -> section` target mapping ahead of scope checks
- metadata-driven singleton fallback where tools declare implicit singleton
  targets
- explicit denial payloads for unmapped code objects
- the next scoped diagnostics-ignore write tool

Acceptance:

- `codeObj` ids are translated and resolved through metadata paths and the
  effective project view
- singleton-targeted tools resolve from declared metadata without heuristics
- denied results can surface `unmappedCodeObjIds`
- `set_code_section_diagnostic_code_suppression` is callable through Go MCP
  transports

Status:

- complete

Reference:

- `phase-6-codeobj-target-mapping-singleton-fallback-and-suppression.md`

### Slice 8: CodeObj Write Tool Parity

Deliver:

- Go-owned runtime save/mutation owners for:
  - parameter entered values
  - section `ignoreTypeErrors`
  - code-object display names
- the next code-object write tools through Go MCP:
  - `set_param_entered_value`
  - `set_type_error_ignore`
  - `set_code_obj_display_name`
- focused scope, temp-id, HTTP route, and IDE-mode app coverage for those
  tools

Acceptance:

- Go owns runtime save/mutation helpers for the selected code-object writes
- metadata-driven temp-id translation rewrites `paramInfoId`/`codeObjId`
- scope checks enforce the new tools through the shared target-resolution
  boundary
- unsupported password/dropzone param writes fail explicitly rather than
  broadening semantics heuristically

Status:

- complete

Reference:

- `phase-6-codeobj-write-tool-parity.md`

### Slice 9: Section Name Tool Parity

Deliver:

- a Go MCP `set_section_name` tool
- reuse of the existing Go rename-refactor owner instead of a second rename
  path in MCP
- focused scoped-write, temp-id, authenticated HTTP bridge, and IDE-mode app
  coverage for section rename

Acceptance:

- Go MCP exposes `set_section_name`
- scoped writes enforce section-target access for rename calls
- temp-id translation rewrites `sectionId` for rename calls
- invalid section names return structured MCP tool errors
- the app wiring reuses the existing rename-refactor owner

Status:

- complete

Reference:

- `phase-6-section-name-tool-parity.md`

### Slice 10: Create Top-Level Section Structural Tool

Deliver:

- a Go-owned project-state owner for bounded top-level section creation
- a Go MCP `create_top_level_section` structural tool over that owner
- generic result-id temp-id translation through `Metadata.ResultIDPathsByType`
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage

Acceptance:

- Go MCP exposes `create_top_level_section`
- structural scope remains explicit and fail-closed
- created result ids are temp-id translated through metadata instead of a
  tool-name branch
- stale top-level/view-mode layout state is pruned when creation mutates the
  project shape
- Python-only/internal placement carriers remain omitted from the MCP schema

Status:

- complete

Reference:

- `phase-6-create-top-level-section-structural-tool.md`

### Slice 11: Create Child Sections Structural Tool

Deliver:

- a Go-owned project-state owner for bounded child section construction and
  ordered parent insertion
- a Go MCP `create_child_sections` structural tool over that owner
- argument/result temp-id translation for `parentId` and returned `sectionIds`
- focused project-state, MCP server, authenticated HTTP bridge, and IDE-mode
  app coverage

Acceptance:

- Go MCP exposes `create_child_sections`
- structural scope remains explicit and fail-closed
- created child result ids are temp-id translated through metadata instead of a
  tool-name branch
- code parents only allow one attached terminal child and keep terminal
  bookkeeping plus concrete size rules in sync
- the IDE HTTP `createChildSections` route remains deferred

Status:

- complete

Reference:

- `phase-6-create-child-sections-structural-tool.md`

## Next Recommended Step

- Slice 11 is now complete.
- The next recommended step is `create_child_sections_via_incrementer`.
- It stays on the same structural-construction boundary instead of switching
  immediately into delete/move semantics.
- It can reuse the new child-construction owner plus the existing result-id
  metadata translation path.
- Keep `set_code_obj_name` deferred until rename validation/refactor behavior
  is ready to move as one coherent boundary.
- Keep the IDE HTTP `createTopLevelSection` route deferred until a slice
  actually needs viewport/reveal-specific transport semantics.
