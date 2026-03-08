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

Completed in this slice:

- `internal/externalagents/codex_raw_items.go` plus
  `internal/externalagents/codex_executor.go`
  - Go-owned raw non-`response_item` Codex item handling for:
    - `commandExecution`
    - `fileChange`
    - `mcpToolCall`
    - generic item types already modeled in the Python parser/tests
  - per-run assistant-message tracking so raw tool calls attach to the active
    assistant message when one is open
  - synthetic assistant-message adoption when raw tool items arrive before the
    assistant text delta that should own them
  - buffered command/file output-delta aggregation when terminal completion
    payloads omit aggregated output or diff fields
  - persisted tool-result messages and `tool_result` run events over the
    existing runtime/run-store path
- focused tests in:
  - `internal/externalagents/codex_executor_test.go`
    - raw command/file/MCP/generic item persistence
    - buffered output/diff closeout
    - synthetic assistant-message reuse for raw tool-call attachment

Still missing after this slice:

- any additional Codex item classes beyond the Python-tracked raw and
  `response_item` surfaces that prove user-facing in real runtime output
- any remaining external-agent websocket/event closeout only if the current
  frontend still depends on behavior not covered by the now-landed canonical
  persisted/live chat path

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

1. Landed Go-owned Codex raw tool-item persistence for the Python-proven item
   types.
2. Reused the existing runtime/chat/run-event path instead of introducing
   Codex-only storage.
3. Added focused executor tests that prove persisted message and `tool_result`
   closeout for raw Codex items plus buffered output/diff handling.
4. Narrowed the remaining Phase 12 work to final inventory/closeout instead of
   another known executor or parser slice.

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
- preserve raw tool-call ownership on the active assistant message when
  possible, and adopt synthetic placeholder messages when assistant text arrives
  later in the same turn

## Open Questions

- whether any additional Codex item families outside the Python-tracked raw and
  `response_item` surfaces still create a user-visible gap after this landing
  - recommendation: do not broaden Phase 12 further unless concrete runtime
    output shows a real product gap

## Next Recommended Step

- land the bounded external-agent prompt/app-generation follow-on tracked in
  `phase-12-external-agent-prompt-and-app-generation-parity.md`, then
  reassess whether the external-agent Phase 12 surface is effectively complete
