# Conversation Tree Graph Plan (Project Chat + Chat Sections)

## Goal
Add an optional conversation tree graph view for edited-response branches, rendered with React Flow, and reuse the same viewer in:
- Project Chat pane (`Overview -> Project AI Chat`)
- Chat sections
- Right-side pane system entry point for chat sections

## Why React Flow (decision)
Use React Flow as the primary renderer.
- We already use the internal XYFlow fork in this codebase.
- We already have branch/edge metadata in state (`branchParentChatId`, `branchFromMessageId`, etc.).
- We need interactive node selection and branch switching, not a static diagram.

Mermaid can be a future export/share format, not the primary in-app UI.

## Existing Data We Can Reuse
- Managed/project chat branch graph comes from:
  - `useChatBranchIndex` (`frontend/src/state/hooks/useChatBranchIndex.ts`)
  - `buildMessageBranchInfo` (`frontend/src/state/actions/chatBranchIndex.ts`)
- Scriptable section chat branch graph comes from:
  - `ChatSectionState.branches` + `buildBranchIndexFromBranches` (`frontend/src/state/actions/chatBranches.ts`)

No backend schema change is required for the first version.

## UX Shape (v1)
1. Keep current thread view as default.
2. Add `Thread | Tree` toggle for chat surfaces.
3. Tree view is simplified:
   - Active path fully visible.
   - Non-active siblings collapsed behind compact branch markers/badges.
4. Selecting a graph node switches to that branch/chat and updates normal thread state.
5. Keep existing per-message branch arrows for now (low-risk coexistence); evaluate removal later.

## Placement Plan
### 1) Project Chat Pane
- Add toggle in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx` toolbar.
- Render either:
  - existing `ProjectChatCore` thread UI, or
  - shared graph view component.

### 2) Chat Section Main Area
- Add same `Thread | Tree` toggle in `frontend/src/components/Section/Layouts/ChatArea.tsx` (both managed + scriptable flows).
- Render shared graph view with section-specific data source.

### 3) Right-Side Pane System (chat sections)
- Add an entry point in chat section settings (`frontend/src/components/Panes/UiEditor/SectionConfig/ChatAreaSettings.tsx`) that opens the same graph viewer in a dialog/sheet.
- This gives an identical viewer in the right pane system without duplicating graph logic.

## Shared Architecture
Create a reusable chat graph module under `frontend/src/components/Chat/ConversationTree/`:
- `conversationTreeModel.ts`
  - Pure functions:
    - normalize messages (exclude tool messages)
    - derive nodes/edges from branch index + messages
    - mark active path
    - collapse policy for siblings
- `ConversationTreeGraph.tsx`
  - React Flow presentation only
  - props-driven nodes/edges + callbacks
- `ConversationTreePanel.tsx`
  - shared controls (fit view, reset, thread switch, legend)
- `conversationTreeTypes.ts`
  - explicit types for node/edge payloads

Keep routing/state switching outside the graph renderer. The graph emits `onSelectChat(chatId)` / `onSelectBranch(branchId)` and parent containers apply existing switch handlers.

## Data Contract (v1)
- Node identity: `${chatId}:${messageId}` (or `${branchId}:${messageId}` for scriptable mode).
- Node kinds:
  - `user`
  - `assistant`
  - `branch-point` (compact synthetic node when collapsing)
- Edge kinds:
  - `sequence` (solid)
  - `branch` (dashed)
- Node labels are short text previews (truncate aggressively).

## Performance Guardrails
- Build graph with `useMemo` keyed by stable inputs (`chatId`, `messages`, `branch index`).
- Default collapsed rendering to keep node/edge counts small.
- Avoid full relayout on minor streaming updates; only recompute when structural branch state changes.
- Add perf tests around large branch families and long chats.

## Test Plan
### Unit/Vitest
- `conversationTreeModel.test.ts`
  - branch family derivation
  - active path marking
  - collapse/expand behavior
  - stable ordering
- update existing branch tests as needed:
  - `frontend/src/state/actions/chatBranches.test.ts`
  - `frontend/src/state/actions/aiBranches.test.ts`

### Component tests
- Graph renders expected node/edge counts for representative fixtures.
- Selecting a graph node calls branch/chat switch callback.

### Playwright E2E
- Project Chat: edit a message, open tree view, switch branch via graph.
- Chat section (managed): same flow.
- Right-pane entry point: open graph from chat section settings and switch branch.

## Rollout Strategy
1. Ship behind a local UI flag (default off) until validated.
2. Enable by default after test coverage and UX pass.
3. Optional follow-up: remove old per-message branch arrows once tree view usage is validated.

## Implementation Sequence
1. Build shared model + tests.
2. Build shared graph renderer + tests.
3. Integrate Project Chat.
4. Integrate ChatArea (managed + scriptable).
5. Add right-pane entry point for chat sections.
6. Add Playwright coverage.
7. Run visual verification + performance sanity checks.

## Open Decisions To Confirm Before Implementation
1. Right-pane presentation: modal dialog from `ChatAreaSettings` vs dedicated UI Editor tab.
2. Initial density: fully collapsed non-active branches vs one-level expansion by default.
3. Whether to keep or remove per-message branch arrow controls in v1.
