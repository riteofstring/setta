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

As of 2026-03-09, this bounded slice is landed in IDE mode.

- Go now owns plugin-defined backend MCP tool runtime through the Go MCP
  server/runtime
- the Python worker now emits a typed `host.register_mcp_tool` payload with:
  - tool name
  - description
  - input schema
  - optional output schema
  - normalized MCP metadata derived from the same Python tool-introspection
    path used by the Python MCP registry
- `internal/plugins/worker_host.go` now validates and stores backend MCP tool
  registrations
- `internal/plugins/backend_route_runtime.go` now keeps long-lived worker
  sessions alive for:
  - route-only backend plugins
  - tool-only backend plugins
  - mixed route + MCP backend plugins
- `internal/mcpx/server.go` now supports bounded dynamic tool registration
  after server construction
- the real app now registers plugin-backed MCP tools into the authenticated Go
  MCP server at startup and proxies invocation through `plugin.invoke_mcp_tool`

## Completed Scope

This slice landed:

- worker-host support for `host.register_mcp_tool`
- an explicit cross-runtime registration payload for plugin MCP tools
- a Go-owned live plugin MCP tool runtime over persistent worker sessions
- dynamic plugin tool registration into the Go MCP server
- focused worker/plugin/runtime/app coverage for:
  - payload normalization
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

## Decisions Made

- keep the MCP registration contract explicit
  - do not guess schemas from tool names or fallback to opaque `args/kwargs`
    blobs unless the worker explicitly declares such a schema
- keep worker lifetime shared and explicit
  - plugin tool calls now target the same long-lived worker-session runtime
    used by backend route proxying when a plugin owns both surfaces
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
- accept the current Go SDK output-schema constraint at the transport edge
  - `github.com/modelcontextprotocol/go-sdk/mcp` requires SDK-registered tool
    output schemas to be object-shaped
  - plugin tools can currently return scalar payloads
  - the bounded server-side decision for this slice is:
    - keep actual tool results unchanged
    - normalize only the SDK-facing output schema to a permissive object when
      the worker does not provide an object schema

## Landed Design

1. The worker registration payload for `host.register_mcp_tool` is now typed.
   - The worker builds the payload from the actual callable using the Python
     MCP tool-introspection path under `backend/setta/mcp/tool_registry.py`.

2. Go now has a typed MCP tool registrar/runtime owner.
   - `internal/plugins` carries `RegisteredMCPTool` plus `MCPToolRegistry`.
   - registrations are captured during backend plugin startup.

3. `internal/mcpx.Server` now supports bounded dynamic tool registration.
   - plugin tools register into the shared `tools.Registry`
   - plugin tools are added to the SDK server
   - discoverable plugin tools are appended to tool-search indexing

4. Tool-owning plugins now start through the existing live backend runtime.
   - the runtime no longer assumes "route ownership only"
   - tool-only and mixed route+tool fixtures keep a live worker session

5. Invocation remains bounded.
   - tool handlers forward canonical arguments to `plugin.invoke_mcp_tool`
   - worker `result` payloads are returned unchanged
   - worker RPC failures surface through MCP tool errors without adding route-
     shaped transport shims

## Verification

- Python:
  - targeted worker tests for MCP tool payload shape and invalid payloads
  - targeted plugin-manager tests for worker-request parsing and backend MCP
    fixture behavior
- Go `internal/plugins`:
  - worker-host MCP registration validation
  - tool-only backend MCP runtime startup and invocation
  - mixed route + MCP runtime startup and invocation
- Go `internal/mcpx`:
  - dynamic runtime tool registration into the server
  - discoverable tool search/listing after runtime registration
- Go `internal/app`:
  - authenticated MCP listing/invocation for backend plugin tools
  - existing backend-route app test rerun against the updated mixed fixture

## Open Questions

- No blocking open question remains inside this bounded slice.
- Deferred follow-ons remain unchanged:
  - plugin static-dir serving
  - plugin listener-endpoint registration/dispatch
  - `host.read_project_state` support
  - plugin tool hot-reload after install/link/rescan/update flows

## Next Recommended Step

Do not broaden plugin backend-host work speculatively.

The next plugin follow-on should only be pulled forward when a concrete caller
requires one of:

1. plugin static-dir serving
2. plugin listener-endpoint dispatch
3. `host.read_project_state` inside live backend workers
4. plugin runtime refresh/hot-reload after mutation flows
