# Phase 18 Managed AI-Follow Result Parity Plan

## Purpose

This doc records the next bounded Phase 18 follow-on after the landed managed
tool-preview parity slice.

The remaining managed-chat work is no longer about route ownership, baseline
provider execution, or streamed tool-argument previews. The next concrete
product gap is managed `AIFollowToolResultUpdate` delivery for Setta MCP tools
that return newly created or mutated IDs the frontend still highlights.

## Why This Slice Exists

Repo inspection on 2026-03-09 found:

- the frontend still consumes `AIFollowToolResultUpdate` in
  `frontend/src/state/actions/aiFollow.ts`
- websocket routing for that message type remains active in
  `frontend/src/state/actions/websocketReceive.ts`
- Python still emits managed tool-result follow updates through
  `backend/setta/llm/chat_toolkit/managed/action_executor.py`
- Python still has focused coverage for this behavior in
  `tests/llm/test_ai_follow_tool_result_updates.py`
- Go already has the reusable prerequisites:
  - tool result target metadata in `internal/tools.Metadata.ResultIDPathsByType`
  - temporary-to-canonical ID resolution through `internal/mcpx`
  - external-agent follow-update patterns in `internal/externalagents/follow.go`
  - live managed chat runtime and frontend websocket broadcasting

The missing dependency is not transport. It is a managed result-follow owner
that reads tool result metadata and emits the already-existing frontend
message contract.

## Current Status

Already landed in Phase 18:

- managed send/hydrate/stop transport
- managed live chat runtime and websocket streaming foundation
- bounded OpenAI executor
- bounded managed MCP tool execution
- synchronous managed `thinking=true` preflight rejection unless explicit
  provider-native reasoning config is already present
- bounded managed `tool_argument_preview_delta` parity for the active
  `stream_app_definition` preview path

Landed during this slice:

- Go-owned managed `AIFollowToolResultUpdate` emission for Setta MCP tools
  with explicit `ResultIDPathsByType` metadata
- temporary-ID resolution on tool results before broadcasting frontend
  highlight targets
- targeted real-app and executor coverage for the active websocket consumer

Remaining managed follow-ons after this slice:

- broader preview kinds only if a concrete current managed caller still needs
  more than the landed app-spec patch preview and tool-result follow surfaces
- broader provider-native managed reasoning defaults only if the active
  surface still needs more than explicit config plus early rejection
- otherwise reranking to the adjacent transcription-session runtime slice

## Scope

This follow-on should cover:

- a realtime message type for managed `AIFollowToolResultUpdate`
- a managed result-follow helper that:
  - reads MCP tool descriptor metadata
  - extracts IDs from structured tool results using declared result paths
  - resolves temporary IDs to canonical IDs through the existing store
  - emits the existing `{projectConfigId, chatId, idsByType}` websocket shape
- executor wiring immediately after successful managed MCP tool execution
- bounded tests for metadata-driven result extraction and real websocket
  delivery

## Non-Goals

- broadening into new preview kinds or unrelated managed chat polish
- introducing a second managed follow state store when result updates are
  short-lived highlight events
- adding heuristic parsing when structured result metadata is absent
- bundling transcription-session runtime work into this slice

## Design

### 1. Keep result-follow semantics metadata-driven

Do not special-case individual tool names inside the executor.

Use the existing shared MCP tool descriptor metadata:

- `ResultIDPathsByType` is the source of truth for which IDs a tool result
  should highlight
- if a tool lacks that metadata, no result-follow message should be emitted
- if the result is an error, no result-follow message should be emitted

This keeps product semantics explicit and bounded.

### 2. Reuse the existing frontend websocket contract

The frontend already has a direct consumer for
`AIFollowToolResultUpdateContent`.

This slice should emit that existing message rather than inventing another
transient highlight channel or trying to smuggle result-follow data through
stream chunks.

### 3. Resolve IDs through the existing temporary-ID source of truth

Managed MCP tools already translate canonical IDs to temporary IDs at the MCP
boundary. Result-follow updates must resolve those IDs back to canonical IDs
before broadcasting so the frontend targets real project-state entities.

Use the current `TemporaryIDStore` resolution boundary rather than adding any
string-pattern heuristics.

## Implementation Plan

1. Add the Go realtime message type and constructor for
   `AIFollowToolResultUpdate`.
2. Add a bounded managed result-follow helper in `internal/managedllm` that
   extracts IDs from successful tool results using `ResultIDPathsByType` and
   resolves temporary IDs through the existing store.
3. Wire that helper into managed tool execution so successful Setta MCP tool
   results emit the follow-update websocket message immediately after the
   regular tool-result stream event.
4. Add targeted unit and app-level tests covering:
   - structured result extraction
   - temporary-ID resolution
   - no-op behavior for missing metadata and tool errors
   - real frontend websocket delivery
5. Update the relevant Phase 18 docs with completed scope, decisions, and the
   next recommended step.

## Open Questions

- whether any active managed caller needs follow-result updates for tools whose
  result payloads are not currently structured enough to support
  `ResultIDPathsByType`
- whether the next bounded follow-on after this slice should be the dormant
  managed callsite inventory cleanup or the adjacent transcription-session
  runtime

## Decisions Made

- implement managed result-follow parity only because a concrete frontend
  consumer still exists
- keep result-follow extraction metadata-driven through
  `ResultIDPathsByType`
- emit short-lived result highlights directly over the existing frontend
  websocket message contract instead of adding persistent managed follow state

## Verification

- `./scripts/go.sh test ./internal/realtime ./internal/managedllm ./internal/app -run 'Test(NewAIFollowToolResultUpdateMessage|BuildToolResultFollowContent|ToolResultFollowEmitter|ExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns|AppStreamsManagedAIFollowToolResultUpdateOverFrontendWebsocket)' -count=1`
- `./scripts/go.sh test ./internal/realtime ./internal/managedllm ./internal/app -run 'Test(NewAIFollowToolResultUpdateMessage|ExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns|ExecutorExecuteStreamsManagedToolArgumentPreview|AppServesManagedChatToolCallThroughInternalMCPClient|AppStreamsManagedToolArgumentPreviewOverFrontendWebsocket|AppStreamsManagedAIFollowToolResultUpdateOverFrontendWebsocket)' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed that managed
  `AIFollowToolResultUpdate` still has a concrete current caller in the
  frontend and remains Python-owned despite the landed managed tool-preview
  slice.
- 2026-03-09: Go inspection confirmed the necessary metadata and temporary-ID
  translation surfaces already exist, making this a bounded managed executor
  follow-on rather than a new architecture phase.
- 2026-03-09: landed Go realtime `AIFollowToolResultUpdate` message support
  plus a bounded managed result-follow emitter in `internal/managedllm` that
  extracts target IDs from tool-result metadata and resolves temporary IDs
  through the existing store.
- 2026-03-09: landed executor and real IDE app websocket coverage proving
  managed Setta tool calls now broadcast canonical
  `AIFollowToolResultUpdate` messages over the existing frontend contract.

## Next Recommended Step

Rerank Phase 18 toward the adjacent transcription-session runtime slice unless
a concrete current caller still proves that broader managed preview kinds or
broader provider-native reasoning defaults are required first.
