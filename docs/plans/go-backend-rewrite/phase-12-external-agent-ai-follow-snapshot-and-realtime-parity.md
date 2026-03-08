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

This was the highest-leverage next step because the attempted final Phase 12
inventory found a real user-facing omission in the Go external-agent runtime:
the frontend still called `/getAIFollowSnapshot`, and Python's
`ExternalAgentRunner` still owned the external-agent follow snapshot plus live
follow updates. That bounded gap is now landed in Go.

## Current Status

Completed before this slice:

- Go-owned external-agent send/hydrate/stop/approval/question transport
- Go-owned active runtime ownership and Codex/OpenCode/Claude executors
- Codex/OpenCode/Claude rich item plus MCP-status parity
- Codex raw non-`response_item` tool-item parity
- Go-owned external prompt/app-generation shaping
- Go-owned external attachment payload shaping plus token-backed downloads

Landed in this slice:

- `internal/externalagents/follow.go`
  - added an explicit follow-state owner keyed by active external-agent runs
  - derives follow ids from canonical MCP tool metadata
    (`tools.Metadata.IDPathsByType`) plus the runtime's existing
    `ToolCallArguments` source of truth
  - resolves temporary ids back to canonical ids before broadcasting or serving
    snapshot state
  - emits `AIFollowToolArgumentsUpdate` only when the effective per-chat state
    changes
  - clears follow state through an empty `idsByType` object so the existing
    frontend reducer can remove the chat entry without additional shims
- `internal/externalagents/runtime.go`
  - syncs follow state whenever live external-agent chat state changes
  - clears follow state on approval/question responses and on run stop/teardown
- `internal/httpapi/ai_routes.go`
  - added thin IDE-only Go transport for `/getAIFollowSnapshot`
- `internal/realtime/messages.go`
  - added the Go-owned `AIFollowToolArgumentsUpdate` websocket payload type
- `internal/app/app.go`
  - wires the follow service above the existing MCP client, temporary-id store,
    websocket hub, and external-agent runtime
- `internal/mcpx/client.go` and `internal/mcpx/id_paths.go`
  - exported the bounded descriptor/path helpers needed by the follow service
    instead of duplicating MCP metadata logic
- frontend state can now hydrate and clear external-agent AI-follow state from
  the Go runtime through the same route and websocket message shape it already
  consumes:
  - `frontend/src/state/actions/aiFollow.ts`
  - `/getAIFollowSnapshot`
  - `AIFollowToolArgumentsUpdate`

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
   - The landed slice derives follow state from the runtime's existing live
     tool-argument buffers instead of inventing a new executor-specific parser.
   - If materially earlier highlights are still needed after final closeout
     verification, add one bounded partial-buffer follow-on rather than a
     heuristic parser.

5. Clear state through the same argument-update channel Python uses.
   - Broadcast empty `idsByType` to remove active follow state once tool
     results or approval/question responses resolve.

## Verification

- passed: `./scripts/go.sh test ./internal/externalagents ./internal/httpapi -count=1`
- passed: `./scripts/go.sh test ./internal/app -run '^$'`

## Decisions Made

- treat external-agent AI-follow as a real remaining Phase 12 gap because the
  frontend still hydrates from `/getAIFollowSnapshot` and the current Go app
  does not own that route or the external-agent follow state behind it
- keep this slice external-agent-only instead of reopening managed-chat follow
  work
- keep external-agent follow parity bounded to the Python-owned
  `AIFollowToolArgumentsUpdate` behavior instead of broadening into a new
  external-agent tool-result highlight contract
- broadcast empty `idsByType` as `{}` instead of `null` so the existing
  frontend follow reducer can clear chat entries without a compatibility shim

## Open Questions

- whether one executor still needs bounded partial-buffer follow extraction for
  materially earlier highlights than the current live tool-argument buffers
  provide
  - recommendation: do not broaden the runtime yet; rerun the final Phase 12
    closeout inventory first and only open another slice if a concrete UX gap
    is observed

## Next Recommended Step

- the follow-up closeout inventory found one more concrete dependency:
  `GET /getAgentRuns`, now tracked in
  `phase-12-agent-run-list-read-transport-closeout.md`
