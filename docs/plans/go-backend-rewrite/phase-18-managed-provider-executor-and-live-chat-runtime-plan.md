# Phase 18 Managed Provider Executor And Live Chat Runtime Plan

## Purpose

This doc scopes the remaining Phase 18 follow-on after the landed managed chat
send owner, hydrate/stop routes, and chat-section persistence transport.

The remaining direct product gap is no longer route ownership. It is the
missing managed provider executor behind the now-landed Go-owned live chat
runtime path that can drive the existing frontend `LLMStreamingResponse`
contract while the run is still in flight.

## Current Status

Already landed in Phase 18:

- Go-owned managed `POST /getLLMResponse` request validation, history shaping,
  and route dispatch foundation
- Go-owned managed `POST /getLLMChat` hydrate behavior
- Go-owned managed `POST /stopLLMChat` stop behavior
- Go-owned chat-section persistence transport

Still missing for managed `setta_llm` chats:

- a real provider-backed executor behind `internal/agentruns.Executor`

Landed during Slice 1:

- Go `LLMStreamingResponse` websocket message types and constructor surface in
  `internal/realtime`
- Go-owned managed live chat runtime/state store in `internal/managedchat`
- managed runtime lifecycle hooks that seed and clear that live state from
  `internal/agentruns.Runtime`
- real IDE app wiring so `internal/managedchat.Service` now hydrates through
  the concrete live runtime instead of a stub-only boundary

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
- broadcast managed chat chunks to IDE frontend websocket clients through the
  shared websocket hub because these AI routes are IDE-only today

## Open Questions

- whether the first provider executor should start as OpenAI-compatible only or
  whether Anthropic support is required in the same slice by active managed
  product paths
- whether tool-call streaming needs to land in the same executor slice or can
  remain a follow-on after plain assistant streaming is working end-to-end

## Verification

Slice 1 verification:

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
- 2026-03-09: landed Slice 1 with Go `LLMStreamingResponse` messages, a
  concrete managed live runtime, runtime lifecycle hooks, and hydrate-overlay
  coverage through the real app wiring.

## Next Recommended Step

Implement Slice 2:

- plug the first bounded provider executor into `internal/agentruns.Executor`
- emit managed chat chunks through the landed live runtime instead of creating
  a parallel provider-owned state cache
- keep unsupported providers explicit until they are actually implemented
