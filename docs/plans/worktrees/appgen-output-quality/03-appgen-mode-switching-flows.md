# App Gen Mode Switching Flows

## Goal
Support explicit mode switching across JSON render, JSON+image guidance, prompt building, and MCP-driven generation.

## Scope
- In scope: mode state model, UI controls, execution routing per mode.
- Out of scope: adding unrelated generation modes.

## Plan
1. Define a single mode enum/state model shared by pane and chat flows.
2. Add mode controls and clear current-mode visibility.
3. Route execution pipeline by selected mode with mode-specific inputs.
4. Handle mode transitions without losing in-progress user context.

## Acceptance Criteria
- Users can switch between all supported generation modes.
- Each mode executes the correct backend/frontend generation path.

## Verification
- Add unit tests for mode state transitions and routing.
- Add Playwright coverage for switching and generating in each mode.
- CDP visual check for mode controls and state clarity.
