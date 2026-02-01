# Sub-Agent Streaming + UI Stability Plan

## Summary
This plan targets five recurring issues reported over the last 10-20 commits:
1) Massive performance drops when sub-agents stream, with main agent stream lagging even after sub-agents finish.
2) Sub-agent messages not streaming into their own chat sections (only appear after completion).
3) Sub-agent approval prompts sometimes appearing in the main agent chat section.
4) Vertical resize glitch where incoming message disappears during resize.
5) Assistant message content permanently missing even after reload.

The goal is to produce reproducible tests, add high-signal logging, and fix the root causes without introducing new regressions. All UI changes must be verified via CDP.

## Guiding Principles
- Tests must fail before fixes are applied.
- Prefer deterministic, synthetic tests that model streaming and tool/approval routing.
- Avoid over-reliance on async timing; use fake timers and explicit flushing.
- Maintain source-of-truth routing (chatId, tool_call_id, approval context) in one place.
- Keep logs structured, timestamped, and correlated across frontend/backend.

---

## Phase 0: Baseline + Repro Harness (No code changes)
1) Capture updated logs from a repro run that shows all five issues:
   - frontend.log and backend.log
   - record timestamps for the first sub-agent tool call, first stream chunk, first approval prompt
   - note if the main agent chatId differs from sub-agent chatIds
2) Confirm current expected routing:
   - sub-agent tool call id == sub-agent chatId
   - approval payload includes toolContext parentToolCallId
3) Verify current performance symptoms using DevTools:
   - CPU profile during heavy sub-agent streaming
   - React profiler timeline during message updates

Deliverable: a short summary in a follow-up note describing the reproduction environment, timeline, and which issue is most reproducible.

---

## Phase 1: Tests First (Failing)

### A) Sub-agent streaming routing
Add failing tests that assert streaming chunks appear incrementally in sub-agent sections, not the parent:
- Unit test (state/actions): simulate MESSAGE_START + DELTA + MESSAGE_STOP for sub-agent chatId before section exists, then after create
- Expect:
  - while streaming, sub-agent section has incremental assistant content
  - parent section does not receive the streaming content
  - `pendingSubAgentChunksByCallId` flush results in the same order

### B) Approval routing to sub-agent section
Add failing tests ensuring approvals tagged with toolContext.parentToolCallId are routed to sub-agent section:
- Use MESSAGE_START + TOOL_CALL_DELTA + MESSAGE_STOP sequences to mimic streaming approvals
- Expect the approval tool call message to be stored in the sub-agent section, not the parent

### C) Layout snapshot and section creation stability
Add failing test to catch sub-agent section creation race:
- Simulate multiple sub-agent sections created in quick succession
- Simulate top-level layout persistence with missing node internals for some new sections
- Expect layout snapshot includes all top-level sections, even if node internals aren’t ready

### D) Vertical resize streaming glitch
Add a failing UI test (Playwright) or component test (Vitest + RTL) that resizes a chat section while streaming:
- Expect the streaming message content remains visible during size changes
- Use a streaming assistant message with incremental deltas

### E) Persistence after reload
Add a test that ensures streaming content survives a simulated reload:
- Persist streaming content via backend broadcast or local store hydrate
- Reload by reinitializing stores from persisted project state
- Expect no missing content

---

## Phase 2: Debug Logging (Targeted, Timestamped)

### Frontend logging additions
- Log each streaming chunk with:
  - timestamp
  - chatId
  - sectionId (before and after routing)
  - message_id
  - tool_call_id (if any)
  - approval toolContext parentToolCallId (if any)
- Log sub-agent mapping state transitions:
  - creation start
  - sectionId resolved
  - pending chunk flush start/end
- Log all applyChatSectionStreamDelta calls with message counts before/after

### Backend logging additions
- Log each LLMStreamingResponse emission with:
  - chat_id
  - section_id
  - event type
  - tool_call_id / approval_id
- Log approval requests with any toolContext payload included (if present)

Goal: identify any routing mismatches and confirm that approval payloads include sub-agent context.

---

## Phase 3: Fixes (After Tests Fail)

### 1) Streaming routing correctness
- Ensure all LLM streaming chunks for sub-agent chatId are routed to the sub-agent section when it exists.
- If section not yet created:
  - buffer chunks and flush in order after creation
  - include message_start + delta + stop sequences
- Prevent parent section from ingesting sub-agent streaming chunks once mapping exists.

### 2) Approval routing correctness
- For approval tool calls tagged with toolContext parentToolCallId:
  - route all approval messages (start/delta/stop/finalized) into the sub-agent section
  - keep a routing table keyed by message_id to avoid mid-stream re-routes

### 3) Layout + creation race
- Preserve all top-level sections on layout snapshot, even if node internals are incomplete.
- Ensure new sub-agent sections are never dropped by layout writes.

### 4) Resize + streaming rendering stability
- Ensure the streaming message container uses stable keys and no temporary unmounts during resize.
- Validate that streaming message content is preserved in state, not recomputed from DOM.

### 5) Persistence after reload
- Audit any logic that overwrites streaming messages during backend sync.
- Ensure `processProjectStateUpdateFromBackend` merges streaming messages and does not drop in-flight deltas.
- Ensure storage serialization includes streaming content (even incomplete tool calls).

---

## Phase 4: Verification

### Automated
- Run new tests that failed in Phase 1 and confirm they now pass.
- Run relevant existing suites (aiSubAgent, streaming, resize tests).

### Manual
- Use CDP to verify:
  1) Sub-agent streaming is visible live in its own section
  2) Approvals appear in the correct sub-agent section
  3) Resizing a streaming chat does not drop content
  4) Reload preserves streaming content

Document verification steps in PR notes.

---

## Acceptance Criteria
- Streaming chunks for sub-agents are visible in the correct section as they arrive.
- Approval prompts appear in the correct sub-agent section when toolContext references a parent tool call.
- No performance drop beyond expected baseline (measure via DevTools: no long tasks > 50ms during streaming bursts).
- Vertical resize does not hide streaming content.
- Reload does not drop partial or completed assistant content.

---

## Risks / Unknowns
- If approval toolContext is not provided by the backend, we must add or infer it there.
- If section creation is delayed by layout updates, buffering must remain consistent across multiple simultaneous sub-agents.
- Performance issues may require batching or throttling render updates rather than routing fixes alone.

---

## Proposed Test Files (names)
- frontend/src/state/actions/aiSubAgentStreamingRouting.test.ts
- frontend/src/state/actions/aiSubAgentApprovalsRouting.test.ts
- frontend/src/state/actions/sections/topLevelLayoutSnapshot.test.ts
- frontend/tests/e2e/chat-streaming-resize.spec.ts
- frontend/src/state/actions/aiStreamingPersistence.test.ts

