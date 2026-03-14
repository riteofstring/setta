# Phase 18 Remaining AI Chat And Transcription Route Inventory And Rerank

## Purpose

This doc records the bounded inventory follow-on after the landed Phase 17
app-gen skills/custom-skill transport slice.

Phase 16 and Phase 17 removed the last obvious direct settings and app-gen
transport gaps, but direct frontend AI/chat work is still not fully Go-owned.
The next step cannot be another blind route move. It needs a rerank of the
remaining Python-owned direct frontend AI surface based on real callers,
runtime dependencies, and the already-landed Go foundations.

## Current Status

Completed before this inventory:

- Phase 12 bounded external-agent runtime and user-facing AI transport
- Phase 14 managed-agent and run-chain runtime foundations
- Phase 15 plugin runtime/transport closeout
- Phase 16 direct LLM config and managed API-key transport
- Phase 17 app-gen skills and custom-skill transport

Current Go state relevant to this inventory:

- `internal/httpapi/ai_routes.go`
  - now owns thin managed/external dispatch for `/getLLMResponse`
  - now owns managed `/getLLMChat` and `/stopLLMChat`
  - owns `/getExternalAgentChat`, `/getAIFollowSnapshot`,
    `/stopExternalAgentRun`, `/respondExternalAgentApproval`, and
    `/respondExternalAgentQuestion`
- `internal/agentruns`
  - owns managed run storage and a managed active-run runtime foundation
  - now owns the bounded managed execution request path used by the real IDE
    app wiring
- `internal/managedchat`
  - now owns managed chat send/hydrate/stop semantics above the landed
    managed-run foundations
  - now owns request validation, history lookup, prompt shaping,
    `llmConfig` / `contextUsage` shaping, and latest-running-run stop
    behavior above the landed managed-run foundations
  - now hydrates and streams through the concrete managed live runtime while
    execution is active
- `internal/managedllm`
  - now owns the first bounded managed provider executor
  - now supports bounded OpenAI chat-completions text streaming plus managed
    MCP tool-call execution over resolved `MCPServerIDs`
  - now supports bounded managed `tool_argument_preview_delta` emission for
    `stream_app_definition` over shared MCP tool metadata
  - now supports managed `AIFollowToolResultUpdate` emission for successful
    Setta MCP tool results with declared result-id metadata
  - now rejects unsupported managed `thinking=true` requests at start time
    unless the selected config already declares explicit provider-native
    reasoning params
  - project chat and section chat now gate managed `thinking` off for the
    current Go runtime instead of defaulting managed callers into typed
    `thinking_unsupported`
  - still leaves only broader preview-kind coverage and any concrete
    provider/runtime addition that can expose reasoning output as explicit
    managed-chat follow-ons
- `internal/httpapi/project_routes.go`
  - already owns the broad project-state mutation transport pattern with
    `frontendOpId` handling
- `internal/transcriptionprofiles`
  - already owns transcription-profile read/write plus live capability
    attachment
- `internal/transcriptionsessions`
  - now owns scoped file-mode transcription session lifecycle, WAV upload, and
    TTL cleanup in IDE mode

Question this inventory answers:

- after the landed Phase 17 slice, which remaining Python-owned direct
  frontend AI/app-generation routes actually justify the next Go phase?

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/archive/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/archive/phase-17-app-gen-skills-and-custom-skill-transport.md`
- `backend/setta/routers/ai.py`
- `backend/setta/routers/project_manager.py`
- `backend/setta/types/routes.py`
- `tests/routers/test_ai_agent_run_chats.py`
- `tests/project_state/test_chat_section_chat_id.py`
- `frontend/src/state/actions/ai.ts`
- `frontend/src/components/Section/Layouts/ChatArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
- `internal/httpapi/ai_routes.go`
- `internal/httpapi/project_routes.go`
- `internal/app/app.go`

## Inventory Method

1. Enumerate the remaining AI/chat routes and route branches still defined in
   the Python routers.
2. Compare that route set with the current Go registrations and route-branch
   ownership.
3. Search current frontend code for live callers of the remaining generated
   endpoint functions.
4. Group the remaining surface by actual runtime owner instead of route file.
5. Rerank the remaining surface by user-facing dependency, not by how easy an
   individual route would be to port in isolation.

## Findings

### 1. Managed chat route ownership is no longer the active direct frontend gap

The landed follow-on work closed the route-ownership gap for the managed chat
cluster:

- `POST /getLLMResponse` for the managed `setta_llm` branch
- `POST /getLLMChat`
- `POST /stopLLMChat`

Current callers:

- `frontend/src/state/actions/ai.ts`
  - submits managed chat sends through `route_get_llm_response(...)`
  - hydrates managed chat through `route_get_llm_chat(...)`
  - stops managed chat through `route_stop_llm_chat(...)`
- `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - hydrates managed section chat on mount/selection through `getLLMChat(...)`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  - still exposes `EngineType.setta_llm` as an active project-chat path

Current Go status:

- `internal/httpapi/ai_routes.go` owns thin managed/external dispatch for
  `/getLLMResponse`
- Go owns `/getLLMChat` and `/stopLLMChat`
- the real IDE app now wires managed send/start through the bounded
  `internal/managedllm` executor

Implication:

- the remaining managed-chat work is executor/runtime semantics, not route
  movement
- the highest-leverage remaining managed follow-on is now any still-needed
  broader preview-kind coverage plus any concrete provider/runtime addition
  that can expose reasoning output behind the now-landed
  send/hydrate/stop/provider/tool/follow foundations

### 2. Chat-section persistence is the adjacent direct dependency and should move with managed chat

These routes were Python-owned when this inventory was written and had live
direct frontend callers:

- `POST /setChatSectionSettings`
- `POST /setChatSectionState`
- `POST /setChatSectionChatId`

Current callers:

- `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - persists managed/runtime-facing chat settings through
    `route_set_chat_section_settings(...)`
  - persists section message/input/waiting/tool-argument/branch state through
    `route_set_chat_section_state(...)`
  - persists section `chatId` through `route_set_chat_section_chat_id(...)`
- `frontend/src/state/actions/ai.ts`
  - updates managed section `chatId` after submit/edit flows
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - persists section chat settings through
    `route_set_chat_section_settings(...)`
  - clears section `chatId` when starting a new managed chat after settings
    changes

Why this belongs with managed chat instead of a separate transport slice:

- the frontend uses these routes immediately before and after managed chat
  sends, hydrations, and branch changes
- splitting chat runtime ownership from section persistence would keep a
  Python-owned source-of-truth seam in the middle of the same user flow
- Go already has the project-state mutation transport pattern needed for these
  routes

### 3. Transcription session runtime is now landed as a separate runtime cluster

These direct frontend routes are now Go-owned for the bounded file-mode slice:

- `POST /startTranscriptionSession`
- `POST /appendTranscriptionAudio`
- `POST /stopTranscriptionSession`
- `POST /cancelTranscriptionSession`

Current callers:

- `frontend/src/state/actions/ai.ts`
  - drives the full dictation/provider-transcription flow through these routes

What landed:

- file-mode session ownership in `internal/transcriptionsessions`
- bounded OpenAI realtime session ownership in `internal/transcriptionsessions`
- explicit `internal/transcriptionprofiles.Resolve(...)` lookup boundary
- thin AI transport in `internal/httpapi`
- real IDE app wiring through the auth session scope and LLM runtime
- capability-driven `transportMode=auto` resolution
- typed `unsupported_model` mapping for explicit realtime requests that no
  longer point at a realtime-capable config

Why this remains a separate cluster from managed chat:

- the runtime owner is audio-session and provider-transcription lifecycle, not
  managed chat send/hydrate/stop
- the current Python contract is centered on chunking, transport-mode
  resolution, realtime/file fallback, payload size enforcement, and
  provider-specific validation
- there is no direct dependency from managed chat hydration/stop onto
  transcription-session ownership

Rerank:

- the current direct caller-backed transcription route cluster is now Go-owned
- the next adjacent AI/runtime follow-on is no longer transcription ownership;
  it is any still-needed managed-chat semantics beyond the landed bounded
  send/hydrate/stop/tool/preview/follow surface, or a broader rerank outside
  the direct AI route cluster

### 4. `POST /getChatSectionChatId` was dormant at inventory time and is now Go-owned as a closeout slice

At inventory time, this route remained Python-owned:

- `POST /getChatSectionChatId`

Inventory-time status:

- this inventory did not find a live direct frontend caller in the current UI
  code
- current references are in backend tests and toolkit/listener-oriented tests
- current UI flows read chat section `chatId` from project state instead of
  calling this route directly

What landed later:

- Go now owns `POST /getChatSectionChatId` through a small
  `internal/chatsections` service plus thin `internal/httpapi/project_routes.go`
  transport
- the Go owner validates stored section `chatId` values against the durable
  agent-run index and clears stale project-state values when no chat run
  exists
- this stayed a separate closeout slice instead of broadening the earlier
  caller-backed managed-chat execution work

## Reranked Outcome

1. The next executable AI follow-on should be the managed chat cluster:
   managed `/getLLMResponse`, `/getLLMChat`, `/stopLLMChat`, plus
   `/setChatSectionSettings`, `/setChatSectionState`, and
   `/setChatSectionChatId`.
2. The next adjacent AI/runtime slice after that is now realtime
   transcription-session ownership if incremental provider dictation remains
   an active product dependency.
3. The dormant `getChatSectionChatId` route no longer remains in Python; it
   was later closed opportunistically after the caller-backed Phase 18 work
   landed.

## Decisions Made

- treat the remaining managed chat surface as Phase 18 runtime work over the
  landed managed-run foundations, not as something still fully de-scoped
- keep transcription-session runtime explicitly separate from the managed-chat
  slice
- keep dormant `getChatSectionChatId` out of the initial caller-backed rerank,
  then only close it later if continued execution still justifies a bounded
  opportunistic slice

## Progress Notes

- 2026-03-09: reran the remaining direct frontend AI/app-generation route
  inventory after the landed Phase 17 app-gen skills slice.
- 2026-03-09: confirmed the highest-leverage remaining gap is managed chat
  send/hydrate/stop plus chat-section persistence, while transcription remains
  an adjacent but separable runtime cluster.
- 2026-03-09: opened the executable follow-on in
  `phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`.
- 2026-03-09: landed the first executable Phase 18 slice in Go for
  `/setChatSectionSettings`, `/setChatSectionState`, and
  `/setChatSectionChatId`.
- 2026-03-09: landed the second executable Phase 18 slice in Go for
  `/getLLMChat` and `/stopLLMChat`, leaving managed
  `POST /getLLMResponse` send/executor work as the remaining direct frontend
  gap inside this phase.
- 2026-03-09: landed the third executable Phase 18 slice in Go for the
  managed `setta_llm` branch of `POST /getLLMResponse` over a bounded
  runtime-start boundary with explicit unavailable handling.
- 2026-03-09: landed the later managed follow-ons for live in-flight overlay,
  the bounded OpenAI executor, and bounded MCP tool execution over resolved
  `MCPServerIDs`.
- 2026-03-09: landed the bounded managed tool-preview follow-on for
  `stream_app_definition` over shared MCP tool metadata and the existing
  managed websocket contract.
- 2026-03-09: the direct frontend managed-chat route cluster and its bounded
  current runtime surface are now Go-owned.
- 2026-03-09: landed managed reasoning preflight so unsupported
  `thinking=true` sends now fail synchronously unless explicit provider-native
  reasoning params are already present in the selected config.
- 2026-03-09: the remaining managed follow-on is now any still-needed managed
  AI-follow result parity or broader preview-kind coverage, plus optional
  broader provider-native reasoning defaults, while transcription remains
  separate.
- 2026-03-09: landed the bounded Go-owned transcription-session file slice for
  start / append / stop / cancel transport, scoped in-memory session runtime,
  and real IDE app wiring.
- 2026-03-09: kept realtime explicit as a remaining Go runtime gap instead of
  misclassifying it as an unsupported model when the selected config may be
  valid.
- 2026-03-10: landed the opportunistic closeout slice for dormant
  `POST /getChatSectionChatId`, leaving no adjacent Python-owned direct AI/chat
  route in this reranked cluster.

## Verification

- inventory follow-on now has landed evidence in:
  - `./scripts/go.sh test ./internal/projectstate -run 'TestRuntimeChatSectionMutations|TestRuntimeLayoutPresentationMutationsUpdateProjectAndEffectivePayload' -count=1`
  - `./scripts/go.sh test ./internal/managedchat ./internal/httpapi ./internal/app -run 'Test(ServiceGetChat|ServiceStopChat|RegisterAIRoutes|AppServesManagedChatHydrateAndStopRoutes)' -count=1`
  - `./scripts/go.sh test ./internal/managedchat -run 'TestServiceStartChat(BuildsManagedInputsAndCombinedPrompt|ContinueFromChatSeedsExternalSourceHistory|BranchEditMissingMessageReturnsNotFound|ReturnsExecutorUnavailableWhenStarterDisabled)' -count=1`
  - `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterAIRoutesStarts(ExternalAgentChat|ManagedChat)|TestRegisterAIRoutesReturnsUnavailableForManagedChatWhenStarterDisabled' -count=1`
  - `./scripts/go.sh test ./internal/app -run 'TestAppServesManaged(ChatHydrateAndStopRoutes|ChatSendAsUnavailableWithoutExecutor)' -count=1`
  - `./scripts/go.sh test ./internal/app ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/httpapi ./internal/managedchat -run 'Test(AppServesManaged(ChatSendThroughManagedExecutor|ChatToolCallThroughInternalMCPClient)|Executor|Client|RuntimeStopRun|RuntimeStartRun|ServiceRunSubAgent|RegisterAIRoutes|ServiceGetChatUsesConcreteLiveRuntimeOverlay)' -count=1`
  - `./scripts/go.sh test ./internal/agentruns ./internal/managedllm ./internal/httpapi ./internal/app -run 'Test(ServiceRunSubAgentRejectsValidatedRequestBeforeSave|Executor(RejectsThinkingWithoutExplicitProviderConfig|ValidateAllowsThinkingWithExplicitReasoningConfig)|RegisterAIRoutesReturnsBadRequestForManagedThinkingUnsupported|AppServesManagedChatThinkingUnsupportedWithoutExplicitProviderConfig)' -count=1`
  - `./scripts/go.sh test ./internal/managedllm ./internal/mcpx ./internal/agentruns ./internal/app -run 'Test(ParseToolMetadataIncludesToolArgumentPreview|ServerListsToolsAndScopesToolCalls|ToolPreviewAccumulatorBuildsAppSpecPatchEvent|ScanPartialJSONStringsHandlesEscapedPreviewString|ExecutorExecuteStreamsManagedToolArgumentPreview|AppStreamsManagedToolArgumentPreviewOverFrontendWebsocket)' -count=1`
  - `./scripts/go.sh test ./internal/realtime ./internal/managedllm ./internal/app -run 'Test(NewAIFollowToolResultUpdateMessage|ExecutorExecuteRunsToolCallsThroughMCPAndContinuesProviderTurns|ExecutorExecuteStreamsManagedToolArgumentPreview|AppServesManagedChatToolCallThroughInternalMCPClient|AppStreamsManagedToolArgumentPreviewOverFrontendWebsocket|AppStreamsManagedAIFollowToolResultUpdateOverFrontendWebsocket)' -count=1`
  - `./scripts/go.sh test ./internal/transcriptionprofiles ./internal/transcriptionsessions ./internal/httpapi ./internal/app -run 'Test(Service|RegisterAIRoutes|AppServes(FileModeTranscriptionSessionRoutes|ManagedChatSendThroughManagedExecutor|ManagedChatThinkingUnsupportedWithoutExplicitProviderConfig))' -count=1`
  - `./scripts/go.sh test ./internal/httpapi -run 'TestRegisterProjectRoutesChatSectionMutations|TestRegisterProjectRoutesLayoutPresentationMutationsPersistInLatestState' -count=1`
  - `./scripts/go.sh test ./internal/app -run '^TestAppServesChatSectionMutationRoutes$' -count=1`
  - `./scripts/go.sh test ./internal/chatsections ./internal/httpapi ./internal/app -run 'Test(ServiceGetChatID(ReturnsExistingManagedAndExternalChats|ClearsMissingChat)|RegisterProjectRoutes(ChatSectionMutationsPersistAndTrackFrontendOpIDs|ChatSectionMutationsRejectInvalidSectionAndSettings|GetChatSectionChatIDReturnsExistingAndClearsMissing)|AppServes(ChatSectionMutationRoutes|GetChatSectionChatIDRoute))' -count=1`

## Next Recommended Step

The direct AI/chat cluster covered by this inventory is now fully Go-owned for
its current bounded surface. Rerank outside this cluster instead of opening
another automatic Phase 18 slice, and only revisit broader managed preview or
reasoning follow-ons if a concrete current caller proves that gap first.
