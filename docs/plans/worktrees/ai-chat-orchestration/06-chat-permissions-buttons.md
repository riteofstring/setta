# Chat Permissions Buttons

## Goal
Add chat input-area buttons to set permission mode (`minimal`, `yolo`, `config.toml custom`).

## Scope
- In scope: permission mode controls, state persistence, execution-mode mapping.
- Out of scope: redefining permission semantics.

## Plan
1. Define permission mode state model and defaults.
2. Add buttons below chat input with clear selected-state styling.
3. Wire selection to underlying execution permission configuration.
4. Validate persistence and visibility of active mode.

## Acceptance Criteria
- Users can switch permission mode via chat UI buttons.
- Selected mode is applied to subsequent agent actions.

## Verification
- Add unit tests for permission mode state transitions.
- Add Playwright test for button selection and applied behavior.
- CDP visual check for button states and spacing.
