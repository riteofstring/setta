# Project Chat Thread Session

Date: `2026-03-16`

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: visible Project AI chat surface in the project workspace
- View states checked:
  - default chat view
  - thread list view after `View Threads`

## Refactor Scope

- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  now acts as the project-chat coordinator for chat-id selection, store-backed
  hydration authority, engine sync, and surface wiring.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatThreadSession.ts`
  now owns per-surface draft-thread lifecycle, selected thread-group sync,
  engine-switch continuation state, and pending-chat continuity.

## Measurements

| Metric                              | Before | After |
| ----------------------------------- | -----: | ----: |
| `ProjectChat.tsx` lines             |   1377 |  1183 |
| `projectChatThreadSession.ts` lines |      0 |   341 |
| Default view subtree nodes          |     58 |    58 |
| Default view button count           |     11 |    11 |
| Default view text input count       |      3 |     3 |
| Default view surface width          |    458 |   458 |
| Default view surface height         |    508 |   508 |

- Compact-width after check at `960x900`:
  - `document.documentElement.scrollWidth === window.innerWidth`
  - the default chat view stayed at `458px` width with no horizontal overflow
  - the thread list still opened cleanly and showed the same empty-state CTA

## Result

- The front-door file dropped by `194` lines while keeping the measured default
  Project AI chat subtree flat in CDP.
- The thread-list view still rendered cleanly at both `1440x900` and
  `960x900`, so the new thread-session owner did not add visible shell churn
  or compact-width overflow.
