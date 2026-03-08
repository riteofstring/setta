# Phase 12 Codex Raw Tool-Item Parity

## Purpose

This doc narrows the remaining Phase 12 external-agent parity gap into one
bounded Codex-focused follow-on over the completed shared Go runtime and the
landed Codex/OpenCode/Claude rich-parity slices.

The goal of this slice is to close the remaining concrete Codex gap that still
shows up in the Python reference surface:

- Go-owned Codex handling for non-`response_item` raw tool-item lifecycle
  events
- durable persistence of those raw Codex tool calls and tool results into the
  canonical run/chat state path
- focused tests proving that command execution, file changes, MCP tool calls,
  and the small generic Codex item types are no longer dropped by the Go
  runtime

This slice is the right next step because the remaining Phase 12 uncertainty is
no longer "which adapter is left". It is whether raw Codex item types outside
`response_item` still create a user-visible gap after the already-landed parity
work.

## Current Status

Completed before this slice:

- Go-owned external-agent config lookup, send/hydrate/stop/approval/question
  transport, and active runtime ownership
- real Codex, OpenCode, and Claude executors behind the same Go runtime
- Codex `response_item` rich parity in
  `phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`
- OpenCode rich item/tool-result and MCP status parity in
  `phase-12-opencode-rich-item-tool-result-and-mcp-status-parity.md`
- Claude rich item/tool-result and MCP status parity in
  `phase-12-claude-rich-item-tool-result-and-mcp-status-parity.md`

Still missing before this slice:

- Go Codex persistence for raw non-`response_item` tool items already modeled
  by the Python Codex parser:
  - `commandExecution`
  - `fileChange`
  - `mcpToolCall`
  - generic item types:
    - `collabToolCall`
    - `webSearch`
    - `imageView`
    - `enteredReviewMode`
    - `exitedReviewMode`
    - `compacted`
- buffered output-delta handling for raw Codex command/file items before
  terminal completion payloads arrive
- focused Go tests that prove those raw Codex items survive into persisted
  `messages` and `tool_result` run events

## Scope

This slice should deliver:

- a bounded Go Codex raw-item parser/helper path in `internal/externalagents`
  - recognize raw tool-item lifecycle events separate from `response_item`
  - persist tool-call metadata into assistant messages
  - persist tool-result messages on terminal completion for supported raw item
    types
  - preserve buffered command/file output deltas when terminal item payloads
    omit aggregated output/diff fields
- focused raw Codex item support for:
  - `commandExecution`
  - `fileChange`
  - `mcpToolCall`
  - generic tool item types already covered in the Python parser/tests
- persisted `tool_result` run events for those raw Codex tool outputs
- focused tests covering:
  - command execution raw item persistence
  - file change raw item persistence
  - MCP tool-call raw item persistence
  - at least one representative generic raw item persistence

## Non-Goals

- another broad rewrite of the Codex executor lifecycle
- reopening OpenCode or Claude parity work
- frontend transport or websocket redesign
- speculative Codex item types not covered by the current Python source of
  truth
- heuristic Codex item inference beyond the explicit protocol fields already
  present in the app-server payloads

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-codex-rich-item-tool-result-and-mcp-status-parity.md`
- `docs/reference/external-agents.md`
- `backend/setta/agentic/external_adapters/codex_app_server.py`
- `backend/setta/agentic/external_agent_runner.py`
- `tests/agentic/test_codex_app_server_adapter.py`
- `tests/agentic/test_external_agent_runner.py`
- `internal/externalagents/codex_executor.go`
- `internal/externalagents/codex_response_items.go`
- `internal/externalagents/runtime.go`

## Recommended Design

1. Keep Codex raw-item ownership in the existing Go executor.
   - Do not broaden routes or the send service.

2. Reuse the existing chat-state and tool-result helpers.
   - Raw Codex items should update the same canonical `messages` structure and
     run-event persistence path already used by response items and other
     adapters.

3. Add an explicit raw-item helper instead of widening `applyCodexAssistantEvent`
   into another large switch.
   - Keep raw tool-item parsing in a dedicated helper/parser state object.

4. Mirror the Python Codex parser where it is already the product source of
   truth.
   - Use the existing Python builder functions and tests for:
     - raw tool-call naming
     - terminal-state detection
     - command/file buffered output aggregation
     - generic item argument/result extraction

5. Keep the slice bounded to proven item types.
   - If this closes the remaining concrete user-facing Codex gap, Phase 12
     should not broaden further without a newly observed product need.

## Landing Outcome

1. Add Go-owned Codex raw tool-item persistence for the Python-proven item
   types.
2. Reuse the existing runtime/chat/run-event path instead of introducing
   Codex-only storage.
3. Add focused executor tests that prove persisted message and `tool_result`
   closeout for raw Codex items.
4. Reassess whether Phase 12 is effectively complete for the external-agent
   surface after this landing.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Codex|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'MCPRuntimeStatus|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat raw Codex tool items as a real parity gap because the Python Codex
  parser and tests already model them explicitly
- keep the scope Codex-only and raw-item-only instead of reopening broader
  executor or MCP architecture work
- use protocol-native item fields as the source of truth rather than inferring
  tool semantics from free-form text

## Open Questions

- whether raw Codex tool items need placeholder-message reuse semantics that
  match the Python stream parser exactly, or whether canonical persisted tool
  call/result preservation is the only user-visible requirement
  - recommendation: preserve canonical persisted tool calls/results first and
    only broaden into stricter stream-shape matching if a concrete UX gap
    remains

## Next Recommended Step

- land this bounded Codex raw tool-item slice, then reassess whether any Phase
  12 work remains beyond final inventory/closeout
