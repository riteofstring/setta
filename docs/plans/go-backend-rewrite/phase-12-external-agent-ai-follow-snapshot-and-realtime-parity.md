# Phase 12 External-Agent AI-Follow Snapshot And Realtime Parity

## Purpose

This doc narrows the remaining concrete Phase 12 external-agent gap into one
bounded follow-on over the already-landed Go runtime, route, executor, rich
item, prompt-composition, and attachment ownership.

The goal of this slice is to close external-agent AI-follow behavior that is
still Python-owned today:

- external-agent runs must keep live per-chat AI-follow ids in memory
- external-agent runs must broadcast `AIFollowToolArgumentsUpdate` websocket
  messages as Setta MCP tool arguments stream/finalize
- external-agent runs must clear that follow state once the tool result lands
- `/getAIFollowSnapshot` must return the active external-agent follow state so
  the frontend can hydrate after reconnect/project load

This is the highest-leverage next step because the attempted final Phase 12
inventory found a real user-facing omission in the Go external-agent runtime:
the frontend still calls `/getAIFollowSnapshot`, and Python's
`ExternalAgentRunner` still owns the external-agent follow snapshot plus live
follow updates.

## Current Status

Completed before this slice:

- Go-owned external-agent send/hydrate/stop/approval/question transport
- Go-owned active runtime ownership and Codex/OpenCode/Claude executors
- Codex/OpenCode/Claude rich item plus MCP-status parity
- Codex raw non-`response_item` tool-item parity
- Go-owned external prompt/app-generation shaping
- Go-owned external attachment payload shaping plus token-backed downloads

Still Python-owned after those slices:

- `backend/setta/routers/ai.py`
  - `route_get_ai_follow_snapshot(...)` still returns external-agent follow
    snapshot entries
- `backend/setta/agentic/external_agent_runner.py`
  - `_ai_follow_state` still stores live external-agent follow ids by
    `(projectConfigId, chatId)`
  - `_maybe_emit_streaming_follow_update(...)` and `_maybe_emit_follow_update(...)`
    still derive follow ids from streamed/finalized Setta MCP tool arguments
  - `_broadcast_ai_follow_update(...)` still emits
    `AIFollowToolArgumentsUpdate` websocket messages and clears state on tool
    result / approval-response / question-response
- frontend state still depends on that behavior:
  - `frontend/src/state/actions/aiFollow.ts`
  - `/getAIFollowSnapshot` hydrates stored follow ids
  - `AIFollowToolArgumentsUpdate` clears or replaces the current ids for a chat

Important scope note from the Python reference:

- external-agent AI-follow currently uses only
  `AIFollowToolArgumentsUpdate`
- Python clears the follow state by broadcasting an empty arguments update
- Python does not emit `AIFollowToolResultUpdate` from the external-agent path
- this slice should preserve that bounded behavior instead of broadening into
  managed-chat follow parity

## Scope

This slice should deliver:

- a Go-owned external-agent follow-state owner under `internal/externalagents`
  - store normalized follow ids by `(projectConfigId, chatId)`
  - expose snapshot reads filtered by `projectConfigId`
  - clear state when a tool result resolves or the run finishes
- thin Go AI transport for `/getAIFollowSnapshot`
  - IDE-mode gated like the other Phase 12 AI routes
  - external-agent snapshot only; do not broaden into managed `setta_llm`
  - response shape should match the existing frontend expectation:
    `[]AIFollowToolArgumentsUpdateContent`
- Go websocket broadcast support for `AIFollowToolArgumentsUpdate`
  - use the existing frontend websocket hub
  - broadcast only to frontend connections
  - preserve share-session scoping behavior where applicable
- executor/runtime follow extraction over the existing source-of-truth pathways
  - use internal MCP tool metadata (`IDPathsByType`) instead of ad hoc parsing
  - reuse the runtime's existing tool-call argument buffers where available
  - canonicalize temporary ids back to canonical ids before broadcast/snapshot
- focused tests covering:
  - snapshot readback for active external-agent follow ids
  - websocket `AIFollowToolArgumentsUpdate` delivery and clear behavior
  - finalized tool-call follow extraction from Setta MCP metadata
  - any bounded streaming follow extraction that is landed in this slice

## Non-Goals

- managed `EngineType.setta_llm` AI-follow parity
- a broad AI route migration beyond the external-agent follow route
- external-agent `AIFollowToolResultUpdate` support that Python does not own
- speculative follow heuristics based on keywords or tool-name guesses
- broader websocket message redesign outside the bounded new follow message

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-12-managed-chat-runtime-and-ai-route-foundation.md`
- `docs/plans/go-backend-rewrite/phase-12-external-agent-attachment-payload-parity.md`
- `docs/reference/external-agents.md`
- `backend/setta/routers/ai.py`
- `backend/setta/agentic/external_agent_runner.py`
- `backend/setta/llm/chat_toolkit/managed/ai_follow.py`
- `backend/setta/mcp/tool_metadata.py`
- `frontend/src/state/actions/aiFollow.ts`
- `tests/agentic/test_external_agent_runner.py`
- `tests/llm/test_ai_follow_section_ids.py`
- `tests/llm/test_agent_runner_ai_follow_snapshot.py`
- `internal/realtime/messages.go`
- `internal/realtime/websocket_hub.go`
- `internal/httpapi/ai_routes.go`
- `internal/mcpx/client.go`
- `internal/mcpx/id_paths.go`
- `internal/externalagents/runtime.go`
- `internal/externalagents/codex_executor.go`
- `internal/externalagents/opencode_executor.go`
- `internal/externalagents/claude_executor.go`

## Recommended Design

1. Add a dedicated external-agent follow service instead of widening the run
   registry.
   - Keep run cancellation/approval ownership in `Runtime`.
   - Keep AI-follow snapshot/broadcast state in a sibling service with explicit
     MCP metadata and websocket dependencies.

2. Reuse MCP tool metadata as the source of truth for follow ids.
   - Use `tools.Metadata.IDPathsByType` and the existing `internal/mcpx`
     path-extraction helpers.
   - Do not add keyword matching or tool-specific hardcoded section parsing.

3. Keep the route thin and external-agent-only.
   - `/getAIFollowSnapshot` should read the external-agent follow service and
     return the existing frontend payload shape.
   - Managed-chat follow remains intentionally outside Phase 12.

4. Stay conservative about streaming parity.
   - Land deterministic follow updates from finalized tool calls first.
   - If bounded streaming extraction is needed for actual product parity, add a
     small partial-buffer parser over the existing executor tool-call buffers.
   - Do not invent heuristic partial parsing.

5. Clear state through the same argument-update channel Python uses.
   - Broadcast empty `idsByType` to remove active follow state once tool
     results or approval/question responses resolve.

## Verification

- `./scripts/go.sh test ./internal/externalagents -run 'Follow|Codex|OpenCode|Claude|Runtime'`
- `./scripts/go.sh test ./internal/httpapi -run 'AIFollow|AI|ExternalAgent'`
- `./scripts/go.sh test ./internal/app -run 'AIFollow|Websocket|^$'`

## Decisions Made

- treat external-agent AI-follow as a real remaining Phase 12 gap because the
  frontend still hydrates from `/getAIFollowSnapshot` and the current Go app
  does not own that route or the external-agent follow state behind it
- keep this slice external-agent-only instead of reopening managed-chat follow
  work
- keep external-agent follow parity bounded to the Python-owned
  `AIFollowToolArgumentsUpdate` behavior instead of broadening into a new
  external-agent tool-result highlight contract

## Open Questions

- whether finalized-tool-call follow extraction is sufficient for practical UX,
  or whether one executor needs bounded partial-buffer follow extraction for
  materially earlier highlights
  - recommendation: start with finalized-call plus clear-path ownership, then
    add bounded partial-buffer extraction only if a concrete frontend gap
    remains during verification

## Next Recommended Step

- implement this slice end-to-end, then rerun the Phase 12 closeout inventory
  from the updated docs and repo state
