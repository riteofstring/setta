# Chat Permissions Control

## Goal
Add a chat input-area control to set permission mode (`minimal`, `yolo`, `config.toml custom`).

## Scope
- In scope: permission mode selector UI, selected-state persistence, and execution config mapping.
- Out of scope: redefining permission semantics.

## Plan
1. Define permission-mode state model and defaults for chat orchestration.
2. Add a Setta-style dropdown selector below chat input with the three modes.
3. Match visual treatment to existing chat top controls for active/hover/focus states.
4. Wire selected mode into execution permission configuration for subsequent runs.

## Acceptance Criteria
- Users can switch permission mode from the chat footer control.
- Selected mode is visibly active and applied to subsequent agent actions.

## Verification
- Add unit tests for permission mode state transitions.
- Add Playwright test for selector changes and applied execution behavior.
- CDP visual check for dropdown styling, states, and placement.
