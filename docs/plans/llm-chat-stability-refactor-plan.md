# LLM Chat Stability Refactor Plan

## Goal
Finish the chat-stability refactor by removing the remaining frontend state-authority drift, expanding reducer-contract coverage, and completing the frontend ownership cleanup that is still blocking a truly backend-authoritative managed-chat path.

## Guiding Philosophy
- Go is the canonical owner of managed-chat correctness-sensitive logic.
- Canonical chat semantics should live in the backend runtime:
  - stream lifecycle interpretation
  - message reconciliation and finalization
  - placeholder handling
  - tool-call argument accumulation/reset
  - `waitingForResponse` transitions
  - hydration authority and replacement rules
- Frontend TypeScript should own rendering, drafts, interaction state, and narrow in-flight UI overlays, not independent managed-chat semantics.
- Python toolkit code should stay as SDK/tooling ergonomics and transport glue, not a competing owner of authoritative chat-state behavior.
- If reducer logic must remain duplicated across Go, TS, and Python for language/runtime reasons, treat that duplication as a constrained exception and keep it locked to the same shared contract corpus.

## Status Update
- Largely completed:
  - shared managed-chat stream contract fixtures now exist and run in Go, TypeScript, and Python
  - placeholder-id handling and finalized-assistant reconciliation were extracted into explicit reducer helpers across Go, TS, and Python
  - `internal/managedchat` startup and stop flow were split out of the main service owner
  - `internal/managedllm` OpenAI Responses event handling was broken into smaller event-family handlers
  - some helper extraction landed for `ai.ts`, `ProjectChatCore.tsx`, `ChatArea.tsx`, `ChatMessages.tsx`, and `ChatInput.tsx`
- Still incomplete:
  - managed-chat hydration and section projection are still using frontend merge heuristics instead of a fully backend-authoritative replacement path
  - the shared fixture corpus covers only the first reducer slice, not the full supported stream lifecycle
  - a few reducer semantics still differ at the edges
  - the main frontend owners are still too large and still mix rendering, orchestration, polling, and side effects

## Refocused Scope
- In scope:
  - managed-chat hydration/state replacement under `frontend/src/state/actions/ai.ts`, `frontend/src/state/actions/chatMergeUtils.ts`, and `frontend/src/state/actions/sectionInfos.ts`
  - remaining reducer semantic alignment across `internal/managedchat`, `frontend/src/state/actions`, and `backend/setta/llm/chat_toolkit`
  - frontend decomposition for `ChatMessages.tsx`, `ChatInput.tsx`, `ProjectChatCore.tsx`, and `ChatArea.tsx`
  - regression tests and complexity guardrails for the remaining hotspots
- Out of scope unless directly required by the above:
  - another broad backend cleanup pass over `managedchat.Service` or `managedllm.Executor`
  - new chat features
  - protocol redesign
  - compatibility shims to preserve the old heuristic merge behavior

## Remaining Problems
- The frontend still treats backend chat state as something to reconcile with local state instead of something to replace with explicit, narrow local overlays.
  - `chatMergeUtils.ts` still preserves local-only assistant content and uses "pick more complete" behavior.
  - `sectionInfos.ts` still merges incoming project state with local chat state heuristically.
  - `ai.ts` still hydrates chat details and section state through merge helpers instead of a clearly authoritative path.
- The shared contract suite is not yet broad enough to lock the intended semantics.
  - missing or incomplete coverage includes `message_stop`, `tool_call_delta`, `tool_argument_preview_delta`, `tool_result`, cancellation/stop transitions, hydration while a stream is active, and placeholder edge cases involving attachments/tool-call state
  - the Go contract harness does not yet decode all supported chunk types handled by the reducer
- Reducer semantics still differ at the edges.
  - placeholder assistant ignore rules are not identical across Go, TS, and Python
  - hydration and section sync still preserve frontend-derived activity rows in cases where backend state should win
- The biggest frontend owners are still oversized.
  - `frontend/src/state/actions/ai.ts` is still over 4k lines
  - `frontend/src/components/Chat/ChatMessages.tsx` is still over 6.7k lines
  - `frontend/src/components/Chat/ChatInput.tsx` is still over 2.7k lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` is still carrying hydration retry/polling/orchestration responsibilities

## Decision
Treat the remaining work as a state-authority cleanup, not as another broad extraction pass.

Key decisions:
- Managed-chat message state is authoritative from the backend Go runtime and backend hydration payloads.
- Go should own the canonical implementation of managed-chat semantics wherever the architecture allows it.
- Frontend state may preserve only narrow ephemeral UI state while a stream is active.
- Section chat state is a projection of authoritative chat state plus local draft/UI fields, not a parallel semantic owner of managed-chat messages.
- Python and frontend reducers should not grow new correctness-sensitive behavior that is better owned in Go.
- Any reducer duplicated across languages must be held to the same shared contract corpus and should be collapsed back toward Go ownership when practical.
- Do not spend another large refactor slice on backend startup/executor cleanup unless a concrete remaining bug requires it.
- Remove heuristic merge behavior rather than wrapping it in more abstractions.

## Remaining Work Plan
1. Finish backend-authoritative hydration and section replacement
- Remove managed-chat-specific uses of heuristic message reconciliation where backend state should replace frontend state.
- Replace generic "pick more complete" merging with explicit rules:
  - if the backend reports a completed/non-waiting chat, backend messages and tool-call state win
  - if a stream is still active locally, preserve only explicitly tracked ephemeral overlays, not arbitrary local-only message rows
  - preserve local drafts and view state separately from authoritative chat messages
- Stop persisting frontend-merged managed-chat activity rows back into section state.
- Document the authoritative replacement rules next to the hydration entrypoints.

2. Expand the shared stream-contract corpus
- Add fixtures for:
  - `message_stop`
  - `tool_call_delta`
  - `tool_argument_preview_delta`
  - `tool_result`
  - cancellation/interruption
  - `waitingForResponse` transitions across stop/finalize/hydrate
  - hydration while a stream is active
  - placeholder messages that carry attachments or tool-call state
- Update the Go fixture harness to decode every chunk family that the reducers claim to support.
- Keep the same fixture expectations in Go, TS, and Python until any remaining duplicate reducers can be removed.

3. Remove the remaining reducer drift
- Align placeholder ignore rules across Go, TS, and Python.
- Align tool-call argument accumulation and reset behavior across stream, finalize, stop, cancel, and hydrate paths.
- Align `waitingForResponse` transitions across reducers and hydration entrypoints.
- Delete reducer branches that only exist to preserve legacy frontend drift.
- Prefer deleting duplicated frontend/Python semantics entirely when the canonical Go-owned path can replace them cleanly.

4. Finish frontend state ownership cleanup
- Split `ai.ts` further by managed-chat responsibility:
  - hydration and authoritative replacement
  - live stream receive/reducer
  - section projection sync
  - stop/cancel reconciliation
  - app-generation side effects
- Remove managed-chat-specific uses of `mergeChatMessages` and similar heuristic helpers once the authoritative path lands.
- Keep local-only state limited to drafts, pending composer state, and clearly UI-only metadata.
- Make frontend modules consume backend-authored semantics rather than reinterpret them.

5. Finish frontend UI decomposition
- `ChatMessages.tsx`
  - move remaining attachment preview loading and other networked behavior into hooks
  - continue splitting activity derivation, measurement, structured-output presentation, and animation concerns
- `ChatInput.tsx`
  - split dictation, slash-suggestion positioning, queued drafts, and attachment-manager integration into focused hooks/modules
- `ProjectChatCore.tsx`
  - extract hydration retry/cache lifecycle and workspace-root polling into focused hooks or modules
- `ChatArea.tsx`
  - keep it as wiring/layout only
- Prefer extractions that remove real behavioral ownership, not wrapper-only churn.

6. Add the missing guardrails
- Add focused tests for authoritative hydration replacement vs live-stream overlays.
- Add targeted tests for section-state projection so managed chat does not silently regain a second semantic owner.
- Add lightweight complexity guardrails for the worst remaining files/functions.
- Require new managed-chat fixes to land with reducer/authority tests that would have caught the bug.

## Suggested Next Slice
The next slice should be the authority cleanup, not more UI surgery:
- remove managed-chat-specific heuristic hydration merges
- replace them with explicit backend-authoritative replacement rules
- expand the fixture corpus to cover the stop/tool/hydration cases that this change depends on

Once that slice is done, continue with file decomposition only where ownership is still too broad.

## Risks and Mitigations
- Risk: finishing the authority cleanup changes visible hydration behavior.
  - Mitigation: lock the intended behavior with shared fixtures and focused hydration tests before deleting the merge heuristics.
- Risk: more extraction churn lands without reducing semantic ambiguity.
  - Mitigation: tie each extraction to one ownership boundary that becomes clearly single-purpose afterward.
- Risk: section state continues to reintroduce drift after hydration is cleaned up.
  - Mitigation: add projection-specific tests and treat section state as a projection, not a semantic source.

## Acceptance Criteria
- Managed-chat hydration and section sync no longer rely on "pick more complete" or generic local-overlay heuristics for authoritative message state.
- Backend Go payloads are the clear source of truth for managed-chat messages outside explicitly tracked ephemeral UI state.
- Correctness-sensitive managed-chat behavior is owned primarily in Go rather than reimplemented independently in frontend/Python layers.
- Shared stream fixtures cover the supported stream lifecycle consistently across Go, TS, and Python reducers.
- Placeholder handling, finalized reconciliation, tool-call argument behavior, and `waitingForResponse` transitions no longer differ by layer.
- The remaining frontend owners have narrower responsibilities and materially smaller behavioral surface area.
- Complexity/regression guardrails exist for the remaining hotspots.

## Execution Order
1. Replace heuristic managed-chat hydration/section merges with backend-authoritative rules.
2. Expand the shared fixture corpus and decoder coverage to lock those rules in.
3. Remove the remaining reducer drift across Go, TS, and Python.
4. Split the remaining managed-chat state ownership inside `ai.ts`.
5. Continue decomposing `ChatMessages.tsx`, `ChatInput.tsx`, `ProjectChatCore.tsx`, and `ChatArea.tsx` by responsibility.
6. Add lasting guardrails so future chat fixes stay inside the authoritative structure.
