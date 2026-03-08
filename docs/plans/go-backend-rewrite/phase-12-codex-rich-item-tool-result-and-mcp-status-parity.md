# Phase 12 Codex Rich Item, Tool-Result, And MCP Status Parity

## Purpose

This doc narrows the remaining Phase 12 external-agent parity work into one
bounded slice over the completed Go-owned runtime and real executor boundary.

The goal of this slice is not "finish all remaining external-agent parity" in
one change. The goal is to land the highest-leverage missing runtime data path:

- richer Codex `response_item` handling for tool-call and tool-result rich runs
- durable Go-owned persistence of Codex external MCP runtime-status snapshots
- focused tests that prove the runtime now preserves those richer run outputs

Codex is the right first slice because it has the richest currently-used typed
item surface, the strongest Python parser coverage, and the weakest current Go
coverage relative to that reference.

## Current Status

Completed before this slice:

- Go-owned external-agent config lookup and bounded preflight
- Go-owned external-agent send, hydrate, stop, approval, and question transport
- Go-owned active runtime with persisted run ownership and live chat overlays
- real Codex app-server execution behind the Go runtime boundary
- real OpenCode sidecar execution behind the same boundary
- real Claude SDK bridge execution behind the same boundary

Still missing before this slice:

- Codex `response_item` parity beyond plain assistant text messages
- Go-owned persistence of Codex tool-result rich turn outputs
- Go-owned external MCP runtime-status snapshots for the active runtime read
  path
- the follow-on OpenCode and Claude parity work that should reuse the same
  runtime patterns

## Scope

This slice should deliver:

- richer Codex `response_item` parsing in `internal/externalagents`
  - reasoning content that survives into persisted assistant messages
  - tool-call message updates from rich item envelopes
  - tool-result message persistence for supported rich item/result payloads
- Go-owned Codex external MCP status capture and persistence
  - seed from startup `mcpServerStatus/list`
  - snapshot to run outputs on completion/failure/cancellation
  - durable readback through the existing chat/runtime hydration path
- focused tests covering:
  - Codex response-item tool-call persistence
  - Codex response-item tool-result persistence
  - Codex rich assistant/reasoning item closeout
  - Codex external MCP status snapshot persistence and readback

## Non-Goals

- full OpenCode rich tool-result parity in the same commit
- full Claude tool-result parity in the same commit
- external-agent websocket fanout redesign
- auth/header parity work unless the Codex status path directly depends on it
- recreating the Python event parser shape 1:1

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-codex-app-server-executor-runtime.md`
- `docs/reference/external-agents.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/codex_app_server.py`
- `tests/agentic/test_external_agent_runner.py`
- `tests/agentic/test_codex_app_server_adapter.py`
- `internal/externalagents/codex_executor.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/service.go`
- `internal/httpapi/ai_routes.go`

## Recommended Design

1. Keep Codex execution ownership in the existing executor.
   - Do not move item parsing into routes or send-service code.

2. Keep persisted run outputs as the source of truth.
   - Rich item handling should update live chat state and immediately persist the
     derived `messages` output.
   - MCP status snapshots should be written into run outputs so completed-chat
     reads do not depend on an active in-memory run.

3. Prefer typed helper functions over a giant protocol switch.
   - Separate helpers for:
     - reasoning/message content extraction
     - tool-call upserts
     - tool-result message building
     - MCP status extraction and snapshot persistence

4. Match Python semantics where they are already the product source of truth.
   - Use the current Python runner/adapter behavior as capability reference for:
     - which Codex item/result payloads become tool messages
     - how MCP status snapshots survive active-run cleanup

5. Keep the slice Codex-first on purpose.
   - The follow-on OpenCode and Claude work should reuse the resulting runtime
     helpers instead of broadening this change across all adapters at once.

## Proposed Landing Order

1. Add Codex-focused runtime/executor helpers for:
   - external MCP status capture and snapshot persistence
   - richer `response_item` handling

2. Add focused Codex executor tests for:
   - tool-call persistence
   - tool-result persistence
   - reasoning/message closeout
   - MCP status snapshot persistence

3. Update the broader Phase 12 docs so the remaining gap becomes:
   - OpenCode and Claude rich item/tool-result parity over the same runtime
     helpers

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Codex|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'AI|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- start with Codex because it has the highest product-value parser gap and the
  strongest typed Python reference surface
- keep MCP runtime-status persistence in Go run outputs instead of relying on
  active in-memory state
- keep OpenCode and Claude follow-on work explicitly deferred until the Codex
  helper pattern is proven

## Open Questions

- whether the first Codex tool-result slice should cover only currently-observed
  command/file-change/MCP outputs or also generic item variants
  - recommendation: cover the currently-typed item/result variants that already
    have Python reference tests, and only broaden further if the Go tests expose
    a concrete missing user-facing flow

## Next Recommended Step

- implement the Codex-first rich item/tool-result and MCP status slice in Go,
  then use the resulting runtime helpers to scope the OpenCode and Claude
  follow-on docs instead of keeping one undifferentiated parity bucket
