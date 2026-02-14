# Chat Skills Toggle Control

## Goal
Add a chat footer control to toggle skills usage on/off for agent execution.

## Scope
- In scope: skills toggle UI, execution config integration, state display.
- Out of scope: redesigning skills browser itself.

## Plan
1. Add skills toggle control below chat input next to search/permissions controls.
2. Connect toggle state to skill enablement in chat execution configuration.
3. Align active/inactive styling with existing chat top controls and link to skills-browser context where helpful.

## Acceptance Criteria
- Users can enable/disable skills directly from chat.
- Skills toggle state is clearly visible and respected by subsequent chat tasks.

## Verification
- Add unit tests for skills toggle state and execution config mapping.
- Add Playwright test for toggling skills and observing behavior change.
- CDP visual check for control integration with other footer buttons.
