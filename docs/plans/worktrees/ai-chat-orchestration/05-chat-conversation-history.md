# Chat Conversation History

## Goal
Enable chat sections to display, browse, and restore conversation history.

## Scope
- In scope: conversation/message persistence, history list UI, and conversation selection/restoration.
- Out of scope: cross-account history sync.

## Plan
1. Define conversation storage model and stable identifiers (including title, timestamps, and ordering fields).
2. Add history panel/list UI with clear active selection state.
3. Restore selected conversation into chat thread without corrupting current state.
4. Support scalable rendering behavior as history volume grows.

## Acceptance Criteria
- Users can access prior chat conversations in chat sections.
- Selecting a conversation restores its message thread reliably and updates active conversation context.

## Verification
- Add unit tests for history store operations.
- Add Playwright scenario for create conversation, switch between entries, and restore history.
- CDP visual check for history panel layout.
