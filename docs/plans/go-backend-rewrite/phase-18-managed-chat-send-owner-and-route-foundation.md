# Phase 18 Managed Chat Send Owner And Route Foundation

## Purpose

This doc scopes the first executable slice of the remaining Phase 18 managed
chat send work after the landed hydrate/stop and chat-section persistence
transport.

The immediate goal is to move managed `POST /getLLMResponse` request shaping,
history shaping, and route ownership into Go without pretending that the repo
already has the missing managed provider executor or websocket chunk transport.

## Current Status

Completed before this slice:

- Go-owned chat-section persistence:
  - `POST /setChatSectionSettings`
  - `POST /setChatSectionState`
  - `POST /setChatSectionChatId`
- Go-owned managed chat hydrate/stop:
  - `POST /getLLMChat`
  - `POST /stopLLMChat`
- Go-owned managed run storage/runtime foundations in `internal/agentruns`

Direct frontend gap this slice targeted inside Phase 18:

- the managed `setta_llm` branch of `POST /getLLMResponse`

New implementation finding from repo inspection:

- the repo still has no Go-managed provider SDK adapter
- the repo still has no Go `LLMStreamingResponse` websocket envelope or
  broadcaster path
- the landed Go external-agent runtime also currently relies on durable/live
  state instead of Go-owned chat chunk websocket transport

Implication:

- the first bounded managed-send slice should own managed request semantics and
  runtime start boundaries in Go
- provider execution and later websocket chunk parity remain explicit follow-on
  dependencies instead of being silently bundled into the same change

Landed in this slice:

- `internal/managedchat.Service.StartChat(...)` now owns managed
  `POST /getLLMResponse` request validation, history lookup, prompt shaping,
  and runtime-start input construction
- `internal/httpapi/ai_routes.go` now dispatches `/getLLMResponse` by engine
  type with thin fallback to the existing external-agent path
- the real IDE app now wires the managed send owner and returns explicit `503`
  `agent_runner_unavailable` responses until a provider executor is wired
- focused owner, route, and app tests now cover the bounded runtime-start
  boundary

## Scope

This slice should cover:

- a Go-owned managed send owner in `internal/managedchat`
- managed `/getLLMResponse` route branching in `internal/httpapi/ai_routes.go`
- managed send validation and history shaping for:
  - `sectionId` versus `allowUnscoped`
  - branch-edit validation
  - `continueFromChatId`
  - `frontendAffinityToken`
  - engine/config compatibility checks for same-chat sends
- managed prompt shaping for:
  - profile/system prompt
  - app-generation mode prompt
  - execution-policy prompt
  - required completion gate
- start requests over an injected managed runtime boundary
- explicit 503 behavior when the managed runtime/executor is unavailable
- focused owner, route, and app tests

## Non-Goals

- a real Go provider adapter for OpenAI/Anthropic/other managed LLM providers
- managed MCP tool-call execution parity
- Go-owned `LLMStreamingResponse` websocket chunk transport
- transcription-session runtime
- broad external-agent runtime changes
- hiding missing runtime dependencies behind heuristic fallbacks

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`
- `backend/setta/routers/ai.py`
- `backend/setta/llm/agent_runner.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- `frontend/src/components/Section/Layouts/ChatArea.tsx`
- `internal/agentruns/service.go`
- `internal/agentruns/runtime.go`
- `internal/httpapi/ai_routes.go`
- `internal/app/app.go`

## Design

### 1. Keep managed send semantics in `internal/managedchat`

`internal/agentruns` should remain the generic managed run source of truth for:

- run storage
- engine/LLM resolution
- persisted lifecycle updates
- active run start/stop

`internal/managedchat` should own:

- send request normalization
- history lookup/branch shaping
- prompt shaping
- managed route response/error shaping

### 2. Treat runtime start as an injected boundary

This slice should not fake provider execution.

The managed chat owner should depend on a narrow starter interface that can:

- start a managed run asynchronously
- expose `Disabled()` or equivalent runtime availability

That keeps the route and owner honest today while allowing the later provider
executor slice to plug into the same boundary.

### 3. Defer websocket chunk transport explicitly

The frontend still consumes `LLMStreamingResponse` websocket chunks, but the Go
repo does not currently expose a managed or external Go-owned implementation of
that envelope.

Decision for this slice:

- do not silently invent partial chunk transport
- keep the first managed send slice aligned with the current Go durable/live
  overlay model
- record websocket chunk parity as a later dependency once the managed runtime
  can actually execute provider/tool turns

## Implementation Plan

1. Add managed send request/result types and a `StartChat` entrypoint to
   `internal/managedchat`.
2. Reuse the already-landed managed chat hydration helpers to load prior
   messages and continuation sources from the run store.
3. Inject a runtime starter boundary and map missing runtime/executor to the
   same 503 surface the Python route exposes today.
4. Update `internal/httpapi/ai_routes.go` so `/getLLMResponse` dispatches by
   engine type instead of assuming external-agent only.
5. Wire the real IDE app to the managed send owner even if the runtime remains
   disabled until a later executor slice is added.
6. Cover:
   - branch-edit missing-message errors
   - `continueFromChatId` seeding
   - invalid same-chat engine/project mismatches
   - execution-policy prompt shaping
   - whitespace `frontendAffinityToken` rejection
   - unavailable managed runtime -> 503

## Decisions Made

- recommend a staged managed-send landing instead of bundling provider
  execution and websocket chunk transport into one opaque change
- prefer explicit unavailable errors over fake provider fallbacks
- keep route branching thin and keep managed product semantics out of HTTP
  handlers
- let `internal/managedchat` return `agentruns.ErrManagedLLMEngineRequired`
  for non-managed engines so the route can fall through to the external-agent
  owner without duplicating engine-resolution logic in transport

## Verification

- `./scripts/go.sh test ./internal/managedchat -run 'TestServiceStartChat(BuildsManagedInputsAndCombinedPrompt|ContinueFromChatSeedsExternalSourceHistory|BranchEditMissingMessageReturnsNotFound|ReturnsExecutorUnavailableWhenStarterDisabled)' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterAIRoutesStarts(ExternalAgentChat|ManagedChat)|TestRegisterAIRoutesReturnsUnavailableForManagedChatWhenStarterDisabled' -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestAppServesManaged(ChatHydrateAndStopRoutes|ChatSendAsUnavailableWithoutExecutor)' -count=1`

## Progress Notes

- 2026-03-09: repo inspection confirmed that managed send still lacks both a
  provider executor and Go-owned chat chunk websocket transport.
- 2026-03-09: split the remaining Phase 18 managed-send work into this focused
  owner/route foundation slice before touching provider execution.
- 2026-03-09: landed Go-owned managed `/getLLMResponse` send semantics,
  managed/external route dispatch, and explicit `503` unavailable behavior
  through the real IDE app wiring.

## Next Recommended Step

- implement the real managed provider executor behind the landed
  `internal/managedchat` start boundary
- feed live in-flight managed chat state into `internal/managedchat` through
  its optional overlay boundary instead of inventing a second source of truth
- keep websocket chunk parity as an explicit follow-on if the executor slice
  does not naturally require it in the same landing
