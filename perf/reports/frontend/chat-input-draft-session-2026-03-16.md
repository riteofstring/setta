# Chat Input Draft Session

Date: `2026-03-16`

## Scenario

- URL: `http://127.0.0.1:3002/wave_tiger`
- Surface: visible Project AI chat composer in the project workspace
- View states checked:
  - default chat view at `1440x900`
  - compact-width chat view at `960x900`

## Refactor Scope

- `frontend/src/components/Chat/ChatInput.tsx` now acts as the chat-composer
  coordinator for slash-suggestion layout, attachment chrome, dictation wiring,
  and the remaining composer render shell.
- `frontend/src/components/Chat/chatInputDraftSession.ts` now owns queued-draft
  session state, submitted-history selection, escape clear/restore behavior,
  and queued replay continuity.
- `frontend/src/components/Chat/ChatInputQueuedDraftStack.tsx` now owns the
  queued-draft rail shell plus row-level restore and keyboard selection
  behavior.

## Measurements

| Metric                                | Before | After |
| ------------------------------------- | -----: | ----: |
| `ChatInput.tsx` lines                 |   1605 |   999 |
| `chatInputDraftSession.ts` lines      |      0 |   727 |
| `ChatInputQueuedDraftStack.tsx` lines |      0 |   115 |
| Composer form subtree nodes           |     25 |    24 |
| Composer form button count            |      5 |     5 |
| Composer textarea width               |    442 |   442 |
| Composer form width                   |    442 |   442 |
| Composer surface width                |    458 |   458 |

- Compact-width after check at `960x900`:
  - `document.documentElement.scrollWidth === document.documentElement.clientWidth`
  - the visible Project AI composer stayed at `458px` width with no horizontal
    overflow
  - the queued-draft rail remained absent in the default empty-state view and
    the compact layout still rendered the same starter controls

## Result

- The front-door file dropped by `606` lines while preserving the composer
  geometry measured in CDP and slightly reducing the default form subtree from
  `25` nodes to `24`.
- The compact-width view still rendered cleanly at `960x900`, so the extracted
  draft-session owner did not introduce shell churn or horizontal overflow.
