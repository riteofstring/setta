# Phase 15 Plugin Backend MCP Tool Runtime

## Purpose

This doc scopes the next caller-driven plugin backend-runtime slice after the
landed backend route runtime and the completed thin plugin HTTP transport
closeout.

The bounded goal is to make plugin-defined backend MCP tools visible and
invokable through the Go-owned MCP server/runtime, without broadening into
plugin static-dir serving, listener-endpoint dispatch, or the full
`host.read_project_state` backend-host surface.

## Current Status

As of 2026-03-09:

- Go already owns:
  - plugin discovery, status/runtime payloads, config/lifecycle/link/lock HTTP
    transport
  - worker-backed backend registration visibility for:
    - language servers
    - external-agent adapters
    - codegen targets
  - live backend route proxying for plugins that call `register_router(...)`
- Go does not yet own plugin-defined backend MCP tool runtime
- current concrete reference material for this gap lives in:
  - `tests/plugins/test_plugin_manager.py`
    - backend fixture route + MCP tool registration
    - backend MCP fixture registration and callable behavior
  - `tests/mcp/test_plugin_tools.py`
    - backend MCP fixture registration visibility in the Python MCP tool set
- the current Go MCP server only registers static built-in tools at startup in:
  - `internal/mcpx/server.go`
- the current Go worker host advertises `host.register_mcp_tool` in the worker
  launcher allowlist, but `internal/plugins/worker_host.go` does not implement
  it yet
- the current Python worker `register_mcp_tool(...)` payload only sends:
  - `toolName`
  - `annotations`
  which is not a sufficient source of truth for a robust Go MCP tool schema
  contract

## Problem Shape

This slice is not another thin route migration.

To expose plugin MCP tools through the Go MCP server, the runtime needs:

1. a real registration owner for backend plugin tools
   - tool names must be captured at backend plugin startup
   - later tool calls must route back to the correct live worker session
2. source-of-truth MCP metadata from the worker/plugin side
   - Go cannot infer parameter schemas or descriptions from a Python callable
   - a robust contract requires explicit schema/metadata payloads from the
     worker, not heuristics or generic catch-all schemas guessed in Go
3. dynamic MCP server registration after app startup wiring
   - `internal/mcpx.Server` currently only adds tools from the static default
     catalog during construction

## Scope

This slice should cover only:

- worker-host support for `host.register_mcp_tool`
- an explicit cross-runtime registration payload for plugin MCP tools that
  includes enough metadata for Go to register them honestly
- a Go-owned plugin MCP tool runtime that:
  - starts active backend plugins with effective `registerMcpTools`
    capability
  - stores live worker sessions for registered tool owners
  - registers plugin tool handlers into the Go MCP server
  - proxies later tool invocations through `plugin.invoke_mcp_tool`
- focused Go tests and any necessary worker-side tests for:
  - registration payload normalization
  - tool listing visibility
  - tool invocation success/failure mapping
  - mixed route + MCP backend fixtures

## Non-Goals

- plugin static-dir serving
- plugin listener-endpoint registration or dispatch
- `host.read_project_state` support for backend plugins
- plugin tool hot-reload after `link`/`rescan`/install/update without restart
- plugin-defined output-schema inference beyond what the worker explicitly
  provides
- speculative widening to app/share modes without a concrete caller

## Inputs

- `docs/plans/go-backend-rewrite/README.md`
- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-backend-route-runtime-and-transport.md`
- `backend/setta/plugins/worker.py`
- `backend/setta/plugins/manager.py`
- `backend/setta/mcp/tool_registry.py`
- `backend/setta/mcp/tool_metadata.py`
- `tests/plugins/test_plugin_worker.py`
- `tests/plugins/test_plugin_manager.py`
- `tests/mcp/test_plugin_tools.py`
- `tests/fixtures/plugins/backend/`
- `tests/fixtures/plugins/backend-mcp-tools/`
- `internal/plugins/worker_host.go`
- `internal/plugins/backend_route_runtime.go`
- `internal/mcpx/server.go`
- `internal/tools/registry.go`
- `internal/app/app.go`

## Working Decisions

- keep the MCP registration contract explicit
  - do not guess schemas from tool names or fallback to opaque `args/kwargs`
    blobs unless the worker explicitly declares such a schema
- keep worker lifetime explicit
  - plugin tool calls should target a real live worker session owned by a Go
    runtime, not ad hoc per-call subprocess launches
- keep transport/runtime boundaries thin and typed
  - `internal/plugins` should own plugin worker startup, registration capture,
    and worker call proxying
  - `internal/mcpx` should own MCP-tool registration into the Go server
- keep this slice MCP-only
  - static-dir, listener-endpoint, and broader host-runtime surfaces remain
    separate follow-ons
- prefer one source-of-truth registration payload from the worker
  - description, input schema, and tool metadata should arrive from the worker
    in a typed payload instead of being recomputed inconsistently in Go

## Recommended Design

1. Extend the worker registration payload for `host.register_mcp_tool`.
   - Add a typed payload that includes:
     - `toolName`
     - `description`
     - `inputSchema`
     - optional typed metadata derived from annotations
   - Build it in Python from the actual callable using the same introspection
     pathway already used by the Python MCP tool registry.

2. Add a Go-side MCP tool registrar/runtime owner.
   - Introduce a typed `RegisteredMCPTool` plus registrar in
     `internal/plugins`.
   - Capture registrations during backend plugin startup.

3. Add dynamic MCP registration support in `internal/mcpx.Server`.
   - Expose a bounded registration method that:
     - registers the tool in the shared `tools.Registry`
     - adds the tool to the SDK server
     - updates tool-search indexing if the tool is discoverable

4. Start live worker sessions for tool-owning plugins.
   - Either extend the current backend runtime boundary or add a sibling
     runtime that uses the same worker-launcher/session model.
   - The design should avoid per-call worker launches and avoid fake schema
     fallback.

5. Keep invocation bounded.
   - Tool handlers should forward canonical arguments to `plugin.invoke_mcp_tool`
     and return the worker `result` payload unchanged unless explicit typed
     translation is required.

## Test Strategy

- add focused `internal/plugins` tests for:
  - worker-host MCP registration payload validation
  - runtime registration capture and later invocation
  - mixed route + MCP plugin startup
- add focused `internal/mcpx` tests for:
  - dynamic tool registration into the server
  - discoverable tool listing and metadata exposure
- add focused `internal/app` tests for:
  - backend MCP fixture tool visibility through the authenticated MCP server
  - successful tool invocation roundtrip against a real worker-backed fixture
- if the worker payload changes, run the relevant Python worker/plugin tests
  for that contract as part of verification

## Open Questions

- whether plugin MCP tools should reuse the exact same long-lived worker
  session as the backend-route runtime for mixed route+tool plugins, or whether
  a separate but still long-lived MCP-specific runtime is acceptable
  - recommendation: prefer one shared worker lifetime when it does not force a
    broad unstable refactor
- whether plugin tool metadata needs more than:
  - access type
  - description
  - input schema
  for the first bounded slice
  - recommendation: no; carry only the metadata needed for honest MCP
    registration now, and leave richer plugin tool annotations for a separate
    follow-on if a caller needs them

## Next Recommended Step

Implement this slice in a bounded way:

1. worker payload upgrade for `register_mcp_tool`
2. Go worker-host MCP registration support
3. dynamic registration in `internal/mcpx`
4. real app/runtime tests proving a plugin-defined MCP tool appears and can be
   called through the Go MCP server
