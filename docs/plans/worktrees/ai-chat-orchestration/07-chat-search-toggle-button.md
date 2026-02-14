# Chat Search Toggle Button

## Goal
Provide a button below chat input to toggle search capability on/off.

## Scope
- In scope: toggle UI, capability state wiring, visible on/off state.
- Out of scope: redesigning search engine behavior.

## Plan
1. Add search toggle control in chat footer controls.
2. Bind toggle state to search capability used by chat execution.
3. Display current state clearly and persist if appropriate.

## Acceptance Criteria
- Users can toggle search from chat UI.
- Search capability state affects subsequent chat runs.

## Verification
- Add unit tests for toggle state wiring.
- Add Playwright flow toggling search and verifying request behavior.
- CDP visual check for control placement and state.
