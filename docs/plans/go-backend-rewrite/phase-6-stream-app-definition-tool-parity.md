# Phase 6 Stream App Definition Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
UI-setting reveal parity work.

The goal is to rebuild Go-owned parity for `stream_app_definition` over the
completed app-definition read/write/validation owners, without broadening into
the frontend `/api/streamAppSpec` route or plugin-management work.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- Go now has full parity for the bounded UI-setting MCP slice, including
  `reveal_ui_setting`
- the remaining non-project-state Python MCP gap count is 7
- `stream_app_definition` is now the highest-leverage bounded gap because it
  builds directly on the completed Go app-definition ownership already present
  in `internal/appspec` and `internal/projectstate`
- Go does not yet own:
  - JSONL JSON-Pointer patch parsing/application for streamed app-spec updates
  - MCP parity for `stream_app_definition`
  - the later frontend HTTP patch-stream route semantics in
    `/api/streamAppSpec`

## Scope

This slice should cover:

- Go-owned parsing for newline-delimited JSON patch operations used by
  `stream_app_definition`
- Go-owned patch application over a bounded app-spec object model using the
  current Python semantics for `/root` and `/elements/...` patch paths
- document-level mutation ownership that resolves the base app spec from either
  `baseAppSpec` or the currently stored spec, then persists through the
  completed app-definition owners
- MCP parity for `stream_app_definition`
- focused parser, MCP, HTTP route, and authenticated SSE coverage

## Non-Goals

- frontend `/api/streamAppSpec` route migration
- chat-driven app-generation mode prompt work
- plugin management MCP parity
- heuristic patch-path handling or automatic fallback to Python
- expanding the patch format beyond the current JSONL JSON-Pointer operations

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `docs/reference/app-spec-patching.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/mcp/tools/app_tools.py`
- `backend/setta/app/spec_patch_stream.py`
- `tests/mcp/test_app_tools.py`
- `tests/app/test_spec_patch_stream.py`
- `tests/routers/test_app_spec_streaming_parsing.py`
- `internal/appspec/*`
- `internal/projectstate/app_definition_writes.go`
- `internal/projectstate/app_definition_reads.go`
- `internal/mcpx/server.go`

## Current Python Behavior

1. Tool arguments
   - accepts newline-delimited patch ops in `patches`
   - accepts optional `appSpecPath`
   - accepts optional `baseAppSpec`

2. Patch parsing
   - ignores blank lines and `//` comment lines
   - requires each non-blank line to be a JSON object
   - supports `set`, `add`, `replace`, and `remove`
   - only allows `/root` and `/elements/...` JSON Pointer paths

3. Patch application
   - starts from `baseAppSpec` when provided
   - otherwise patches the currently stored app spec when available
   - otherwise starts from a default empty spec of:
     - `{"root": "", "elements": {}}`
   - applies `/root` as a string field
   - requires nested `/elements/<id>/...` targets to already exist before
     patching them

4. Persistence
   - persists the final computed app spec through `set_app_definition`
   - returns the same bounded stored app-definition response shape as the
     non-streaming owner

## Working Decisions

- keep the patch parser and applicator explicit and Go-owned instead of routing
  patch lines back through Python
- reuse the completed Go app-definition read/write/store/validation owners for
  persistence instead of creating a second app-spec save path
- scope this slice to MCP parity only; keep `/api/streamAppSpec` transport as a
  separate follow-on once the shared parser/owner exists
- preserve the current patch format semantics exactly where they are source of
  truth, especially for allowed ops, path restrictions, and nested element
  creation rules

## Recommended Implementation Order

1. Patch runtime foundation
   - add a Go-owned JSONL patch parser and JSON-Pointer applicator in a bounded
     package near app-spec ownership
   - mirror the existing allowed op/path constraints and nested element
     semantics from Python

2. Document-level owner
   - add a `projectstate` owner for `stream_app_definition` that:
     - resolves the base spec from `baseAppSpec` or the stored app definition
     - applies the parsed patch ops
     - persists through the completed `set_app_definition` owner

3. MCP transport
   - expose `stream_app_definition` as a thin structural MCP tool
   - keep argument validation and error shaping explicit

4. Verification and doc closeout
   - add parser tests plus MCP/HTTP/app transport coverage
   - update the Phase 6 inventory after parity lands

## Verification Targets

- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/appspec -run 'Test.*Patch' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeStreamAppDefinition' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/mcpx -run 'TestServer.*StreamAppDefinition' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestMCPToolCallRoute.*StreamAppDefinition' -count=1 -timeout 300s`
- `source activate.sh && GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/app -run 'TestAppIDEMCP.*StreamAppDefinition' -count=1 -timeout 420s`
