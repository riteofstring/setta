# Phase 18 Managed Provider Executor And Live Chat Runtime Plan

## Purpose

This doc records the Phase 18 follow-on that landed after the managed chat
send owner, hydrate/stop routes, and chat-section persistence transport.

When this follow-on opened, the remaining direct product gap was no longer
route ownership. It was the missing managed provider executor behind the
Go-owned live chat runtime path that drives the existing frontend
`LLMStreamingResponse` contract while a run is still in flight.

## Current Status

Already landed in Phase 18:

- Go-owned managed `POST /getLLMResponse` request validation, history shaping,
  and route dispatch foundation
- Go-owned managed `POST /getLLMChat` hydrate behavior
- Go-owned managed `POST /stopLLMChat` stop behavior
- Go-owned chat-section persistence transport

Remaining direct gaps for managed `setta_llm` chats:

- additional managed AI-follow result parity only if the active surface still
  proves it necessary
- additional preview kinds only if the active surface requires more than the
  landed app-spec patch preview path
- additional provider adapters only if the active managed surface requires
  them
- broader provider-native managed reasoning defaults only if the active
  product surface still needs them beyond explicit config and early rejection

Landed during Slice 1:

- Go `LLMStreamingResponse` websocket message types and constructor surface in
  `internal/realtime`
- Go-owned managed live chat runtime/state store in `internal/managedchat`
- managed runtime lifecycle hooks that seed and clear that live state from
  `internal/agentruns.Runtime`
- real IDE app wiring so `internal/managedchat.Service` now hydrates through
  the concrete live runtime instead of a stub-only boundary

Landed during Slice 2:

- bounded `internal/managedllm` executor implementation over OpenAI
  chat-completions streaming
- managed live chunk emission through the landed `internal/managedchat`
  runtime instead of a provider-owned state cache
- explicit unsupported behavior for providers, tools, attachments, and
  reasoning without provider-native config
- real IDE app wiring so managed `POST /getLLMResponse` and managed
  `startAgentRun` now execute through the Go-owned executor path
- `internal/agentruns` cancellation persistence and `Runtime.StopRun`
  ordering that preserve partial executor outputs on stop

Landed during Slice 3:

- bounded managed MCP tool execution over the already-resolved
  `MCPServerIDs` path
- per-call MCP `meta` propagation in `internal/mcpx.Client` so managed Setta
  tool invocations do not rely on shared-session context mutation
- bounded OpenAI tool-call streaming, sequential MCP tool execution, and
  provider follow-up looping in `internal/managedllm`
- transcript persistence and replay support for assistant `tool_calls` plus
  tool-result messages with `tool_call_id`
- real IDE app coverage proving managed chats can call the internal Setta MCP
  server through the same MCP client/runtime used elsewhere in Go

Landed during Slice 4:

- shared Go tool-preview metadata in `internal/tools.Metadata`
- MCP server/client propagation of `toolArgumentPreview` metadata for
  internal Setta tools
- bounded managed `tool_argument_preview_delta` emission from streamed OpenAI
  tool-call arguments in `internal/managedllm`
- preview metadata on the Go `stream_app_definition` tool definition
- real IDE app websocket coverage proving managed tool previews reach the
  existing frontend `LLMStreamingResponse` consumer path

Repo findings that shaped this follow-on:

- the frontend still expects websocket `LLMStreamingResponse` chunks to drive
  active chat progression after the initial send/hydrate request
- Python broadcasts managed chat chunks to frontend websocket clients and does
  not use `frontendAffinityToken` as a websocket routing key
- the current Go managed chat service already exposes an optional live overlay
  boundary through `managedchat.LiveChatStateProvider`
- the current Go managed runtime previously had no equivalent live managed chat
  state owner or chunk broadcaster

## Scope

This follow-on should cover:

- a first bounded managed provider executor behind `internal/agentruns.Executor`
- app wiring that connects the managed runtime, live overlay, and websocket
  transport through explicit service boundaries

## Non-Goals

- full Python `AgentRunner` parity in one landing
- a LiteLLM-equivalent generic provider framework
- recreating Python global singleton state
- changing the frontend websocket contract
- deployment/share-session AI route expansion
- heuristic fallbacks for unsupported providers or missing runtime metadata

## Design

### 1. Land the live runtime before the provider adapter

The current frontend cannot show an in-flight managed reply unless Go can emit
the existing websocket chunk contract. The live runtime is therefore a direct
dependency of the provider executor, not optional polish.

Slice 1 landed with:

- `LLMStreamingResponse` message types in Go
- a managed live chat runtime/store
- runtime lifecycle hooks that seed and clear that live state
- broadcast of managed chat chunks to IDE frontend websocket clients

That slice intentionally did not pretend provider execution exists yet.

### 2. Keep source-of-truth boundaries explicit

- `internal/agentruns` remains the durable run lifecycle owner
- `internal/managedchat` remains the managed product-semantic owner
- the new live runtime owns only in-flight managed chat state plus websocket
  chunk fanout
- the later provider executor consumes those boundaries rather than embedding
  stateful chat storage inside transport or app wiring

### 3. Match the existing frontend contract, not Python internals

The frontend already knows how to consume:

- `message_start`
- `delta`
- `tool_call_delta`
- `tool_argument_preview_delta`
- `tool_result`
- `message_stop`
- `message_finalized`

Go should emit the same websocket envelope and shape, but it does not need to
mirror Python class structure or LiteLLM internals to do so.

### 4. Start provider execution with one bounded provider

The first real provider slice should start with the most straightforward
supported path, likely OpenAI-compatible text streaming, with explicit
unsupported-provider errors for other managed providers until they are
implemented.

That keeps the first executor slice reviewable and avoids hiding partial
support behind silent heuristics.

## Implementation Plan

1. Implement the first bounded provider executor that emits the now-landed
   chunk contract through the managed live runtime.
2. Keep provider support explicit and fail unsupported providers with typed
   unavailable/unsupported errors instead of guessing compatibility.
3. Add targeted executor tests for request shaping, cancellation, streamed
   chunk emission, persisted outputs, and unsupported-provider behavior.
4. Expand provider/tool support only when the bounded executor proves it is
   required for the current direct managed-chat product surface.

## Slice Breakdown

### Slice 1

Managed live chat runtime and websocket stream foundation.

Status: landed on 2026-03-09.

### Slice 2

First bounded provider-backed managed executor over the landed live runtime.

Status: landed on 2026-03-09.

### Slice 3

Provider/tool-call follow-ons only if the bounded provider slice proves they
are required for the current direct managed chat product surface.

Status: landed on 2026-03-09.

### Slice 4

Bounded managed tool-preview parity for the active `stream_app_definition`
frontend preview path.

Status: landed on 2026-03-09.

## Decisions Made

- treat the managed live runtime as a direct dependency of provider execution
  instead of deferring it
- reuse the existing frontend websocket contract instead of inventing a second
  managed-chat update pathway
- keep managed chat live state out of transport handlers and out of
  `internal/agentruns` durable storage
- keep the first provider slice explicitly bounded to avoid hiding unsupported
  providers behind generic abstractions too early
- broadcast managed chat chunks to IDE frontend websocket clients through the
  shared websocket hub because these AI routes are IDE-only today
- keep provider selection and reasoning support explicit; do not guess from
  blank providers or model-name heuristics
- resolve MCP server IDs through `llmconfig.AllConfigs.ResolveMCPServerIDs`
  inside `internal/agentruns` so tool support decisions use the same
  source-of-truth config path as the rest of the runtime
- prefer per-call MCP request `meta` over session-scoped `set_agentic_context`
  because the Go client intentionally reuses long-lived sessions per server
- keep managed tool preview extraction metadata-driven through shared MCP tool
  descriptors instead of hardcoding preview behavior per tool name

## Open Questions

- whether the active managed surface now needs managed
  `AIFollowToolResultUpdate` parity before the separate transcription runtime
  slice
- whether the next preview kinds after app-spec patch need extra target-id
  extraction support beyond the landed bounded metadata path
- whether the active managed surface now needs broader provider-native
  `thinking=true` defaults beyond the landed explicit-config / early-reject
  boundary before the separate transcription runtime slice

## Verification

Slice 1 verification:

- `./scripts/go.sh test ./internal/realtime ./internal/managedchat ./internal/agentruns ./internal/app -run 'Test(NewLLMStreamingResponseMessage|LiveRuntime|RuntimeStartRunActivatesLiveTracker|ServiceGetChatUsesLiveRuntimeOverlay|App.*Managed.*)' -count=1`

Slice 2 verification:

- `./scripts/go.sh test ./internal/app ./internal/httpapi ./internal/managedllm ./internal/agentruns ./internal/managedchat -run 'Test(AppServesManagedChatSendThroughManagedExecutor|AppWiresManagedAgentRunFoundationInIDEMode|AppServesManagedAgentRunRoutesWithManagedExecutor|Executor|RuntimeStopRun|RuntimeStartRun|ServiceRunSubAgent|ServiceGetChatUsesConcreteLiveRuntimeOverlay|RegisterAIRoutes)' -count=1`

Slice 3 verification:

- `./scripts/go.sh test ./internal/app ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/httpapi ./internal/managedchat -run 'Test(AppServesManaged(ChatSendThroughManagedExecutor|ChatToolCallThroughInternalMCPClient)|Executor|Client|RuntimeStopRun|RuntimeStartRun|ServiceRunSubAgent|RegisterAIRoutes|ServiceGetChatUsesConcreteLiveRuntimeOverlay)' -count=1`

Slice 4 verification:

- `./scripts/go.sh test ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/app -run 'Test(ParseToolMetadataIncludesToolArgumentPreview|ServerListsToolsAndScopesToolCalls|ToolPreviewAccumulatorBuildsAppSpecPatchEvent|ScanPartialJSONStringsHandlesEscapedPreviewString|ExecutorExecuteStreamsManagedToolArgumentPreview|AppStreamsManagedToolArgumentPreviewOverFrontendWebsocket)' -count=1`
- `./scripts/go.sh test ./internal/app ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/httpapi ./internal/managedchat -run 'Test(AppServesManaged(ChatSendThroughManagedExecutor|ChatToolCallThroughInternalMCPClient|StreamsManagedToolArgumentPreviewOverFrontendWebsocket|ChatThinkingUnsupportedWithoutExplicitProviderConfig)|Executor|ToolPreviewAccumulator|ParseToolMetadataIncludesToolArgumentPreview|ServerListsToolsAndScopesToolCalls|ServiceRunSubAgent|RegisterAIRoutes|ServiceGetChatUsesConcreteLiveRuntimeOverlay)' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed that the missing managed provider
  executor is blocked on a missing Go-owned managed live chat runtime and
  websocket chunk transport.
- 2026-03-09: Python inspection confirmed that managed chat chunk delivery is
  a broadcast-to-frontend concern and does not use `frontendAffinityToken` as
  a websocket routing key.
- 2026-03-09: Slice 1 selected as the first implementation target because it
  unblocks the later provider executor without bundling a large provider port
  into one opaque change.
- 2026-03-09: landed Slice 1 with Go `LLMStreamingResponse` messages, a
  concrete managed live runtime, runtime lifecycle hooks, and hydrate-overlay
  coverage through the real app wiring.
- 2026-03-09: landed Slice 2 with a bounded OpenAI managed executor, real IDE
  app wiring, route-level end-to-end coverage, and cancellation ordering that
  preserves partial outputs on stop.
- 2026-03-09: landed Slice 3 with per-call MCP request metadata, bounded
  OpenAI tool-call execution over resolved `MCPServerIDs`, transcript support
  for `tool_calls` and tool results, and real app coverage against the
  internal Setta MCP server.
- 2026-03-09: landed managed reasoning preflight validation in
  `internal/agentruns` plus route/app error mapping so `thinking=true`
  requests now fail synchronously unless the selected config already declares
  explicit provider-native reasoning params.
- 2026-03-09: landed Slice 4 with shared tool-preview metadata, MCP
  descriptor propagation, bounded managed `tool_argument_preview_delta`
  emission for `stream_app_definition`, and real app websocket coverage.

## Next Recommended Step

Implement the next bounded follow-on only if the active managed surface still
needs it:

- implement managed `AIFollowToolResultUpdate` parity only if a concrete
  current caller still depends on that websocket surface
- resolve broader managed `thinking=true` defaults only if the active surface
  still needs more than the landed explicit-config / early-reject behavior,
  not model-name heuristics
- otherwise rerank the adjacent transcription-session runtime slice instead of
  broadening managed chat further by default
