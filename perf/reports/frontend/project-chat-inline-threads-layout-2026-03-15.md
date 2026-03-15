# Project Chat Inline Threads Layout - 2026-03-15

- Scenario:
  - `http://127.0.0.1:3002/racing_busy`
  - viewport `1400x900`
  - overview pane seeded to `ProjectAIChat` with `overviewWidth: 1040`
  - `viewThreads: true`
  - inline-thread resize exercised with synthetic mouse events on `[data-testid="project-chat-inline-threads-resize-handle"]`
- Baseline before the extraction:
  - header-host width `219px -> 299px` after a `+80px` drag
  - toolbar overflow delta stayed at `-8px` before and after the drag
  - DevTools trace summary reported synthetic `CLS: 0.03`
- After extracting `projectChatInlineThreadsLayout.ts` and `useProjectChatInlineThreadsLayout.ts`:
  - header-host width `219px -> 299px` after the same `+80px` drag
  - toolbar overflow delta stayed at `-8px` before and after the drag
  - DevTools trace summary again reported synthetic `CLS: 0.03`
- Notes:
  - No visual or interaction regression was observed in the wide inline-thread resize path.
  - The synthetic drag contributes to the trace CLS signal, so the matching `0.03` value is only useful as a before/after consistency check for this refactor.
