# Phase 8 CLI Tools And API Foundation

## Purpose

This doc scopes the next bounded Go CLI slice after the completed Phase 8
session/auth foundation.

The goal is to move the tool-facing helper surface into Go without pulling in
the remaining Python mutation, launcher-management, or SSH helper commands.
This slice should make `cmd/setta-cli` sufficient for:

- local tool discovery via `setta tools`
- authenticated MCP tool calls via `setta api`

## Current Status

As of 2026-03-08:

- Go already owns the MCP tool registry and tool-call HTTP route in:
  - `internal/tools`
  - `internal/mcpx`
  - `internal/httpapi/mcp_tool_routes.go`
- Go already owns the local session/auth bootstrap helpers used by CLI
  auto-auth in:
  - `internal/settacli/cli.go`
  - `internal/auth`
  - `internal/localsessions`
- Python still owns the user-facing `tools` and `api` commands in
  `backend/setta/start.py`
- the next bounded gap is now the tool-facing CLI cluster only:
  - `setta tools`
  - `setta api`

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-7-closeout-and-cli-follow-up-boundary.md`
- `docs/plans/go-backend-rewrite/phase-8-cli-session-auth-foundation.md`
- `docs/reference/setta-cli-commands.md`
- `backend/setta/start.py`
- `backend/setta/mcp/tool_registry.py`
- `tests/start/test_start_auth_api.py`
- `tests/start/test_start_cli_helpers.py`
- `internal/mcpx/server.go`
- `internal/httpapi/mcp_tool_routes.go`
- `internal/tools/registry.go`
- `internal/settacli/cli.go`

## Boundary Choice

This slice stays intentionally narrow:

1. `setta tools`
   - local, read-only, no runtime session lookup
   - should emit the same catalog shape that the Go MCP runtime already serves

2. `setta api`
   - local tool-call wrapper over the Go-owned `RouteMCPToolCall` route
   - should reuse the completed local session/auth selection logic
   - should keep transport thin and leave tool semantics to the backend route

This slice should not broaden into:

- server start/share/app entrypoints
- launcher management
- local stop/backups mutations
- SSH `connect` / remote helpers
- plugin lockfile or other distribution-facing CLI work

## Scope

This slice should add to `cmd/setta-cli`:

- `tools`
  - emit JSON tool payloads
  - source payloads from the Go MCP registry/definition catalog, not a
    duplicated hand-maintained CLI list
- `api`
  - positional `TOOL_NAME`
  - payload sources:
    - `--json`
    - `--stdin`
    - `--file`
  - auth sources:
    - `--cookie-header`
    - `--cookie`
    - `--auth-json`
    - `--auth-stdin`
    - local auto-auth from the latest matching IDE session
  - transport options:
    - `--json-output`
    - `--timeout`
    - `--base-url`
    - `--agentic-project-config-id`
    - `--agentic-chat-id`
    - `--agentic-section-id`
- focused Go tests for:
  - tool catalog parity against the Go MCP runtime
  - payload/auth source parsing
  - invalid tool-name rejection
  - auto-auth session selection defaults
  - HTTP request shaping and structured error payloads

## Explicit Non-Goals

Do not include in this slice:

- remote `api` / SSH transport
- interactive auth/session prompts
- `stop`
- `connect`
- launcher install/update/remove parity
- plugin CLI parity
- environment-variable compatibility shims that are not already part of the Go
  CLI foundation

## Working Decisions

- keep `setta tools` source-of-truth aligned with the Go MCP catalog by
  building payloads from the Go tool definitions and schemas rather than
  scraping docs or duplicating names by hand
- keep `setta api` as a thin HTTP wrapper over `RouteMCPToolCall`
- preserve the useful machine-readable `--json-output` error contract from the
  Python CLI where it still maps cleanly onto the Go transport:
  - `InputError`
  - `UnknownTool`
  - `HTTPError`
  - `RequestError`
- default `setta api` auto-auth to IDE-mode sessions, matching the completed
  local auth foundation
- reject non-bare tool names locally before transport:
  - empty names
  - paths
  - namespaced MCP tool ids
  - known HTTP route names
- prefer explicit JSON parsing and HTTP request construction in
  `internal/settacli`; do not add framework abstractions for one command slice

## Recommended Landing Order

1. add this doc and refresh the README ordering
2. expose a Go-owned tool catalog payload helper above `internal/mcpx`
3. add `setta tools`
4. add `setta api` with payload/auth parsing and HTTP request execution
5. add focused Go tests for catalog parity and CLI command behavior
6. update this doc with completion notes, verification, and the next bounded
   follow-up slice

## Progress Notes

- 2026-03-08: created this doc after confirming that the next bounded CLI gap
  is the tool-facing `tools`/`api` cluster above the completed session/auth
  foundation.
- 2026-03-08: completed this slice by:
  - adding a Go-owned tool catalog helper in `internal/mcpx/tool_catalog.go`
    that emits the same payloads as the live Go MCP server
  - adding centralized bare-route-name validation in
    `internal/httpapi/route_names.go` so CLI tool-name validation stays aligned
    with the Go transport surface
  - extending `cmd/setta-cli` / `internal/settacli` with:
    - `tools`
    - `api`
    - structured `--json-output` error handling without stderr noise
  - adding focused Go coverage for:
    - tool catalog parity with the live Go MCP runtime
    - auto-auth IDE-session selection
    - explicit auth + payload file transport shaping
    - route-name rejection
    - structured `HTTPError` and `RequestError` payloads

## Completed Decisions

- `setta tools` now builds its payloads from the Go MCP definition catalog via
  `internal/mcpx`, not from a duplicated CLI-only list
- `setta api` remains a thin HTTP wrapper over
  `internal/httpapi.RouteMCPToolCall`
- the Go CLI now preserves the useful `--json-output` machine contract for
  input, unknown-tool, HTTP, and request failures
- bare tool-name validation now rejects known Go HTTP route names through a
  centralized helper in `internal/httpapi`
- `api` accepts flags either before or after the single tool name argument so
  it keeps the existing `setta api TOOL --flag ...` ergonomics

## Open Questions

- none for this slice

## Verification

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/settacli ./internal/mcpx ./cmd/setta-cli -count=1 -run 'Test(BuildToolPayloadsMatchesServerList|Run|SettacliHelperProcess)' -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run '^$' -count=1 -timeout 300s`

## Recommended Next Step

Choose the next bounded CLI cluster above the completed local tool/auth
foundation:

- recommended: `setta connect` plus remote `stop`, because the backend-side SSH
  launch and rollback runtime is already in Go and the remaining gap is mostly
  CLI orchestration above completed primitives
- alternative: local mutation helpers (`stop`, launcher management, `backups`) if
  desktop/distribution work becomes the immediate priority
