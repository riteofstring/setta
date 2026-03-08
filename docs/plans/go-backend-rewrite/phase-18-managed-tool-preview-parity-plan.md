# Phase 18 Managed Tool Preview Parity Plan

## Purpose

This doc records the next bounded Phase 18 follow-on after the landed managed
reasoning preflight slice.

The remaining managed-chat work is no longer route ownership or baseline
provider execution. The next concrete product gap is streamed
`tool_argument_preview_delta` support for managed Setta tools that already have
live frontend consumers, especially `stream_app_definition`.

## Why This Slice Exists

Repo inspection on 2026-03-09 found:

- the frontend still consumes `tool_argument_preview_delta` for app-spec patch
  previews in `frontend/src/state/actions/ai.ts`
- the current UI has direct automated coverage for that preview path in:
  - `frontend/src/state/actions/aiAppSpecPatchPreview.test.ts`
  - `frontend/tests/e2e/overview/app-config/app-config-generate-streaming.spec.ts`
- Python still emits managed tool preview deltas through
  `backend/setta/llm/chat_toolkit/managed/tool_argument_preview.py`
- Go already has the websocket event type plus live managed chat runtime
  support for preview chunks, but the bounded managed executor does not yet
  produce them

The missing dependency is not transport. It is shared tool metadata plus
managed executor preview extraction.

## Current Status

Already landed in Phase 18:

- managed send/hydrate/stop transport
- managed live chat runtime and websocket streaming foundation
- bounded OpenAI executor
- bounded managed MCP tool execution
- synchronous managed `thinking=true` preflight rejection unless explicit
  provider-native reasoning config is already present

Landed during this slice:

- shared Go tool-preview metadata in `internal/tools.Metadata`
- MCP server/client propagation of `toolArgumentPreview` metadata through
  internal Setta tool descriptors
- bounded managed executor preview extraction from streamed tool-call
  arguments in `internal/managedllm`
- preview metadata on the Go `stream_app_definition` MCP tool definition
- bounded real-app websocket coverage proving managed
  `stream_app_definition` previews now reach the existing frontend
  `LLMStreamingResponse` contract

Remaining managed follow-ons after this slice:

- additional preview kinds with target-id extraction only if a concrete
  current caller needs more than the landed app-spec patch preview path

## Scope

This follow-on should cover:

- a shared Go metadata surface for tool-argument preview semantics
- MCP server/client propagation of that metadata for internal Setta tools
- managed executor emission of `tool_argument_preview_delta` using that
  metadata and the already-landed live runtime
- bounded coverage for the active `stream_app_definition` preview path

## Non-Goals

- bundling the separate transcription-session runtime slice into this work
- broad managed AI-follow parity in the same landing unless preview work
  proves it is directly required
- provider-specific heuristics for preview extraction
- reintroducing Python-shaped managed runtime singletons

## Design

### 1. Keep preview semantics metadata-driven

Do not hardcode `stream_app_definition` behavior inside the managed executor.

Instead:

- extend the shared Go tool metadata surface with explicit preview fields
- expose that metadata through MCP server `meta`
- read it back through the internal MCP client tool descriptors
- let the managed executor consume that descriptor metadata when building
  streamed preview events

This preserves the clean-break boundary while keeping the executor generic over
bounded product semantics.

### 2. Reuse the landed live runtime and websocket contract

The frontend already understands `tool_argument_preview_delta`, and the Go live
runtime already stores/broadcasts that event shape.

This slice should emit that existing contract rather than inventing a second
preview channel.

### 3. Start with the active preview caller

The first bounded product target is `stream_app_definition` app-spec patch
preview because it has:

- current frontend consumers
- existing Python metadata semantics
- a direct user-facing value path

Additional preview kinds should only follow when the active surface requires
them.

## Implementation Plan

1. Extend `internal/tools.Metadata` with explicit tool-preview metadata and
   round-trip it through MCP server/client `meta`.
2. Attach preview metadata to the Go `stream_app_definition` tool
   registration.
3. Add bounded managed executor support for accumulating streamed tool-call
   arguments, extracting preview value deltas from the configured preview path,
   and emitting `realtime.ToolArgumentPreviewDeltaEvent`.
4. Add targeted tests for metadata round-trip, executor preview emission, and
   real app managed chat streaming for `stream_app_definition`.
5. Update the relevant Phase 18 docs with landed scope, decisions, and the
   next recommended step.

## Open Questions

- whether any managed caller still needs `AIFollowToolResultUpdate` soon enough
  that it should immediately follow this preview slice instead of reranking to
  transcription runtime work
- whether the next preview kinds after app-spec patch need extra structured
  target-id extraction beyond the first bounded slice

## Decisions Made

- keep tool preview semantics in shared MCP tool metadata instead of
  hardcoding managed-executor behavior per tool name
- start with the active `stream_app_definition` preview path and do not
  broaden to non-app preview kinds until a concrete caller proves they are
  needed
- keep preview delivery on the existing `LLMStreamingResponse` websocket
  contract through the landed managed live runtime

## Verification

- `./scripts/go.sh test ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/app -run 'Test(ParseToolMetadataIncludesToolArgumentPreview|ServerListsToolsAndScopesToolCalls|ToolPreviewAccumulatorBuildsAppSpecPatchEvent|ScanPartialJSONStringsHandlesEscapedPreviewString|ExecutorExecuteStreamsManagedToolArgumentPreview|AppStreamsManagedToolArgumentPreviewOverFrontendWebsocket)' -count=1`
- `./scripts/go.sh test ./internal/app ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/httpapi ./internal/managedchat -run 'Test(AppServesManaged(ChatSendThroughManagedExecutor|ChatToolCallThroughInternalMCPClient|StreamsManagedToolArgumentPreviewOverFrontendWebsocket|ChatThinkingUnsupportedWithoutExplicitProviderConfig)|Executor|ToolPreviewAccumulator|ParseToolMetadataIncludesToolArgumentPreview|ServerListsToolsAndScopesToolCalls|ServiceRunSubAgent|RegisterAIRoutes|ServiceGetChatUsesConcreteLiveRuntimeOverlay)' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed that managed tool preview parity still
  had a concrete current caller through `stream_app_definition` app preview
  streaming, while managed AI-follow result updates were a separate narrower
  follow-on.
- 2026-03-09: landed the shared tool-preview metadata surface in
  `internal/tools` plus MCP server/client propagation for internal Setta tool
  descriptors.
- 2026-03-09: landed bounded managed executor preview extraction from streamed
  tool-call argument buffers using metadata-driven preview paths instead of
  hardcoded tool-name behavior.
- 2026-03-09: landed real IDE app websocket coverage proving managed
  `stream_app_definition` preview deltas now reach the existing frontend
  preview consumer path.
- 2026-03-09: the separate bounded managed AI-follow result parity slice has
  now landed, so this preview doc is no longer blocking another managed-chat
  follow-on.

## Next Recommended Step

Rerank to the adjacent transcription-session runtime slice unless a concrete
current caller still proves that broader managed preview kinds are required
beyond the landed app-spec patch preview path.
