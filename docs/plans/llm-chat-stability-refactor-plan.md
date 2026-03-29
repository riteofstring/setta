# LLM Chat Stability Refactor Plan

## Goal
Stabilize the managed LLM chat feature by reducing architectural drift, centralizing state authority, and breaking up the highest-risk backend and frontend owners into smaller units.

## Scope
- In scope:
  - managed LLM chat backend flow under `internal/managedchat`, `internal/managedllm`, and related HTTP routes
  - frontend managed chat state, hydration, streaming, and shared chat UI under `frontend/src/state/actions` and `frontend/src/components/Chat`
  - Python chat toolkit state-sync code under `backend/setta/llm/chat_toolkit` where it duplicates managed chat semantics
  - tests and regression guardrails for chat streaming and hydration behavior
- Out of scope:
  - new chat features
  - external-agent protocol redesign
  - conversation tree / detached chat product changes except where shared chat infrastructure must be cleaned up

## Current State (Observed)
- Chat-state transition logic is duplicated across three implementations:
  - Go live runtime reducer in `internal/managedchat/live_runtime.go`
  - frontend reducer and hydration merge logic in `frontend/src/state/actions/ai.ts`
  - Python toolkit section sync in `backend/setta/llm/chat_toolkit/section_sync.py`
- Those implementations do not fully agree on behavior.
  - The frontend ignores placeholder response IDs and remaps finalized assistant messages onto earlier streaming messages.
  - The Go and Python reducers mostly upsert by incoming message id.
  - This means live state, hydrated state, and persisted section state can legitimately diverge.
- There is no single authoritative managed-chat state.
  - live stream chunks mutate frontend state
  - hydration re-merges backend state with frontend state
  - section chat persistence writes frontend-derived state back into project state
  - merge logic uses heuristics such as "pick more complete message" instead of a clearly authoritative source
- The main backend owners are too complex for reliable local reasoning.
  - `(*Service).StartChat` in `internal/managedchat/service.go` has `gocyclo` 63
  - `(*Executor).processOpenAIResponseEvent` in `internal/managedllm/executor.go` has `gocyclo` 60
  - `applyStreamChunk` in `internal/managedchat/live_runtime.go` has `gocyclo` 26
- The main frontend owners are also oversized and overloaded.
  - `frontend/src/state/actions/ai.ts`: 4577 lines
  - `frontend/src/components/Chat/ChatMessages.tsx`: 8077 lines
  - `frontend/src/components/Chat/ChatInput.tsx`: 3209 lines
  - `frontend/src/components/Section/Layouts/ChatArea.tsx`: 2033 lines
  - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`: 2394 lines
- `ChatMessages.tsx` and `ChatInput.tsx` are not just renderers.
  - they also own side effects, fetches, streaming placeholder behavior, queued-draft behavior, interaction coordination, and presentation-specific state derivation

## Decision
Treat managed LLM chat correctness as a state-machine problem first, not a UI bug-fix problem.

Key decisions:
- Define one canonical managed-chat stream contract and make every implementation obey it.
- Make one layer clearly authoritative for managed-chat message state.
- Remove semantic drift before broad cleanup so future refactors do not bake in different interpretations of the same stream.
- Split backend and frontend by responsibility boundaries, not by file size alone.
- Do not preserve legacy paths, compatibility shims, migrations, or dual-write behavior unless a concrete supported workflow still requires them.
- Prefer replacing duplicate or obsolete chat code outright once the canonical path is ready.

## Implementation Plan
1. Freeze the intended supported behavior with contract coverage
- Build a managed-chat stream fixture corpus that covers:
  - assistant message start/delta/finalize
  - tool-call argument streaming and preview deltas
  - message stop vs message finalized
  - cancellation/interruption
  - placeholder response ids
  - finalized assistant remapping onto an earlier streaming message
  - hydration while a stream is active
- Run the same fixture expectations against:
  - Go live reducer
  - frontend reducer
  - Python toolkit reducer
- Add focused tests for known resurfacing bug classes before changing behavior.
- Use the fixture corpus to capture intended supported semantics, not accidental legacy quirks that only exist because implementations drifted.

2. Establish a canonical chat-state authority
- Decide and document that managed LLM chat state is authoritative from the backend runtime, not from frontend merge heuristics.
- Expose enough authoritative metadata to remove guesswork:
  - finalized-message target identity
  - provider message ids when relevant
  - explicit stream lifecycle markers instead of inferred completion
- Delete obsolete duplicate state-sync paths instead of keeping compatibility bridges between old and new ownership.
- Keep local-only frontend state for drafts and ephemeral UI only.

3. Normalize reducer semantics across Go, TS, and Python
- Align placeholder-id handling across all managed-chat reducers.
- Align finalized-assistant reconciliation rules across all reducers.
- Align tool-call argument accumulation and reset behavior across all reducers.
- Align `waitingForResponse` transitions so message stop, finalize, cancel, and hydration use the same rules.
- If any reducer remains duplicated for language reasons, keep it contract-tested from the same fixture corpus.
- Remove reducer behaviors that only exist to preserve legacy drift between layers.

4. Decompose backend managed-chat startup flow
- Split `internal/managedchat/service.go` into smaller units with clear ownership:
  - request normalization and validation
  - chat lineage and branch resolution
  - prior-message loading
  - app-generation policy enforcement
  - prompt assembly
  - run input construction and dispatch
- Target smaller helpers that can be tested without invoking the full service path.
- Reduce `StartChat` complexity below the current hotspot level before further feature work lands here.
- Delete superseded helpers and old assembly paths as ownership moves; do not keep parallel startup paths for safety.

5. Decompose backend managed-LLM execution flow
- Split shared executor responsibilities from provider-specific event adapters.
- Move OpenAI Responses event handling out of the central executor switch into focused handlers by event family.
- Separate:
  - provider stream consumption
  - assistant-message mutation
  - tool preview / AI-follow side effects
  - chunk emission to live runtime
  - finalization and error handling
- Keep the tool loop and provider adapters understandable without reading the entire file.
- Avoid compatibility wrappers that preserve the current monolithic executor shape under a new facade.

6. Clean up frontend state ownership
- Split `frontend/src/state/actions/ai.ts` into modules with narrower purposes:
  - hydration
  - stream receive/reducer
  - pending chat details
  - stop/cancel flows
  - section-state sync
  - app-generation side effects
- Replace heuristic merge behavior where possible with explicit authoritative replacement rules.
- Minimize cases where the same chat thread is represented by:
  - pending details
  - chat details
  - section state
  - hydrated run state
  at the same time.
- Remove old state paths when a new owner takes over instead of keeping both alive behind fallback logic.

7. Split frontend chat UI into pure renderers plus hooks/selectors
- Break `ChatMessages.tsx` into smaller modules:
  - message list shell
  - activity timeline derivation
  - assistant activity section
  - tool/result presentation
  - attachments
  - search/highlighting
  - edit/copy/branch action surfaces
- Move networked behavior such as attachment URL loading into hooks.
- Break `ChatInput.tsx` into:
  - composer core
  - slash-command handling
  - queued drafts
  - dictation
  - attachment manager integration
- Prefer pure props-based components where possible so rendering bugs are not coupled to state orchestration bugs.
- Do not preserve deprecated props or intermediate wrapper components longer than needed for the refactor.

8. Add guardrails for complexity and regression
- Add focused unit tests for reducers and helpers instead of relying mainly on large scenario tests.
- Keep integration tests for end-to-end chat flows, but stop using them as the only line of defense.
- Add lightweight complexity guardrails for the worst files/functions.
- When a bug fix touches managed chat, require the fix to land with the reducer/contract test that would have caught it earlier.

## Suggested First Slice
Start with the smallest refactor that reduces bug resurfacing risk without changing product behavior:
- add the shared stream fixture corpus
- align placeholder-id and finalized-message reconciliation semantics across Go, TS, and Python
- remove the known semantic drift before splitting larger files

This slice should be done before broader UI decomposition or provider-executor cleanup.
Once the canonical semantics are in place, remove the superseded implementations immediately rather than carrying migration layers.

## Risks and Mitigations
- Risk: refactor churn in an active feature area causes short-term regressions.
  - Mitigation: stage work behind contract fixtures and behavior-preserving slices.
- Risk: backend/frontend/Python drift continues during refactor.
  - Mitigation: shared fixture corpus becomes the gate before any feature changes.
- Risk: broad extraction creates file churn without reducing complexity.
  - Mitigation: split by ownership boundary and acceptance criteria, not arbitrary size.
- Risk: shared chat UI is also used by non-managed chat surfaces.
  - Mitigation: extract shared presentation pieces first and keep managed-chat state semantics isolated.

## Acceptance Criteria
- Managed-chat stream semantics are defined once and tested consistently across Go, TS, and Python implementations.
- Placeholder response handling and finalized assistant reconciliation no longer differ by layer.
- Managed chat has one clearly documented authoritative state path.
- `StartChat`, live stream reduction, and provider event handling are split into smaller testable units.
- Frontend chat state logic is no longer concentrated in a single 4.5k-line action file.
- `ChatMessages.tsx` and `ChatInput.tsx` are decomposed so most subcomponents are pure renderers or focused hooks.
- No backward-compatibility shims, migration-only code paths, or legacy duplicate reducers remain without a current supported reason.
- New managed-chat bug fixes land with reducer/contract coverage that prevents the same class of bug from resurfacing.

## Execution Order
1. Add shared stream-contract fixtures and regression cases.
2. Align reducer semantics across Go, TS, and Python.
3. Establish and document backend-authoritative managed-chat state.
4. Split `managedchat.Service` startup flow.
5. Split `managedllm.Executor` provider-event handling.
6. Split frontend `ai.ts` state ownership.
7. Split frontend chat UI files.
8. Tighten guardrails and keep future fixes inside the new structure.
