# Chat Background Terminals Plan (Chat Sections)

## Goal
Add a chat-native terminal experience for AI-opened background terminals:
- show a terminal count at the bottom of chat sections,
- render compact, non-interactive, read-only terminal previews inside chat,
- provide a button to pop those previews into a larger read-only terminal panel.

## Scope
- In scope:
  - Chat sections (`frontend/src/components/Section/Layouts/ChatArea.tsx`) in managed and scriptable modes.
  - Shared chat terminal UI components under `frontend/src/components/Chat/`.
  - Backend/transport support for reliable `chatId -> terminal section ids` mapping.
  - Tests (Vitest + Playwright) and CDP visual verification.
- Out of scope:
  - Changing normal terminal section behavior on canvas (existing terminal sections remain interactive in their native surface).
  - Heuristic parsing of free-form tool text to guess terminals.

## Product Behavior (v1)
1. Bottom-of-chat terminal summary
- Add a compact footer row above `ChatInput`:
  - label example: `Background terminals: 2`
  - `Show` toggle to reveal/hide inline compact previews
  - `Pop out` button to open a larger read-only terminal panel

2. Inline compact terminal previews in chat
- When shown, render 1..N compact terminal cards in chat content area (non-interactive).
- Each card shows:
  - terminal section name/id,
  - running/idle indicator,
  - compact xterm viewport with latest output.

3. Pop-out read-only terminal panel
- `Pop out` opens a read-only terminal dialog/panel with larger terminal viewports.
- No keyboard input is accepted in this panel.

## Data Source Decision (No Heuristics)
Use an explicit backend-maintained chat-terminal mapping. Do not infer from message text.

Reasoning:
- Existing AIFollow ids are useful but insufficient alone for robust ownership in all run paths (especially when a terminal is auto-allocated/reused without explicit terminal ids in tool arguments).
- Parsing tool-call result strings/JSON blobs in the frontend is brittle and violates robustness requirements.

## Backend Plan
### 1) Add chat-terminal ownership tracking
- Introduce an in-memory registry keyed by:
  - `projectConfigId`
  - `chatId`
  - ordered list/set of terminal section ids + metadata
- Metadata fields (initial):
  - `terminalSectionId`
  - `isRunning` (or process count > 0)
  - `lastActivityMs`
  - `source` (`attached`, `temporary`, `reused`)

### 2) Establish ownership at terminal allocation/use points
- Primary hooks: `internal/wsapi/routes.go`, `internal/terminals/service.go`,
  and the attached-terminal helpers in `internal/projectstate`
  - when a terminal is selected/created for an AI-originated run, register it for that `chatId`.
- Terminal lifecycle cleanup:
  - remove/update entries when terminals are deleted/stopped through
    `internal/httpapi/terminal_routes.go` and `internal/terminals/service.go`.

### 3) Transport + hydration
- Add typed websocket update for chat terminal summaries (new message type, not `z.any()`).
- Add snapshot route similar to AI follow snapshot for reconnect/hydration.
- Wire sender in the active Go websocket/runtime path (`internal/wsapi` / `internal/realtime`).

### 4) Chat context plumb-through (required for robust mapping)
- Ensure AI-triggered run pathways provide `chatId` to the terminal registration point.
- If a run has no chat origin (manual Run button, listener/manual API), do not attribute it to chat-terminal UI.

## Frontend Plan
### 1) State slice
- Add a dedicated chat-terminal store keyed by `projectConfigId -> chatId`.
- Hydrate via snapshot route on project load/reconnect.
- Apply websocket incremental updates in `frontend/src/state/actions/websocketReceive.ts`.

### 2) Shared UI components
Create reusable components under `frontend/src/components/Chat/BackgroundTerminals/`:
- `ChatBackgroundTerminalFooter.tsx`
  - renders count + show/hide + pop-out button
- `InlineReadOnlyTerminalList.tsx`
  - compact in-chat terminal cards
- `ReadOnlyTerminalPanel.tsx`
  - dialog/panel for enlarged read-only terminal views

### 3) Read-only terminal rendering
- Extend `useTerminal` hook (`frontend/src/state/hooks/terminals/terminal.ts`) with explicit read-only mode.
- Ensure read-only instances:
  - set `disableStdin=true`,
  - never auto-focus input,
  - keep websocket/history streaming behavior.
- Avoid mode conflicts by isolating read-only and interactive terminal session keys if necessary.

### 4) Integrate into chat sections
- In `frontend/src/components/Section/Layouts/ChatArea.tsx`:
  - render footer count above `ChatInput`,
  - render inline compact terminals above the footer,
  - open pop-out read-only panel from footer action.

## Testing Plan
### Backend tests
- Registry lifecycle:
  - register on AI-originated terminal allocation,
  - update running/idle state,
  - cleanup on terminal deletion.
- Snapshot route and websocket payload shape tests.

### Frontend Vitest
- Store reducer/handler tests for websocket + snapshot updates.
- `ChatArea` rendering tests:
  - count text for zero/non-zero states,
  - show/hide inline terminals,
  - pop-out panel open/close.
- `useTerminal` read-only mode test (stdin disabled / no focus side effects).

### Playwright E2E
- Managed chat section flow:
  - trigger AI action that opens a background terminal,
  - verify bottom count updates,
  - verify compact read-only preview appears,
  - verify pop-out panel opens and is non-interactive.
- Optional scriptable flow parity test.

### Visual verification
- Run chrome-devtools-mcp check on chat section with inline + pop-out terminal UI.

## Rollout
1. Ship behind a UI flag (`chatBackgroundTerminalViewer`).
2. Enable for chat sections first.
3. Reuse same components for Project Chat after section rollout is stable.

## Open Decisions Before Implementation
1. Should Project Chat use the same terminal footer/panel in v1, or chat sections only?
2. Inline density default: show all terminals, or cap to first N with “+X more”?
3. Retention policy: keep terminals listed until explicit close, or auto-prune idle terminals after timeout?

## If Full Chat Attribution Is Not Yet Available
A fully robust mapping requires explicit run origin (`chatId`) at terminal allocation time.
- Recommended: add/plumb explicit origin chat metadata and implement this plan.
- Alternative (not recommended): infer from AIFollow section ids filtered to terminal sections. This can misattribute reused terminals and miss auto-allocated cases; do not implement without explicit approval.
