# Chat Skills Toggle Button

## Goal
Add a chat footer button to toggle skills usage on/off for agent execution.

## Scope
- In scope: skills toggle UI, execution config integration, state display.
- Out of scope: redesigning skills browser itself.

## Plan
1. Add skills toggle control below chat input.
2. Connect toggle state to skill enablement in chat execution pipeline.
3. Provide clear active/inactive visual state and optional tooltip/help.

## Acceptance Criteria
- Users can enable/disable skills directly from chat.
- Skills state is respected by subsequent chat tasks.

## Verification
- Add unit tests for skills toggle state and execution config mapping.
- Add Playwright test for toggling skills and observing behavior change.
- CDP visual check for control integration with other footer buttons.
