# Fix Small Dropdown Chevron Vertical Fit

## Goal
Correct small dropdown/combobox chevron sizing so it fits snugly and vertically centered.

## Scope
- In scope: compact input sizing tokens and chevron button/icon dimensions in affected workspace controls.
- Out of scope: broader component redesign.

## Plan
1. Reproduce issue in affected small dropdown contexts.
2. Align chevron container/icon sizing to compact input height tokens.
3. Verify alignment consistency across idle/hover/focus/disabled states.

## Acceptance Criteria
- Chevron is vertically centered and properly sized in small dropdowns.
- No clipping or misalignment remains.

## Verification
- Add/update component tests for compact size classes.
- Add Playwright assertions for affected controls.
- CDP visual check in modal and non-modal contexts.
