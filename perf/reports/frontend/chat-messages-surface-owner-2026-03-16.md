# Chat Messages Surface Owner

Date: 2026-03-16
Root surface: `frontend/src/components/Chat/ChatMessages.tsx`
Slice: extract message bubble shells, action rail, and per-message render branches into local owners

## Owners after slice

- `frontend/src/components/Chat/ChatMessages.tsx`
  - grouped activity-only row iteration
  - search-match scrolling and active-match targeting
  - edit-mode session state and placeholder-assistant row wiring
- `frontend/src/components/Chat/chatMessageSurface.tsx`
  - per-message assistant, user, and system render branches
  - editor swap, action-bar composition, and attachment/message-content wiring
- `frontend/src/components/Chat/chatMessageActions.tsx`
  - copy, redo, edit, and branch-switch controls
- `frontend/src/components/Chat/chatMessageBubbles.tsx`
  - assistant, user, and system bubble shells plus action anchors

## CDP notes

- Baseline: not captured in CDP before the edit because the live dev page had already hot-reloaded into the extracted implementation by the time the seeded message surface was ready.
- Verification page: `http://127.0.0.1:3002/wave_tiger`
- Seeded a disposable chat section with one user, one assistant, and one system message to exercise all three bubble shells.
- Measured seeded chat-section surface after the extraction:
  - section geometry: `284px` by `143px`
  - message-list geometry: `282px` by `70px`
  - message groups: `3`
  - action rails: `3`
  - anchors: `1` left, `2` right
  - bubbles: `1` user, `1` assistant, `1` system
  - message-list horizontal overflow: `false` at `1440x900` and `960x900`
- Screenshot: `perf/reports/frontend/chat-messages-surface-owner-2026-03-16.png`
