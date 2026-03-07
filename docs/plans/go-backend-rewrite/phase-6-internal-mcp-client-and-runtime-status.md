# Phase 6 Internal MCP Client And Runtime Status

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed MCP server
transport foundation.

Go already owns:

- Setta-native tool metadata and registration
- a minimal authenticated SSE MCP server at `/mcp`
- the first minimal server-owned tool set

Go still does not own:

- the internal MCP client used to consume one or more configured servers
- namespaced tool routing above multiple server sessions
- MCP runtime status as a Go-owned runtime source of truth
- the frontend-facing runtime-status route

## Status

Current repo status as of 2026-03-07:

- `internal/mcpx/server.go` is the first Go-owned MCP transport boundary
- `internal/mcpx/namespacing.go` already defines Setta's namespaced tool
  identity rules
- there is no Go-owned loader for `setta_files/llm_config.json`
- there is no Go-owned MCP client session manager
- there is no Go-owned `/api/mcpServerRuntimeStatus` route
- frontend-generated types still expect the runtime-status response shape used by
  Python

## Scope

This focused slice covers:

- a minimal Go config loader for MCP server definitions from
  `setta_files/llm_config.json`
- a Go-owned internal MCP client that can:
  - connect to configured servers
  - list tools
  - build a namespaced tool catalog
  - route tool calls to the correct upstream session
  - track per-server runtime status
- one Go-owned runtime-status route that returns:
  - the internal MCP client statuses
  - `llmConfigPath`
  - `activeSettaFilesLocation`
- app wiring to start and stop the internal MCP client in IDE mode

## Non-Goals

- full LLM/chat manager migration
- frontend UI changes
- external-agent runtime migration
- scope enforcement for tool calls
- BM25 search or tool-search parity
- websocket push for runtime-status changes

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-mcp-server-client-and-tool-registry-foundation.md`
- `docs/reference/mcp-system-overview.md`
- `docs/reference/urls-and-routes.md`
- `backend/setta/mcp/client.py`
- `backend/setta/llm/config.py`
- `backend/setta/types/llm_config.py`
- `backend/setta/types/mcp_runtime_status.py`
- `tests/mcp/test_multi_mcp_client.py`
- `tests/routers/test_mcp_server_runtime_status_route.py`

## Working Decisions

- keep config loading narrow
  - this slice only needs the MCP server registry from `llm_config.json`
  - broader LLM config ownership stays out of scope
- keep runtime status under `internal/mcpx`
  - status is part of client lifecycle ownership, not a route-local view model
- keep route transport thin
  - `/api/mcpServerRuntimeStatus` should forward runtime-owned data with light
    response shaping only
- keep Setta self-auth explicit
  - the internal client should inject Setta auth only for the Setta-owned
    server id
- support all three configured transports at the client boundary
  - `sse`
  - `streamable_http`
  - `stdio`
- keep external server reporting out of scope for now
  - return `externalServers: []` until the external-agent runtime moves to Go

## Implementation Plan

### 1. Config + runtime-status foundation

Add `internal/mcpx` types for:

- MCP server config
- aggregate MCP config file payload
- runtime state enum
- runtime status entry
- runtime-status response payload

Add a loader that:

- reads `setta_files/llm_config.json`
- validates MCP server ids and transport-required fields
- rewrites the Setta server URL to the active Go host/port using the runtime
  source of truth
- tolerates a missing config file by returning an empty MCP server registry

### 2. Internal client foundation

Add a Go-owned client manager under `internal/mcpx` that:

- starts one connection loop per configured server
- builds a namespaced tool catalog from `list_tools`
- stores routing as `<serverId>__<toolName> -> (serverId, toolName)`
- tracks runtime status transitions:
  - `unknown`
  - `connecting`
  - `connected`
  - `retrying`
  - `error`
  - `disabled`
- retries on transport/connect failures
- retries read-only tool calls once after reconnect when the prior session has
  closed

### 3. Thin route + app wiring

Wire the app to:

- construct the MCP client in IDE mode
- start client connection loops after the HTTP handler exists
- stop the client during app shutdown

Add `/api/mcpServerRuntimeStatus` that:

- requires full IDE runtime
- returns current internal client statuses
- returns `externalServers: []`
- returns `llmConfigPath` and `activeSettaFilesLocation`

## Verification

Run focused Go tests for:

- config loading and Setta URL normalization
- namespaced tool cache and routing
- runtime status transitions
- reconnect behavior for read-only tool calls
- runtime-status route behavior and mode gating
- app-level authenticated self-connect against the completed `/mcp` SSE server

## Expected Exit Criteria

- internal callers can list namespaced tools and route calls without ambiguity
- disconnected servers update runtime status explicitly instead of failing
  silently
- `/api/mcpServerRuntimeStatus` is Go-owned and returns the expected payload
- docs are updated with completed work, decisions, open questions, and the next
  recommended step
