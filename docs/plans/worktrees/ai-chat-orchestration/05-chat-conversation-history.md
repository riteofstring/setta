# Chat Conversation History

## Goal
Enable chat sections to display and navigate conversation history.

## Scope
- In scope: message persistence, history list rendering, conversation selection/loading.
- Out of scope: cross-account history sync.

## Plan
1. Define conversation history storage model and identifiers.
2. Add history panel/list UI and selection behavior.
3. Load selected history into chat view with pagination/virtualization if needed.
4. Ensure history ordering/searchability is usable.

## Acceptance Criteria
- Users can access prior chat conversations in chat sections.
- Selecting a conversation restores its message thread reliably.

## Verification
- Add unit tests for history store operations.
- Add Playwright scenario for create conversation, switch, and restore history.
- CDP visual check for history panel layout.
