# Phase 12 Claude Rich Item, Tool-Result, And MCP Status Parity

## Purpose

This doc narrows the remaining Phase 12 external-agent parity work into one
bounded Claude-focused slice over the completed Go-owned runtime and real
executor boundary.

The goal of this slice is to close the last large user-visible Claude gap
without broadening into unrelated AI/runtime work:

- richer Claude `tool_result` persistence from streamed content blocks
- Go-owned Claude external MCP runtime-status seeding, capture, and snapshot
  persistence
- focused tests that prove the Claude runtime now preserves those richer run
  outputs through completion and live-run cleanup

Claude is the right next slice because Codex and OpenCode now prove the shared
runtime-helper pattern, so the remaining work is adapter-specific closeout
rather than another runtime redesign.

## Current Status

Completed before this slice:

- Go-owned external-agent config lookup and bounded preflight
- Go-owned external-agent send, hydrate, stop, approval, and question
  transport
- Go-owned active runtime with persisted run ownership and live chat overlays
- real Codex, OpenCode, and Claude executors behind the shared Go runtime
- Codex rich item/tool-result and external MCP status parity in
  `phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`
- OpenCode rich item/tool-result and external MCP status parity in
  `phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md`

Still missing before this slice:

- richer Claude `tool_result` handling from streamed content blocks
- Go-owned Claude external MCP status ownership over Claude SDK
  `system_message` payloads plus managed `mcpConfig` seeding
- persisted Claude MCP status snapshots for completed-chat readback
- any small residual Codex non-`response_item` rich items that still prove
  user-facing after Claude lands

## Scope

This slice should deliver:

- richer Claude stream parsing in `internal/externalagents`
  - persist `tool_result` content blocks as tool-result chat messages
  - persist matching `tool_result` run events
  - keep approval/question routing on the existing Go runtime path
- Go-owned Claude external MCP runtime-status ownership
  - seed unknown statuses from the bounded Claude `mcpConfig` file path when
    present
  - capture runtime statuses from Claude SDK `system_message` payloads with
    `message.mcp_servers`
  - snapshot statuses into run outputs on completion/failure/cancellation
- a narrow Claude sidecar protocol extension
  - forward Claude SDK `SystemMessage` payloads to the Go executor as
    `system_message`
  - keep the sidecar transport otherwise unchanged
- focused tests covering:
  - Claude streamed `tool_result` persistence
  - Claude persisted `tool_result` run events
  - Claude `mcpConfig` unknown-status seeding
  - Claude `system_message` MCP status capture and persisted snapshot readback

## Non-Goals

- redesigning the shared runtime or route boundary
- recreating the Python Claude adapter object graph in Go
- attachment, header, or auth parity work outside the bounded Claude
  item/status gap
- reopening Codex/OpenCode design choices that are already landed
- heuristic MCP status inference without a Claude source-of-truth payload

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-claude-sdk-bridge-executor-runtime.md`
- `docs/plans/go-backend-rewrite/phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md`
- `docs/reference/external-agents.md`
- `docs/reference/mcp-system-overview.md`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/agentic/external_adapters/claude_sdk.py`
- `backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`
- `tests/agentic/test_claude_sdk_adapter.py`
- `tests/agentic/test_external_agent_runner.py`
- `internal/externalagents/claude_executor.go`
- `internal/externalagents/external_mcp_status.go`
- `internal/externalagents/runtime.go`
- `internal/httpapi/mcp_routes.go`

## Recommended Design

1. Keep Claude execution ownership in the existing executor.
   - Do not move Claude parsing into routes or send-service code.

2. Extend the sidecar only where the SDK is the sole source of truth.
   - Forward Claude `SystemMessage` payloads unchanged enough for the Go
     runtime to build statuses from `message.mcp_servers`.
   - Do not add heuristic status synthesis in Go when the sidecar can expose
     the real payload.

3. Reuse the landed runtime helpers instead of adding Claude-only storage.
   - Use the shared external MCP status helpers and snapshot persistence path.
   - Persist Claude tool-result messages and run events immediately into the
     canonical run outputs.

4. Split Claude-rich parsing into explicit helpers instead of widening the main
   event loop.
   - Keep typed helpers for:
     - `tool_use` and `tool_result` content-block handling
     - Claude system-message MCP status extraction
     - Claude config-backed unknown-status seeding

5. Mirror the current Python behavior where it is the product source of truth.
   - Use the Python Claude adapter/runner behavior as the reference for:
     - when Claude `tool_result` blocks become tool-result messages
     - where Claude MCP runtime status comes from
     - how those statuses survive active-run cleanup

## Landing Outcome

1. Land a narrow Claude sidecar protocol extension that forwards SDK
   `SystemMessage` payloads.
2. Add Go-owned Claude tool-result persistence and persisted `tool_result` run
   events.
3. Reuse the shared runtime snapshot helpers for Claude config-backed and
   runtime-reported external MCP statuses.
4. Add focused Claude executor/runtime tests for tool-result persistence and
   persisted MCP runtime-status readback.
5. Narrow the remaining Phase 12 gap to any small residual Codex rich-item
   closeout instead of another executor or MCP-status architecture change.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Claude|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'MCPRuntimeStatus|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run '^$'`
- `source activate.sh && python -m py_compile backend/setta/agentic/external_adapters/sidecars/claude_sdk_runner.py`

## Decisions Made

- keep the Claude parity slice bounded to rich items, tool results, and MCP
  statuses instead of broadening into unrelated AI route work
- use the Claude sidecar as the protocol edge for `SystemMessage` passthrough
  because the SDK payload is the robust status source of truth
- reuse the landed shared runtime-status store/snapshot helpers rather than
  inventing a Claude-only status path
- defer any residual Codex cleanup until after the remaining Claude gap is
  closed

## Open Questions

- whether Claude emits any additional user-facing rich item classes beyond
  `tool_result` and MCP `system_message` that still matter after this slice
  - recommendation: do not broaden now; land the known product-visible gap and
    reevaluate from concrete runtime output afterward

## Next Recommended Step

- land this bounded Claude parity slice, then reassess whether the only
  remaining Phase 12 work is residual Codex cleanup or whether Phase 12 can be
  considered effectively complete for the external-agent surface
