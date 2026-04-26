# Chat Message List Virtualization Plan

## Goal
Add virtualization to the chat message list so very long conversations remain responsive while preserving streaming, edit-in-place, branch switching, attachments, and auto-scroll UX.

## Scope
- In scope:
  - `frontend/src/components/Chat/ChatMessages.tsx`
  - project chat usage (`ProjectChatCore`) and section chat usage (`ChatArea`) through shared `ChatMessageList`
  - tests and profiling artifacts for this refactor
- Out of scope:
  - conversation tree graph UI
  - backend chat schema/state changes
  - changes to chat behavior or permissions model

## Implementation Context
- Chat renders all non-tool messages directly in a loop and relies on a scrolling container (`flex-col-reverse overflow-y-auto`).
- File browser already uses `react-window` with fixed row heights.
- Chat rows are variable height and mutate during streaming/editing, so fixed-height virtualization is not sufficient.

## Decision
Use `react-window` for chat virtualization with variable-size rows.
- Why:
  - dependency already present and used in repo
  - minimizes new package risk
  - supports list-level optimization needed for long transcripts
- Constraint:
  - must provide robust row height measurement and targeted invalidation when a row changes height.

## Implementation Plan
1. Baseline and guardrails
- Capture pre-change performance profile with chrome-devtools-mcp for a long-chat scenario.
- Record baseline in a new append-only report under `perf/`.
- Define acceptance targets (scroll smoothness, reduced DOM node count in viewport, fewer heavy commits).

2. Introduce virtualized chat list shell
- Replace direct message rendering container in `ChatMessageList` with a `react-window` list wrapper.
- Keep existing message renderers (`ChatMessage`) unchanged where possible to limit regression risk.
- Preserve top/bottom spacing and message order semantics.

3. Add variable-size row measurement
- Add deterministic row height cache keyed by message id.
- Measure rendered row height with `ResizeObserver` and update list via `resetAfterIndex`.
- Invalidate only affected rows when content changes (streaming deltas, edit mode toggle, attachment preview/text expansion, branch controls).

4. Preserve chat UX invariants
- Preserve auto-scroll behavior when user is pinned to latest messages.
- Preserve "do not jump" behavior when user scrolls away from bottom.
- Keep streaming placeholder/assistant updates stable.
- Keep branch switch controls and edit interactions identical.

5. Integrate across chat surfaces
- Validate `ProjectChatCore` path (managed project chat).
- Validate `ChatArea` paths (managed and scriptable chats).
- Ensure shared props (`branchInfoByMessage`, edit callbacks, tool arguments) work unchanged.

6. Add/adjust tests
- Vitest (`ChatMessages.test.tsx` + new focused helpers):
  - renders only windowed rows for large message sets
  - preserves ordering and branch-control placement
  - verifies row height cache invalidation behavior for streaming/edit toggles
- Playwright (`frontend/tests/e2e/`):
  - long chat scroll behavior remains stable
  - editing a previous message works after virtualization
  - branch switching targets the correct chat

7. Verify and profile after refactor
- Run relevant Vitest and Playwright suites.
- Run chrome-devtools-mcp visual verification for chat views.
- Re-profile same scenario; append before/after results to `perf/`.

## Risks and Mitigations
- Risk: scroll anchoring regressions during streaming.
  - Mitigation: explicit pinned-to-bottom state + targeted tests.
- Risk: incorrect heights for markdown/tool/result rich messages.
  - Mitigation: `ResizeObserver` on each row + cache invalidation.
- Risk: interaction regressions (edit, copy, branch nav).
  - Mitigation: keep `ChatMessage` logic intact; add interaction E2E coverage.

## Acceptance Criteria
- Long chats remain responsive with significantly lower active DOM footprint.
- No behavior changes in message content, editing, branching, attachments, or streaming indicators.
- Automated coverage updated (Vitest + Playwright for affected flows).
- CDP visual verification completed.
- Before/after performance notes added under `perf/`.

## Execution Order
1. Baseline profiling + report entry.
2. Virtualized list scaffold.
3. Variable-height measurement + invalidation.
4. Auto-scroll and streaming stabilization.
5. Tests (Vitest, then Playwright).
6. CDP visual check + post-change profiling + report append.
