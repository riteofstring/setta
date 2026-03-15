# Project Chat Engine Settings And Hydration Selection

Date: `2026-03-16`

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: visible Project AI chat surface in the project workspace
- View states checked:
  - default chat view at `1440x900`
  - compact-width chat view at `960x900`

## Refactor Scope

- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
  now acts as the project-chat coordinator for chat-id selection, hydration
  authority adaptation, continuation-aware engine sync, and surface wiring.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatEngineSettings.ts`
  now owns engine/configuration state, provider-dictation readiness,
  external-engine notification side effects, and settings-popover mutations.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatHydrationSelection.ts`
  now owns history compatibility, chat-to-engine lookup derivation, and
  hydration metadata revision helpers.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatAuxViewState.ts`
  now owns project-scoped aux-view, draft-message, and thread-visibility
  writes.

## Measurements

| Metric                                | Before | After |
| ------------------------------------- | -----: | ----: |
| `ProjectChat.tsx` lines               |   1185 |   646 |
| `useProjectChatEngineSettings.ts`     |      0 |   463 |
| `projectChatHydrationSelection.ts`    |      0 |    92 |
| `projectChatAuxViewState.ts`          |      0 |   144 |
| Project AI chat surface subtree nodes |     56 |    56 |
| Conversation filter width             |    153 |   153 |
| Conversation filter height            |     25 |    25 |
| Composer textarea width               |    246 |   246 |
| Composer textarea height              |     32 |    32 |
| Project AI chat surface width         |    262 |   262 |
| Project AI chat surface height        |    696 |   696 |

- Compact-width after check at `960x900`:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - the visible Project AI chat surface stayed at `262px` by `696px`
  - the conversation filter stayed at `153px` by `25px`
  - the composer textarea stayed at `246px` by `32px`
  - there was no horizontal overflow

## Result

- The front-door file dropped by `539` lines while the measured Project AI chat
  surface stayed flat in the same workspace scenario.
- CDP checks at `1440x900` and `960x900` showed the visible Project AI chat
  surface kept the same geometry and avoided horizontal overflow after the
  engine-settings, hydration-selection, and aux-state extraction.
