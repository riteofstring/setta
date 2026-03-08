# Phase 18 Managed Chat Send Hydrate Stop And Section Persistence Plan

## Purpose

This doc scopes the next executable backend-runtime follow-on after the Phase
18 inventory/rerank work.

The goal is to move the remaining direct frontend managed-chat surface to Go
without reopening a broad Python-shaped `AgentRunner` rebuild and without
bundling the separate transcription-session runtime.

## Current Status

Completed before this plan:

- Phase 12 bounded external-agent runtime and direct AI transport
- Phase 14 managed-agent and run-chain runtime foundations
- Phase 15 plugin runtime/transport closeout
- Phase 16 direct LLM config and managed API-key transport
- Phase 17 app-gen skills and custom-skill transport
- Phase 18 inventory/rerank in
  `phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`

Landed during this phase:

- Go-owned chat-section persistence over `internal/projectstate` and
  `internal/httpapi/project_routes.go` for:
  - `POST /setChatSectionSettings`
  - `POST /setChatSectionState`
  - `POST /setChatSectionChatId`
  - explicit `type: "Chat"` validation
  - explicit permission-mode and dictation-mode validation
  - `frontendOpId` optimistic-update completion reuse through
    `getLatestProjectState`
- Go-owned managed chat hydration and stop over
  `internal/managedchat` plus `internal/httpapi/ai_routes.go` for:
  - `POST /getLLMChat`
  - `POST /stopLLMChat`
  - latest-run chat hydration over persisted managed runs
  - `llmConfig` lookup from current engine/LLM bindings when still valid
  - `contextUsage` resolution from persisted run outputs
  - latest-running-run cancellation with `stoppedMessageId` shaping
  - real IDE app wiring without requiring the later managed send executor
- Go-owned managed chat send owner and `/getLLMResponse` dispatch foundation
  over `internal/managedchat` plus `internal/httpapi/ai_routes.go` for:
  - managed `setta_llm` request validation, history shaping, and prompt
    shaping
  - thin managed/external dispatch by engine type
  - explicit `503` transport when the managed runtime/executor is unavailable
  - focused owner, route, and app coverage for the unavailable/runtime-start
    boundary

Remaining managed dependency that still triggers follow-on work in this phase:

- provider-backed managed executor behind the now-landed Go-owned
  `POST /getLLMResponse` managed owner and the now-landed managed live chat
  runtime

Current callers are concentrated in:

- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Section/Layouts/ChatArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`

Current Python owners:

- `backend/setta/routers/ai.py`
- `backend/setta/routers/project_manager.py`

Current Go state relevant to this phase:

- `internal/httpapi/ai_routes.go`
  - now owns thin managed/external dispatch for `/getLLMResponse`
  - now owns `/getLLMChat` and `/stopLLMChat` for managed chats
- `internal/agentruns`
  - owns managed run storage, engine resolution, persisted lifecycle updates,
  and a managed active-run runtime foundation
  - now seeds and clears the managed live runtime through explicit lifecycle
    hooks
  - the real IDE app still leaves managed execution unavailable until an
    executor is wired
- `internal/managedchat`
  - now owns managed chat send, hydrate, and stop semantics above the landed
    managed-run stores/runtime
  - owns managed request validation, history lookup, prompt shaping,
    latest-run selection, `llmConfig` / `contextUsage` shaping, and
    latest-running-run stop responses
  - now includes a concrete live runtime/store that overlays durable chat
    state during hydration and can broadcast the existing frontend
    `LLMStreamingResponse` contract
- `internal/projectstate` plus `internal/httpapi/project_routes.go`
  - now own `POST /setChatSectionSettings`, `POST /setChatSectionState`, and
    `POST /setChatSectionChatId` over the existing effective-payload mutation
    pathway
  - already owned the mutation/runtime pattern needed for section persistence
    and `frontendOpId`-tracked optimistic updates, which the landed slice now
    reuses directly
- `internal/llmconfig`
  - already owns the managed LLM config and API-key source of truth

## Scope

This phase should cover:

- a Go-owned managed chat owner above the landed managed-run foundations
- a real managed executor boundary for direct user-facing managed chat runs
- thin Go transport for:
  - the managed `setta_llm` branch of `POST /getLLMResponse`
  - `POST /getLLMChat`
  - `POST /stopLLMChat`
- managed chat branch-edit and `continueFromChatId` behavior
- managed chat hydration from persisted runs plus active live overlay while a
  run is still in flight
- `llmConfig` lookup from persisted engine metadata
- `contextUsage` resolution from persisted run outputs
- focused route, owner, and app-handler tests mirroring the current Python
  reference coverage and active frontend caller behavior

## Non-Goals

- external-agent send, hydrate, stop, approval, question, or AI-follow routes
- transcription-session runtime and transport
- `POST /getChatSectionChatId`
- a LiteLLM-equivalent provider abstraction
- recreating Python global singleton runner state
- broad watcher parity or new chat-specific websocket protocols

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`
- `backend/setta/routers/ai.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/llm/agent_runner.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/project_state/test_chat_section_chat_id.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Section/Layouts/ChatArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `internal/agentruns/service.go`
- `internal/agentruns/runtime.go`
- `internal/httpapi/ai_routes.go`
- `internal/httpapi/project_routes.go`
- `internal/app/app.go`

## Current Python Behavior

### 1. Managed `POST /getLLMResponse` is the real chat send owner

For the managed `setta_llm` branch, Python currently:

- validates `sectionId` versus `allowUnscoped`
- validates branch-edit and `continueFromChatId` combinations
- loads prior messages from the latest managed chat run or a continuation
  source chat, including externally seeded chats
- builds the final managed system prompt from:
  - profile/system prompt
  - app-generation mode prompt
  - execution-policy prompt
  - required error-check completion gate
- creates managed run inputs with:
  - `runType = llm_chat`
  - `chatId`
  - `projectConfigId`
  - `engineConfigId`
  - `permissionMode`
  - `searchEnabled`
  - message history
  - optional `sectionId`
  - optional `frontendAffinityToken`
  - optional branch metadata
- starts the managed runner asynchronously and returns `chatId`

### 2. `POST /getLLMChat` hydrates from persisted runs and live active state

Python currently:

- selects the latest managed chat run by `chatId` and optional
  `projectConfigId`
- reconstructs durable chat state from the persisted run
- overlays active live state from the managed runner while a run is still
  running
- resolves `llmConfig` from the run's persisted engine metadata when that
  metadata still points at a valid managed LLM config
- resolves `contextUsage` from persisted run outputs and metadata instead of
  consulting live provider config
- returns a typed `chat_not_found` 404 when the chat has no run

### 3. `POST /stopLLMChat` is a latest-running-run cancellation route

Python currently:

- finds the latest running managed chat run for a `chatId`
- returns `alreadyStopped = true` when no running run remains
- stops the active run through the managed runner
- returns:
  - `alreadyStopped`
  - `stoppedRunId`
  - `stoppedMessageId`

### 4. Chat-section persistence is a project-state mutation concern

Python currently:

- handles `POST /setChatSectionSettings` through the project manager with a
  share layout guard
- handles `POST /setChatSectionState` through the project manager with a share
  layout guard and `frontendOpId`-aware optimistic update completion
- handles `POST /setChatSectionChatId` through the project manager as a direct
  project-state mutation

## Planning Findings

### 1. This slice needs a real managed executor, not just route wiring

The landed Go managed-run runtime is not enough by itself:

- `internal/agentruns.Service` and `Runtime` already own persisted managed run
  lifecycle and cancellation
- the real IDE app still exposes managed execution as unavailable because no
  executor is wired

That means the first executable Phase 18 step is not a route shim. It is a
bounded managed executor boundary that plugs into the already-landed
managed-run runtime.

### 2. Managed chat semantics should live above `internal/agentruns`, not inside HTTP handlers

`internal/agentruns` is the right source of truth for:

- managed run storage
- engine and LLM config resolution
- persisted lifecycle updates
- active run cancellation

It is not the right home for all chat-specific behavior:

- branch-edit history shaping
- `continueFromChatId`
- chat hydration result mapping
- latest-run selection by chat metadata
- stop response shaping

Recommendation:

- add a dedicated `internal/managedchat` package above `internal/agentruns`
  instead of burying those semantics inside `httpapi` or broadening
  `internal/agentruns` into a chat-specific singleton

### 3. Chat-section persistence belonged in the same phase and is now landed

Managed chat send/hydrate/stop and section `chatId`/state persistence are part
of the same active user flow:

- submit/edit branches update section `chatId`
- hydration persists section message/input/waiting/tool-argument/branch state
- new-chat actions clear the section `chatId`
- settings changes update managed/runtime-facing chat defaults on the same
  section

Landed decision:

- move `/setChatSectionSettings`, `/setChatSectionState`, and
  `/setChatSectionChatId` in the same phase so managed chat no longer crosses
  a Python-owned project-state seam for section persistence
- keep that ownership in `internal/projectstate` instead of introducing a
  parallel chat-specific persistence package

### 4. The rewrite still should not recreate LiteLLM

There is no Go provider client or compatibility layer in the repo today.
Recreating Python's broad managed-provider behavior 1:1 would broaden scope
back into a LiteLLM-equivalent rebuild, which this rewrite has already ruled
out.

Recommended option if provider breadth becomes the first architecture tradeoff:

- implement a narrow managed executor with provider-specific adapters keyed by
  `llmconfig.Config.Provider`
- use stdlib `net/http` transport plus typed request/response shaping
- start with the smallest concrete provider set needed by the active managed
  chat caller path
- return an explicit typed unsupported-provider error for configs whose
  provider adapter has not been landed yet

## Decisions Made

- land managed hydration/stop before managed send because those routes close a
  live frontend gap without waiting on provider execution
- keep managed chat semantics in `internal/managedchat` above
  `internal/agentruns` instead of broadening route handlers or the run store
- do not gate `POST /stopLLMChat` on executor availability; reuse the existing
  managed runtime cancellation path so persisted running runs can still be
  cancelled deterministically
- keep live managed-chat overlay state as an optional dependency for the later
  executor/send slice instead of inventing placeholder runtime state now

## Open Questions

- which concrete provider adapter should be the first managed executor
  implementation for the remaining managed `POST /getLLMResponse` slice
- whether branch-edit and `continueFromChatId` support should land together
  with the first provider-backed send adapter or be split if the executor work
  proves larger than expected

## Progress Notes

- 2026-03-09: landed the first executable Phase 18 slice in Go for
  `/setChatSectionSettings`, `/setChatSectionState`, and
  `/setChatSectionChatId`.
- 2026-03-09: landed the second executable Phase 18 slice in Go for
  `/getLLMChat` and `/stopLLMChat` over the new `internal/managedchat`
  boundary.
- 2026-03-09: landed the third executable Phase 18 slice in Go for the
  managed `setta_llm` branch of `POST /getLLMResponse` over a bounded
  runtime-start boundary that returns explicit `503` when execution is still
  unavailable.
- 2026-03-09: landed the fourth executable Phase 18 slice in Go for managed
  live chat runtime and websocket chunk foundations:
  - Go `LLMStreamingResponse` message types in `internal/realtime`
  - concrete live chat overlay/store in `internal/managedchat`
  - managed runtime lifecycle hooks in `internal/agentruns.Runtime`
- 2026-03-09: landed the fifth executable Phase 18 slice in Go for the first
  bounded managed provider executor:
  - bounded `internal/managedllm` OpenAI chat-completions executor
  - real IDE app wiring for managed `/getLLMResponse` and managed
    `/startAgentRun`
  - cancellation persistence in `internal/agentruns` so stopped runs keep
    partial outputs
- 2026-03-09: the remaining managed-chat dependency inside this phase is now
  the explicit MCP/tool-call and robust reasoning follow-on behind the landed
  send/hydrate/stop/live/provider foundations.

## Verification

- `./scripts/go.sh test ./internal/managedchat -run 'TestServiceStartChat(BuildsManagedInputsAndCombinedPrompt|ContinueFromChatSeedsExternalSourceHistory|BranchEditMissingMessageReturnsNotFound|ReturnsExecutorUnavailableWhenStarterDisabled)' -count=1`
- `./scripts/go.sh test ./internal/realtime ./internal/managedchat ./internal/agentruns ./internal/app -run 'Test(NewLLMStreamingResponseMessage|LiveRuntimeApplyChunkBroadcastsAndStoresState|ServiceGetChatUsesConcreteLiveRuntimeOverlay|RuntimeStartRunActivatesAndClearsLiveTracker|ServiceGetChatUsesLiveOverlayWhenRunning|AppServesManaged(ChatHydrateAndStopRoutes|ChatSendAsUnavailableWithoutExecutor))' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterAIRoutesStarts(ExternalAgentChat|ManagedChat)|TestRegisterAIRoutesReturnsUnavailableForManagedChatWhenStarterDisabled' -count=1`
- `./scripts/go.sh test ./internal/app ./internal/httpapi ./internal/managedllm ./internal/agentruns ./internal/managedchat -run 'Test(AppServesManagedChatSendThroughManagedExecutor|AppWiresManagedAgentRunFoundationInIDEMode|AppServesManagedAgentRunRoutesWithManagedExecutor|Executor|RuntimeStopRun|RuntimeStartRun|ServiceRunSubAgent|ServiceGetChatUsesConcreteLiveRuntimeOverlay|RegisterAIRoutes)' -count=1`

## Next Recommended Step

- add MCP/tool-call execution over the landed managed provider/runtime
  boundary so managed chats can use the same resolved server IDs as the
  persisted Go runtime
- resolve managed `thinking=true` with an explicit provider-native or product
  decision instead of model-name heuristics
- keep transport layers thin; the remaining work is executor/runtime semantics,
  not more route movement

## Recommended Design

1. Add a dedicated `internal/managedchat` package.
   - `Service` should own managed chat send, hydrate, and stop behavior.
   - `SectionService` can either live there or in a small adjacent package if
     that keeps project-state mutation logic explicit.
   - Keep transport thin in `internal/httpapi`.

2. Reuse `internal/agentruns` as the persisted run and active cancellation
   source of truth.
   - managed chat send should create running runs through the existing runtime
     path, not through a new parallel store
   - hydration should select latest runs through persisted metadata and overlay
     active live state from the same runtime
   - stop should cancel through the same active-run registry used by the
     landed managed run runtime

3. Add a bounded managed executor interface for provider-backed chat runs.
   - the executor should stream structured chat/tool events back into the
     managed chat owner instead of returning only a final blob
   - provider adapters should dispatch by `llmconfig.Config.Provider`
   - unsupported providers should fail explicitly with a typed error

4. Keep prompt shaping and request validation in the managed chat owner.
   - reuse the current robust source-of-truth inputs:
     - persisted chat history
     - explicit branch metadata
     - explicit `permissionMode` and `searchEnabled`
     - explicit app-generation-mode inputs
   - do not infer behavior heuristically from message text or route shape

5. Keep landed chat-section persistence in Go over the project-state runtime.
   - `internal/projectstate` now owns the bounded chat-section mutation owner
   - `internal/httpapi/project_routes.go` now owns the thin IDE transport for
     `/setChatSectionSettings`, `/setChatSectionState`, and
     `/setChatSectionChatId`
   - `frontendOpId` optimistic-update completion is already wired through that
     landed slice

6. Keep transcription out of this slice.
   - after this phase lands, rerank the dictation/runtime follow-on separately
     instead of broadening the managed chat owner into audio-session work

## Verification Targets For This Phase

- managed chat owner tests
  - managed send success for new chat
  - branch-edit success
  - `continueFromChatId` success, including external-source seeding
  - required-field and incompatible-argument validation
  - latest-run hydration with persisted-state selection
  - live-overlay hydration while a run is active
  - stop latest running run and already-stopped behavior
- project-state mutation tests
  - set managed chat section settings
  - set managed chat section state with `frontendOpId`
  - set managed chat section `chatId`
- route tests
  - managed `/getLLMResponse` branch success and explicit unavailable/runtime
    error mapping
  - `getLLMChat` typed not-found mapping
  - `stopLLMChat` response mapping
- app wiring tests
  - IDE app wires the managed chat owner plus executor dependency explicitly
  - routes are available only when the managed executor/runtime is available

## Decisions Made

- Phase 18 reopens only the direct frontend managed-chat surface, not a broad
  managed-runtime parity campaign
- the managed chat owner should sit above the landed managed-run foundations
  instead of replacing them
- chat-section persistence belongs in the same phase as managed chat runtime
  ownership and can stay in `internal/projectstate`
- transcription remains a separate bounded follow-on

## Open Questions

- which provider adapters should be in the first managed executor landing
  - recommendation: start with the minimum provider set required by the active
    managed chat caller path and fail unsupported providers explicitly
- whether `internal/managedchat` should also own chat-section persistence or
  whether a tiny adjacent project-state helper keeps that boundary clearer
  - recommendation: keep section persistence close to the project-state
    mutation helpers unless that creates route-level coupling

## Verification

- `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeChatSectionMutations|TestRuntimeLayoutPresentationMutationsUpdateProjectAndEffectivePayload' -count=1`
- `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterProjectRoutesChatSectionMutations|TestRegisterProjectRoutesLayoutPresentationMutationsPersistInLatestState' -count=1`
- `./scripts/go.sh test ./internal/app -run '^TestAppServesChatSectionMutationRoutes$' -count=1`

## Next Recommended Step

- use the landed send/hydrate/stop and chat-section persistence foundations as
  the base for a separate provider-executor follow-on
- keep transcription-session runtime as the next adjacent AI/runtime phase
  unless the provider-executor work uncovers a concrete shared dependency
