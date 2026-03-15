# Project Chat Core Hydration Session

Date: `2026-03-16`

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: visible Project AI chat surface in the project workspace
- View states checked:
  - default chat view at `1440x900`
  - compact-width chat view at `960x900`

## Refactor Scope

- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
  now acts as the project-chat core coordinator for store selection,
  slash-command refresh dispatch, submission/edit/redo handlers, and the final
  chat-surface render branches.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatCoreHydrationSession.ts`
  now owns selected-thread hydration retry state, timer cleanup, and
  blocked-code orchestration.

## Measurements

| Metric                                        | Before | After |
| --------------------------------------------- | -----: | ----: |
| `ProjectChatCore.tsx` lines                   |   1225 |  1019 |
| `useProjectChatCoreHydrationSession.ts` lines |      0 |   239 |
| Project AI chat surface subtree nodes         |     58 |    58 |
| Project AI chat surface button count          |     11 |    11 |
| Project AI chat surface textbox count         |      2 |     2 |
| Conversation filter width                     |    153 |   153 |
| Composer textarea width                       |    246 |   246 |
| Composer textarea height                      |     32 |    32 |
| Project AI chat surface width                 |    274 |   274 |
| Project AI chat surface height                |    716 |   716 |

- Compact-width after check at `960x900`:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - the visible Project AI chat surface stayed at `274px` by `716px`
  - the conversation filter stayed at `153px`
  - the composer textarea stayed at `246px` by `32px`
  - there was no horizontal overflow

## Result

- The front-door file dropped by `206` lines while the measured Project AI
  chat surface stayed flat in the same workspace scenario.
- CDP checks at `1440x900` and `960x900` showed the visible Project AI chat
  surface kept the same geometry and avoided horizontal overflow after the
  hydration-session extraction.
