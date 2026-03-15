# Phase 6 Internal MCP Client And Runtime Status

## Purpose

This doc scoped the next bounded Phase 6 slice after the completed MCP server
transport foundation.

Go already owns:

- Setta-native tool metadata and registration
- a minimal authenticated SSE MCP server at `/mcp`
- the first minimal server-owned tool set

This slice is now complete.

## Status

Current repo status as of 2026-03-07:

- `internal/mcpx/config.go` now owns the minimal MCP server config loader for
  `setta_files/llm_config.json`
- `internal/mcpx/client.go` now owns:
  - namespaced multi-server tool routing
  - per-server runtime status
  - transport wrappers for `sse`, `streamable_http`, and `stdio`
  - read-only retry after reconnect using explicit metadata/read-only hints
- `internal/httpapi/mcp_routes.go` now owns `/api/mcpServerRuntimeStatus`
- `internal/app/app.go` now owns internal MCP client construction, startup, and
  shutdown in IDE mode
- `externalServers` remains an empty list until the external-agent runtime
  migrates to Go

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

- `docs/plans/go-backend-rewrite/archive/phase-6-mcp-server-client-and-tool-registry-foundation.md`
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

## Completed

- added the minimal MCP config/runtime types under `internal/mcpx`
  - `Transport`
  - `RuntimeState`
  - `ServerRuntimeStatus`
  - `ServerConfig`
- added `LoadServerConfigs(...)`
  - loads `mcpServers` from `llm_config.json`
  - treats a missing or empty config payload as "default to Setta self-server"
    when the active Go host/port is known
  - rewrites the Setta server URL to the active Go runtime endpoint instead of
    trusting stale persisted ports
- added `internal/mcpx/client.go`
  - one connection loop per configured server
  - namespaced tool cache rebuilds on reconnect
  - explicit runtime status transitions
  - Setta-owned routing from `<serverId>__<toolName>` to the upstream session
- kept auth explicit at the app boundary
  - the app injects the current session auth cookie only for the Setta-owned
    server id
  - the MCP client itself only merges configured headers with the provided
    header source
- added `/api/mcpServerRuntimeStatus`
  - full-IDE only
  - returns internal MCP statuses, `llmConfigPath`, and
    `activeSettaFilesLocation`
  - returns `externalServers: []` until the external-agent runtime moves
- wired the app to start the internal client after handler construction and
  close it during shutdown

## Decisions

- default to the Setta self-server only when `llm_config.json` is missing or an
  empty payload
  - if the user has a real config file with no `setta` entry, keep that file as
    the source of truth instead of silently re-adding Setta
- use the active Go host/port as the source of truth for the Setta MCP URL
  - this avoids stale persisted loopback ports when the runtime moves
- keep runtime-status transport read-only and route-local shaping minimal
  - the route forwards runtime-owned server statuses
  - external runtime status stays explicitly empty until that owner exists

## Verification

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi ./internal/app -run 'Test(MCPRuntimeStatusRoute|AppIDEMCPRuntimeStatusRoute|AppIDEMCPServer)' -count=1 -timeout 240s`

## Follow-On

- Slice 4 is the next step: the scoped tool-call pilot.
- Reuse the completed namespaced client/runtime-status layer instead of adding
  scope logic to transport handlers or routes.

## Original Plan

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

## Expected Exit Criteria

- internal callers can list namespaced tools and route calls without ambiguity
- disconnected servers update runtime status explicitly instead of failing
  silently
- `/api/mcpServerRuntimeStatus` is Go-owned and returns the expected payload
- docs are updated with completed work, decisions, open questions, and the next
  recommended step
