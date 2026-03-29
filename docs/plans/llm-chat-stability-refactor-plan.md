# LLM Chat Stability Refactor Plan

## Goal
Close the remaining managed-chat authority gaps after the refactor that already landed. The remaining work is to eliminate the last frontend-over-backend drift in hydrated tool-call state, add shared guardrails for authoritative hydration and replacement semantics, and finish only the cleanup that still materially reduces ownership ambiguity.

## Guiding Philosophy
- Go is the canonical owner of managed-chat correctness-sensitive logic.
- Canonical chat semantics should live in the backend runtime:
  - stream lifecycle interpretation
  - message reconciliation and finalization
  - placeholder handling
  - tool-call argument accumulation and reset
  - `waitingForResponse` transitions
  - hydration authority and replacement rules whenever the architecture allows it
- Frontend TypeScript should own rendering, drafts, interaction state, and narrow in-flight UI overlays, not independent managed-chat semantics.
- Python toolkit code should stay as SDK and transport ergonomics, not a competing owner of authoritative chat-state behavior.
- If behavior must remain duplicated across Go, TypeScript, and Python, keep that duplication constrained and lock it to shared fixtures.

## Current Status
- Completed:
  - shared managed-chat stream contract fixtures now exist and run in Go, TypeScript, and Python
  - placeholder-id handling, finalized assistant reconciliation, tool-call argument accumulation, and covered `waitingForResponse` stream semantics were aligned across reducers
  - managed-chat hydration in `ai.ts` now routes through explicit authority helpers instead of the old generic merge path
  - section projection refreshes no longer use message completeness heuristics for managed-chat message rows
  - `internal/managedchat` hydration now carries `toolCallArguments`, and the live runtime handles the supported stream chunk families with smaller helpers
  - major frontend owners were reduced materially:
    - `frontend/src/state/actions/ai.ts`
    - `frontend/src/components/Chat/ChatMessages.tsx`
    - `frontend/src/components/Chat/ChatInput.tsx`
    - `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
    - `frontend/src/components/Section/Layouts/ChatArea.tsx`
- Still remaining:
  - active-stream hydrate still lets local `toolCallArguments` override backend values for the same `tool_call_id` in some frontend authority paths
  - the shared cross-language contract suite covers reducer chunk application, but not authoritative hydration and replacement semantics
  - the largest frontend owners are still large, and the plan's explicit guardrail slice has not landed yet

## Refocused Scope
- In scope:
  - active-stream hydration and section projection precedence for `toolCallArguments`
  - shared guardrails for authoritative hydration and replacement semantics
  - narrow frontend cleanup only where it removes remaining ownership ambiguity or enables the needed tests
- Out of scope unless directly required by the above:
  - another broad backend cleanup pass
  - more extraction churn for its own sake
  - new chat features
  - compatibility shims to preserve stale frontend-over-backend behavior

## Remaining Problems
- The last meaningful authority drift is in hydrated tool-call overlays.
  - frontend authority helpers still merge `toolCallArguments` as `{ ...backend, ...local }` during active-stream preservation
  - that keeps local-only in-flight ids, which is correct, but it also lets stale local values win over backend values for the same id, which is not
  - the same precedence issue exists in chat-details hydration, section-state hydration, and project-state section projection
- Shared guardrails still stop at reducer chunk application.
  - the current shared fixture corpus locks stream chunk semantics well
  - authoritative hydration and replacement rules are still enforced only by frontend-specific tests
  - that leaves the most important remaining authority boundary easier to drift than the stream reducers
- The remaining oversized frontend owners are not yet guarded.
  - file size alone is not the problem
  - the problem is that future fixes can still slip back into broad owners without a clear ownership boundary or focused regression coverage

## Decision
Treat the final slice as authority hardening and guardrails, not as another broad refactor.

Key decisions:
- Backend-managed hydrated state wins for message rows and backend-known tool-call arguments.
- During an active local stream, the frontend may preserve only narrow overlays:
  - draft and view state
  - `waitingForResponse`
  - local-only in-flight tool-call argument ids that the backend hydration payload does not yet know about
- A local overlay must not override a backend value for the same `tool_call_id`.
- Shared cross-language fixtures should continue to lock duplicated reducer behavior.
- Add a second shared fixture corpus, or the closest practical equivalent, for authoritative hydration and replacement semantics wherever duplication still exists.
- Do not do more UI surgery unless it removes real behavioral ownership or is necessary to support the missing guardrails.

## Remaining Work Plan
1. Fix active-stream tool-call overlay precedence
- Replace the current active-stream merge rule for `toolCallArguments`.
- New rule:
  - backend wins for any `tool_call_id` present in the hydration payload
  - local overlay survives only for ids missing from the backend payload
- Apply the same rule in:
  - `frontend/src/state/actions/chatDetailsAuthority.ts`
  - `frontend/src/state/actions/chatSectionAuthority.ts`
  - `frontend/src/state/actions/sectionInfos.ts`
- Add focused tests for:
  - backend more complete than local for the same `tool_call_id`
  - local-only in-flight tool-call ids preserved during an active stream
  - inactive-stream hydrate replacing stale local tool-call arguments completely

2. Add authoritative hydration and replacement guardrails
- Add a shared fixture corpus, or equivalent mirrored cases, for hydration semantics instead of relying only on frontend-only tests.
- Cover:
  - hydrate while a stream is active with backend replacing same-id messages
  - backend `toolCallArguments` winning over stale local values for the same ids
  - local-only overlays preserved only while the stream is active
  - inactive-stream hydrate replacing local-only rows and stale tool-call arguments
  - section projection sync matching chat-details authority rules
- If a layer should not own hydration semantics directly, avoid duplicating behavior there and document the owning layer instead.

3. Add the narrowest remaining guardrails
- Add focused regression coverage around the authority helpers and section projection so future fixes cannot silently reintroduce drift.
- Add lightweight complexity guardrails for the worst remaining owners only if the repo already has a clear, maintainable mechanism.
- Prefer behavioral guardrails over synthetic churn tests.

4. Revisit decomposition only where it still buys clarity
- `ai.ts`: continue extracting managed-chat authority and promotion responsibilities only if doing so makes ownership or testing clearer
- `ChatMessages.tsx`, `ChatInput.tsx`, `ProjectChatCore.tsx`, and `ChatArea.tsx`: avoid more wrapper-only churn
- Any additional extraction should remove real behavioral ownership, not just move lines around

## Suggested Next Slice
The next slice should be:
- fix `toolCallArguments` precedence during active-stream hydration
- add hydration-authority fixtures and tests that lock the intended replacement behavior
- then decide whether any further decomposition is still justified

## Risks and Mitigations
- Risk: fixing tool-call overlay precedence changes visible interrupted-tool behavior.
  - Mitigation: lock the intended cases in tests before changing the merge rule.
- Risk: more extraction churn lands without reducing ambiguity.
  - Mitigation: require each extraction to make one ownership boundary clearer or one missing guardrail possible.
- Risk: section projection drifts from chat-details authority again later.
  - Mitigation: test both paths against the same intended hydration rules.

## Acceptance Criteria
- During active-stream hydration, backend `toolCallArguments` win for any `tool_call_id` the backend already knows about.
- Local overlays preserve only missing in-flight ids plus explicit UI state.
- Managed-chat hydration and section projection follow the same authority rules.
- Authoritative hydration and replacement semantics are covered by tests that are harder to drift than ad hoc frontend-only cases.
- Shared stream reducer fixtures remain in place for Go, TypeScript, and Python.
- Any remaining large frontend owners are either clearly bounded enough or covered by guardrails that keep managed-chat semantics from spreading back into them.

## Execution Order
1. Fix `toolCallArguments` overlay precedence in hydration and section projection.
2. Add shared or mirrored hydration-authority fixtures and tests.
3. Add the narrowest remaining guardrails for the authority helpers and oversized owners.
4. Revisit further decomposition only if a concrete ownership problem remains after the authority slice is complete.
