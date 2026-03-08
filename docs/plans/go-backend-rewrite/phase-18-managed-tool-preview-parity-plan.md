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

Still missing for concrete managed preview parity:

- Go tool metadata for managed tool-argument preview semantics
- MCP server/client propagation of that preview metadata
- managed executor extraction of preview deltas from streamed tool-call
  arguments
- bounded app coverage proving `stream_app_definition` previews reach the
  existing frontend websocket contract

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

## Next Recommended Step

Implement the preview metadata surface first, then add managed executor preview
emission for `stream_app_definition` end to end.
