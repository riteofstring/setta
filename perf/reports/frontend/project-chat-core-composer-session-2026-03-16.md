# Project Chat Core Composer Session

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
  conversation-search filtering, branch info derivation, runtime telemetry, and
  the final chat-surface render branches.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatCoreComposerSession.ts`
  now owns composer execution settings, pending-prompt adoption,
  slash-command refresh or retry handling, draft-thread submit settlement,
  submit/edit/redo/stop handlers, and provider-dictation transcribe wiring.

## Measurements

| Metric                                         | Before | After |
| ---------------------------------------------- | -----: | ----: |
| `ProjectChatCore.tsx` lines                    |   1019 |   373 |
| `useProjectChatCoreComposerSession.ts` lines   |      0 |   853 |
| Project AI chat surface subtree nodes          |     56 |    39 |
| Project AI chat surface `data-testid` count    |      3 |     3 |
| Project AI chat surface width-shell host count |      2 |     2 |
| Project AI chat surface width                  |    262 |   262 |
| Project AI chat surface height                 |    696 |   696 |

- Compact-width after check at `960x900`:
  - the visible Project AI chat surface stayed at `262px` by `696px`
  - the visible Project AI chat surface subtree stayed at `39` nodes
  - the width-shell host count stayed at `2`
  - there was no horizontal overflow

## Result

- The front-door file dropped by `646` lines while the same live Project AI
  chat surface stayed geometrically flat in the checked workspace scenario.
- CDP checks at `1440x900` and `960x900` showed no horizontal overflow, the
  same visible chat-shell geometry, and a smaller measured subtree after the
  composer-session extraction.
