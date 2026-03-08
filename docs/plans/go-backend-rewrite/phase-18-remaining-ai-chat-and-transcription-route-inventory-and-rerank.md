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
  - owns `/getLLMResponse` for the external-agent branch only
  - owns `/getExternalAgentChat`, `/getAIFollowSnapshot`,
    `/stopExternalAgentRun`, `/respondExternalAgentApproval`, and
    `/respondExternalAgentQuestion`
- `internal/agentruns`
  - owns managed run storage and a managed active-run runtime foundation
  - still leaves the real IDE app wiring disabled until a managed executor is
    wired
- `internal/httpapi/project_routes.go`
  - already owns the broad project-state mutation transport pattern with
    `frontendOpId` handling
- `internal/transcriptionprofiles`
  - already owns transcription-profile read/write plus live capability
    attachment

Question this inventory answers:

- after the landed Phase 17 slice, which remaining Python-owned direct
  frontend AI/app-generation routes actually justify the next Go phase?

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-14-managed-agent-start-stop-runtime-and-transport.md`
- `docs/plans/go-backend-rewrite/phase-17-app-gen-skills-and-custom-skill-transport.md`
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

### 1. Managed chat send/hydrate/stop is still a live direct frontend gap

The remaining active managed-chat dependency is not just a missing route name.
It is a partially Python-owned route cluster:

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

- `internal/httpapi/ai_routes.go` intentionally routes `/getLLMResponse` only
  into `internal/externalagents.SendService`
- that service explicitly requires `EngineType.external_agent`
- no Go route currently owns `/getLLMChat` or `/stopLLMChat`
- the landed `internal/agentruns` managed runtime foundation exists, but the
  real app still wires it as unavailable until a managed executor exists

Implication:

- this is the highest-leverage remaining direct frontend AI gap
- the next slice must treat managed chat as runtime work over the existing Go
  managed-run foundations, not as a thin transport cleanup

### 2. Chat-section persistence is the adjacent direct dependency and should move with managed chat

These routes remain Python-owned and have live direct frontend callers:

- `POST /setChatSectionState`
- `POST /setChatSectionChatId`

Current callers:

- `frontend/src/components/Section/Layouts/ChatArea.tsx`
  - persists section message/input/waiting/tool-argument/branch state through
    `route_set_chat_section_state(...)`
  - persists section `chatId` through `route_set_chat_section_chat_id(...)`
- `frontend/src/state/actions/ai.ts`
  - updates managed section `chatId` after submit/edit flows
- `frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`
  - clears section `chatId` when starting a new managed chat after settings
    changes

Why this belongs with managed chat instead of a separate transport slice:

- the frontend uses these routes immediately before and after managed chat
  sends, hydrations, and branch changes
- splitting chat runtime ownership from section persistence would keep a
  Python-owned source-of-truth seam in the middle of the same user flow
- Go already has the project-state mutation transport pattern needed for these
  routes

### 3. Transcription session runtime is still active, but it is a separate runtime cluster

These direct frontend routes remain Python-owned:

- `POST /startTranscriptionSession`
- `POST /appendTranscriptionAudio`
- `POST /stopTranscriptionSession`
- `POST /cancelTranscriptionSession`

Current callers:

- `frontend/src/state/actions/ai.ts`
  - drives the full dictation/provider-transcription flow through these routes

Why this is not the same slice as managed chat:

- the runtime owner is audio-session and provider-transcription lifecycle, not
  managed chat send/hydrate/stop
- the current Python contract is centered on chunking, transport-mode
  resolution, realtime/file fallback, payload size enforcement, and
  provider-specific validation
- there is no direct dependency from managed chat hydration/stop onto
  transcription-session ownership

Rerank:

- still important
- not the first Phase 18 executable slice
- recommended as the next adjacent AI/runtime follow-on after managed chat

### 4. `POST /getChatSectionChatId` remains dormant for the current direct frontend surface

This route remains Python-owned:

- `POST /getChatSectionChatId`

Current status:

- this inventory did not find a live direct frontend caller in the current UI
  code
- current references are in backend tests and toolkit/listener-oriented tests
- current UI flows read chat section `chatId` from project state instead of
  calling this route directly

Rerank:

- low priority
- do not bundle it into Phase 18 unless a concrete caller appears

## Reranked Outcome

1. The next executable AI follow-on should be the managed chat cluster:
   managed `/getLLMResponse`, `/getLLMChat`, `/stopLLMChat`, plus
   `/setChatSectionState` and `/setChatSectionChatId`.
2. The next adjacent AI/runtime slice after that should be transcription
   session ownership if dictation remains an active product dependency.
3. Dormant `getChatSectionChatId` does not justify a separate route slice now.

## Decisions Made

- treat the remaining managed chat surface as Phase 18 runtime work over the
  landed managed-run foundations, not as something still fully de-scoped
- keep transcription-session runtime explicitly separate from the managed-chat
  slice
- keep dormant `getChatSectionChatId` out of scope until a real caller appears

## Progress Notes

- 2026-03-09: reran the remaining direct frontend AI/app-generation route
  inventory after the landed Phase 17 app-gen skills slice.
- 2026-03-09: confirmed the highest-leverage remaining gap is managed chat
  send/hydrate/stop plus chat-section persistence, while transcription remains
  an adjacent but separable runtime cluster.
- 2026-03-09: opened the executable follow-on in
  `phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`.

## Verification

- docs and inventory only; no automated tests were run

## Next Recommended Step

- use
  `phase-18-managed-chat-send-hydrate-stop-and-section-persistence-plan.md`
  as the next executable Phase 18 slice
- defer transcription-session runtime work to a separate bounded follow-on
  unless implementation of the managed chat slice proves a hard shared
  dependency
