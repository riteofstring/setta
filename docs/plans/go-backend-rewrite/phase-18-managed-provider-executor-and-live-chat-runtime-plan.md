# Phase 18 Managed Provider Executor And Live Chat Runtime Plan

## Purpose

This doc scopes the remaining Phase 18 follow-on after the landed managed chat
send owner, hydrate/stop routes, and chat-section persistence transport.

The remaining direct product gap is no longer route ownership. It is the
missing managed provider executor plus the missing Go-owned live chat runtime
path that can drive the existing frontend `LLMStreamingResponse` contract while
the run is still in flight.

## Current Status

Already landed in Phase 18:

- Go-owned managed `POST /getLLMResponse` request validation, history shaping,
  and route dispatch foundation
- Go-owned managed `POST /getLLMChat` hydrate behavior
- Go-owned managed `POST /stopLLMChat` stop behavior
- Go-owned chat-section persistence transport

Still missing for managed `setta_llm` chats:

- a real provider-backed executor behind `internal/agentruns.Executor`
- a Go-owned `LLMStreamingResponse` websocket envelope and broadcaster path
- a Go-owned live in-flight managed chat state store that can overlay durable
  run state during hydration

Repo findings from current inspection:

- the frontend still expects websocket `LLMStreamingResponse` chunks to drive
  active chat progression after the initial send/hydrate request
- Python broadcasts managed chat chunks to frontend websocket clients and does
  not use `frontendAffinityToken` as a websocket routing key
- the current Go managed chat service already exposes an optional live overlay
  boundary through `managedchat.LiveChatStateProvider`
- the current Go managed runtime has no equivalent live managed chat state
  owner or chunk broadcaster yet

## Scope

This follow-on should cover:

- a Go `LLMStreamingResponse` websocket message type in `internal/realtime`
- a managed live chat runtime that:
  - seeds live chat state from a started managed run
  - applies managed stream chunks to in-flight chat state
  - exposes `GetLiveChatState` for `internal/managedchat`
  - broadcasts managed chat chunks to IDE frontend websocket clients
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

The first bounded slice in this plan should land:

- `LLMStreamingResponse` message types in Go
- a managed live chat runtime/store
- runtime lifecycle hooks that seed and clear that live state
- broadcast of managed chat chunks to IDE frontend websocket clients

This slice should not pretend provider execution exists yet.

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

1. Add Go `LLMStreamingResponse` websocket message types and constructors in
   `internal/realtime`.
2. Add a managed live chat runtime/store in `internal/managedchat` that can:
   - activate from a started managed run
   - apply stream chunks to live chat state
   - broadcast websocket messages
   - return cloned live chat state for hydration overlay
3. Add a narrow lifecycle hook from `internal/agentruns.Runtime` so started
   managed runs seed and clear the live runtime automatically.
4. Wire the real IDE app so `managedchat.Service` hydrates from the new live
   runtime and the managed runtime can publish through the shared websocket
   hub.
5. Add targeted tests for:
   - websocket envelope shaping
   - live state application for start/delta/stop/finalized events
   - runtime activation/deactivation hooks
   - managed hydrate overlay using the concrete live runtime
6. After that lands, implement the first bounded provider executor that emits
   those chunks.

## Slice Breakdown

### Slice 1

Managed live chat runtime and websocket stream foundation.

### Slice 2

First bounded provider-backed managed executor over the landed live runtime.

### Slice 3

Provider/tool-call follow-ons only if the bounded provider slice proves they
are required for the current direct managed chat product surface.

## Decisions Made

- treat the managed live runtime as a direct dependency of provider execution
  instead of deferring it
- reuse the existing frontend websocket contract instead of inventing a second
  managed-chat update pathway
- keep managed chat live state out of transport handlers and out of
  `internal/agentruns` durable storage
- keep the first provider slice explicitly bounded to avoid hiding unsupported
  providers behind generic abstractions too early

## Verification

Planned verification for Slice 1:

- `./scripts/go.sh test ./internal/realtime ./internal/managedchat ./internal/agentruns ./internal/app -run 'Test(NewLLMStreamingResponseMessage|LiveRuntime|RuntimeStartRunActivatesLiveTracker|ServiceGetChatUsesLiveRuntimeOverlay|App.*Managed.*)' -count=1`

Planned verification for Slice 2:

- focused executor tests for provider request shaping, cancellation, streamed
  chunk emission, persisted outputs, and unsupported-provider errors

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

## Next Recommended Step

Land Slice 1:

- Go `LLMStreamingResponse` types
- managed live chat runtime/store
- managed runtime lifecycle wiring
- targeted tests
