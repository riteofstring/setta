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

Completed in this slice:

- `internal/externalagents/runtime.go` plus
  `internal/externalagents/external_mcp_status.go`
  - Go-owned active external MCP runtime-status storage
  - snapshot persistence to run outputs on completion/failure/cancellation
  - durable readback for the external MCP runtime-status route
- `internal/externalagents/codex_executor.go` plus
  `internal/externalagents/codex_response_items.go`
  - richer Codex `response_item` handling for:
    - assistant reasoning + text content
    - function-call tool-call persistence
    - function-call output tool-result persistence
  - persisted Codex `tool_result` run events for response-item tool outputs
  - post-activation Codex MCP status capture through `mcpServerStatus/list`
- `internal/httpapi/mcp_routes.go` and `internal/app/app.go`
  - thin MCP runtime-status transport now includes external-agent runtime
    statuses from the Go runtime owner instead of always returning an empty
    `externalServers` list
- focused tests in:
  - `internal/externalagents/runtime_test.go`
  - `internal/externalagents/codex_executor_test.go`
  - `internal/httpapi/mcp_routes_test.go`

Still missing after this slice:

- richer OpenCode tool-result parity over the same runtime helpers
- richer Claude tool-result parity over the same runtime helpers
- any remaining Codex non-`response_item` rich item types that prove to be
  user-facing gaps after this landing

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

## Landing Outcome

1. Added Go-owned external MCP runtime-status storage and persisted snapshot
   readback in the external-agent runtime.
2. Landed richer Codex `response_item` handling for reasoning, tool calls, and
   tool results in the Go executor.
3. Wired external MCP runtime statuses into the existing IDE MCP status route.
4. Added focused runtime, executor, and route tests for the landed slice.
5. Narrowed the remaining Phase 12 gap to the OpenCode/Claude follow-ons plus
   any still-missing Codex non-`response_item` rich items.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Codex|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'AI|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- start with Codex because it has the highest product-value parser gap and the
  strongest typed Python reference surface
- keep MCP runtime-status persistence in Go run outputs instead of relying on
  active in-memory state
- request Codex MCP runtime status only after the send path activates the Go
  runtime, because executor `Start(...)` runs before runtime activation
- keep OpenCode and Claude follow-on work explicitly deferred until the Codex
  helper pattern is proven

## Open Questions

- whether the next parity slice should start with OpenCode tool-result closeout
  or Claude tool-result closeout
  - recommendation: start with OpenCode because the runtime already has
    question-state ownership there, so the remaining gap is mostly richer
    tool-result/item persistence rather than another interaction shape

## Next Recommended Step

- with the bounded Codex raw non-`response_item` tool-item follow-on now
  landed in `phase-12-codex-raw-tool-item-parity.md`, reassess whether any
  concrete user-facing Codex/runtime gap still remains before broadening
  Phase 12 further
