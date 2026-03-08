# Spike: MCP

## Purpose

This doc now records the outcome of the MCP spike rather than a pending
uncertainty-reduction task.

The rewrite no longer needs to decide whether MCP is viable in Go. That work is
already represented by the current `internal/mcpx` implementation and the Phase
6 follow-up docs that built on it.

## Status

Current repo status as of 2026-03-08:

- `github.com/modelcontextprotocol/go-sdk` is pinned in `go.mod`
- `internal/mcpx/server.go` owns the Go MCP server boundary
- `internal/mcpx/client.go` owns the Go internal multi-server MCP client
- `internal/httpapi/mcp_tool_routes.go` and `internal/app/app.go` own the thin
  authenticated transport wiring around the MCP runtime
- the Phase 6 MCP parity work is complete for the tracked Python MCP surface

## Recommendation

Use `github.com/modelcontextprotocol/go-sdk` behind a tight wrapper.

The current Go boundary is the right shape:

- keep SDK types inside `internal/mcpx`
- keep auth outside the SDK and in the route/runtime layer
- keep namespacing, agentic context, scope enforcement, tool metadata, and
  temporary-id translation as Setta-owned logic
- keep tool registration source-of-truth in `internal/tools`, not in SDK-only
  structures

## Outcome

### Server role

The SDK is good enough for the Setta-owned server role when it stays wrapped.

The rewrite already uses it for:

- authenticated SSE transport via `internal/mcpx/server.go`
- tool registration driven by Setta metadata
- structured tool errors mapped through Setta-owned error codes
- scoped invocation through Setta-owned request context

### Client role

The SDK is also good enough for the internal client role when routing remains
custom.

The rewrite already uses it for:

- namespaced tool routing by `<serverId>__<toolName>`
- runtime status tracking per configured MCP server
- reconnect-aware read-only tool retries
- transport support for `sse`, `streamable_http`, and `stdio`

### Product-specific glue that stays custom

These concerns should remain outside the SDK boundary:

- auth header/cookie injection
- agentic context extraction and persistence
- scope enforcement and blocked-target payload shaping
- tool metadata normalization and search indexing
- canonical/temporary ID translation
- frontend-affinity and Setta-specific realtime integration

## Exit Criteria Result

The original spike exit criteria are satisfied in real code:

- one authenticated end-to-end MCP tool call works
- server and client integration are both viable
- the abstraction boundary is explicit in `internal/mcpx` and `internal/tools`
- the accept decision is now locked in practice

## Inputs

- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/server.py`
- `backend/setta/mcp/client.py`
- `tests/mcp/test_mcp_server_registration.py`
- `tests/mcp/test_multi_mcp_client.py`
- `internal/mcpx/server.go`
- `internal/mcpx/client.go`
- `internal/mcpx/server_test.go`
- `internal/mcpx/client_test.go`
- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`

## Next Step

Treat this spike as closed.

Future MCP work should start from the completed Phase 6 docs or a new bounded
follow-up doc, not from re-running the library-selection question.
