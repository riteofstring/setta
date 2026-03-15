# ProjectChatHistory DnD Session Extraction

- Date: 2026-03-16
- Surface: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatHistory.tsx`
- Slice: extract history drag-session ownership into `useProjectChatHistoryDndSession.ts`
- Verification page: `http://127.0.0.1:3002/wave_tiger`

## Baseline

- Threads view open at `1440x900`
  - panel `0`: `262x667`, subtree `34`, horizontal overflow `false`
  - panel `1`: `458x479`, subtree `34`, horizontal overflow `false`
- Threads view open at `960x900`
  - panel `0`: `262x667`, subtree `34`, horizontal overflow `false`
  - panel `1`: `458x479`, subtree `34`, horizontal overflow `false`

## After

- Threads view open at `1440x900`
  - panel `0`: `262x667`, subtree `34`, horizontal overflow `false`
  - panel `1`: `458x479`, subtree `34`, horizontal overflow `false`
- Threads view open at `960x900`
  - panel `0`: `262x667`, subtree `34`, horizontal overflow `false`
  - panel `1`: `458x479`, subtree `34`, horizontal overflow `false`

## Notes

- This slice moved drag-session state, pointer tracking, and drop-to-mutation
  orchestration out of the front-door coordinator without changing the render
  structure of the threads panel.
- The panel geometry and subtree counts stayed flat before and after the
  extraction, so the refactor did not add DOM or layout overhead on the
  measured surface.
