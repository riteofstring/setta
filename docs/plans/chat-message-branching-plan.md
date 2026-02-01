# Chat Message Hover + Branching Plan

This plan adds ChatGPT-style hover actions (copy/edit) and message branching for
Project Chat and Chat sections, including a branch switcher UI.

## Goals
- Show copy + edit action buttons under each chat message on hover.
- Editing a user message creates a new branch that preserves the original path.
- Branch switcher appears on messages with multiple variants (e.g., `2/2` + arrows).
- Work in both Project Chat and Chat sections (managed + scriptable).
- Persist branches across reloads for managed chats.

## Non-goals
- Editing assistant/tool/system messages (unless explicitly required later).
- Rewriting the LLM streaming pipeline or message storage format end-to-end.
- Retrofitting branch metadata into historical runs beyond the new feature.
- Backward compatibility or legacy support for pre-branch chats.

## UX Behavior
- Hovering a message reveals a compact action bar beneath the bubble.
- Actions are left-aligned for assistant/system messages and right-aligned for
  user messages to match the bubble alignment.
- Copy is always available for non-tool messages.
- Edit is available only for user messages and disabled while waiting for a
  response or when share policy forbids edits (gate on
  `useShareCapabilities().canEditParams`).
- Editing turns the message into an inline textarea with Save/Cancel.
- Saving an edit switches the view to the new branch and kicks off a new run.
- Branch switcher appears only when a message has sibling branches; arrows are
  disabled at the ends.
- Editing supports attachments: users can keep/remove existing attachments and
  add new ones in the edit UI (same validation + limits as the main composer).
- While waiting for response, edit buttons are disabled with a short tooltip
  (we can revisit branch-while-streaming later).
- Branch switcher order is stable: include the parent chat as slot 1, then
  child branches sorted by `branchCreatedAt` (fallback to run timestamps).

## Data Model (Managed Chats: Project Chat + Managed Chat Sections)
- Add branch metadata to LLM/external agent runs via run inputs:
  - `branchParentChatId`: chat id that was edited from.
  - `branchFromMessageId`: id of the message that was edited.
  - `branchRootChatId`: root chat id for grouping (optional but helpful).
  - `branchCreatedAt`: timestamp for ordering in the switcher.
- Reuse the same message id for the edited message in the new branch so the
  branch switcher can anchor on a consistent message id across chats.

## Data Model (Scriptable Chat Sections)
- Extend `ChatSectionState` to include a lightweight branch tree:
  - `activeBranchId`: string.
  - `branches`: map of branch id -> `{ messages, createdAt, parentBranchId }`.
  - `branchFromMessageId`: on child branches, to enable per-message switcher.
- Derive the initial branch state from existing `messages` on load.
- Keep branch metadata inside the section state (no agent runs).

## Backend Changes (LLM/External)
- Update `GetLLMResponseRequest` in `backend/setta/routers/ai.py` to accept
  optional `branchParentChatId` + `branchFromMessageId`.
- In `route_get_llm_response`, when branch fields are provided:
  - Resolve prior messages from `branchParentChatId` (latest run).
  - Verify the message id exists; raise `KeyError` if not found.
  - Truncate messages after the target message.
  - Replace the target message content with the edited message payload
    while preserving the message id.
  - Start a new run with a new `chatId` and persist branch metadata in inputs.
- For external agent runs, apply the same branch logic but use external runs
  as the source of truth and validate engine/project compatibility against
  `branchParentChatId` before starting the new branch.
- Ensure external agent branch runs pass the same metadata and honor the
  engine/project compatibility checks.

## Frontend State + Branch Indexing (Managed)
- Add a `ChatBranchInfo` type in `frontend/src/state/definitions.ts` that
  captures parent + message + createdAt.
- Build a branch index from `agentRuns`:
  - `branchInfoByChatId` and `branchChildrenByChatId` (parent -> message -> chats).
  - Keep ordering stable by `branchCreatedAt` (fallback to run timestamps).
- Add a hook to load agent runs when branch UI is visible so Chat sections
  also have branch data.
- Implement the index in a shared helper (e.g. `state/actions/aiBranches.ts`)
  so both Project Chat and Chat sections use the same logic.

## Frontend Actions (Managed)
- Add `submitEditedMessage` in `frontend/src/state/actions/ai.ts`:
  - Build the edited message with the original id.
  - Call the updated `route_get_llm_response` with branch metadata.
  - Use a new helper to initialize `pendingChatDetails` with the truncated
    history + edited message before the new chat id returns.
  - On success, set the new chat id (`activeChatId` or section `chatId`).
  - On failure, restore the previous chat id + details.
  - Flatten edited user content to a single text block; preserve attachments.

## Frontend Actions (Scriptable)
- Add helpers in `frontend/src/components/Section/Layouts/ChatArea.tsx` or a
  new `state/actions/chatBranches.ts` to:
  - Create a new branch with truncated messages + edited message.
  - Switch `activeBranchId` when using the branch switcher.
  - Preserve the previous branch for toggle back.

## UI Component Changes
- `frontend/src/components/Chat/ChatMessages.tsx`:
  - Wrap each message bubble in a `group` container to control hover state.
  - Add a `ChatMessageActions` bar with copy/edit/branch switcher slots.
  - Accept new props: `chatId`, `sectionId`, `onEdit`, `onBranchSwitch`,
    and a per-message `branchInfo` (index/count).
- Add a small `ChatMessageEditor` component for inline editing.
- Reuse `ChatInput` attachment UI inside `ChatMessageEditor` (or a slimmed
  version) so edit flows match upload/limit validation.
- Use `react-icons` for copy/edit/branch arrows to match existing UI usage.
- Follow `docs/reference/ui-style-consistency.md` for button sizing and hover
  styling; keep actions subtle and compact.

## Branch Switcher Logic
- For the current chat id:
  - If the message id matches the chat’s `branchFromMessageId`, show the
    sibling group consisting of the parent chat + its branch children.
  - Otherwise, show child branches where `parentChatId` is the current chat.
- Sibling ordering: parent first, then children by `branchCreatedAt` (fallback
  to run timestamps).
- Switcher controls update the active chat id (managed) or active branch id
  (scriptable) and re-fetch chat details if needed.

## Copy Behavior
- Copy plain text by concatenating text/thinking blocks in order.
- Ignore attachments and images in the copied payload.
- Use `navigator.clipboard.writeText` and `addTemporaryNotification` for feedback.

## Project Chat History
- Hide branch chats from the history list by default to avoid clutter.
- Optionally add a secondary label or tooltip for branch chats if they remain
  visible (based on product preference).
- Filtering location: `ProjectChatHistory` should skip runs that have
  `branchParentChatId` set in inputs.

## Tests
- Prefer a test-driven approach when possible: write/adjust tests first, then
  implement, then run the relevant suites.
- Backend (pytest):
  - Branch truncation + message replacement logic.
  - Error handling when `branchFromMessageId` is missing.
- Frontend (Vitest):
  - Branch index builder and per-message switcher detection.
  - Edit flow helper builds correct truncated history.
- Playwright:
  - Edit a user message in Project Chat and switch branches.
  - Edit a user message in a Chat section and switch branches.

## Verification
- Run CDP visual checks per `docs/guides/verification-checklist.md`.
- Confirm hover actions + branch switcher align with screenshots.

## Open Questions
- None. Decisions locked:
  - Edit is user-only.
  - Edits support adding/removing attachments.
  - Branch chats are preserved but hidden from the history list.
