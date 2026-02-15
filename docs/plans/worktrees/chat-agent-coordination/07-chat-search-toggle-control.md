# Chat Search Toggle Switch

## Goal
Provide a control below chat input to toggle search capability on/off.

## Scope
- In scope: toggle UI, search capability wiring, explicit on/off visual state.
- Out of scope: redesigning search engine behavior.

## Plan
1. Add search toggle to chat footer controls, adjacent to other orchestration controls.
2. Bind state to chat execution capability configuration used for new runs.
3. Use Setta-consistent active/inactive styling and persist selection where expected.

## Acceptance Criteria
- Users can toggle search from chat UI.
- Search toggle state is visibly clear and affects subsequent chat runs.

## Verification
- Add unit tests for toggle state wiring.
- Add Playwright flow toggling search and verifying request behavior.
- CDP visual check for placement, active state, and contrast.
