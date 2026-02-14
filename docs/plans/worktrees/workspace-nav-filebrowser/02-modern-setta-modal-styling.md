# Modern Setta Modal Styling

## Goal
Bring modal UI styling in line with current Setta visual direction.

## Scope
- In scope: modal shell, spacing, typography, border/radius/shadow, focus states.
- Out of scope: modal feature changes beyond presentation.

## Plan
1. Define modal style tokens from current Setta UI anchors.
2. Apply consistent modal layout and surface styles to load/save and related dialogs.
3. Ensure focus traps, keyboard actions, and contrast remain accessible.

## Acceptance Criteria
- Target modals match modern Setta styling patterns.
- No regressions in modal interaction/accessibility behavior.

## Verification
- Run/update component tests for modal interaction behavior.
- Add Playwright snapshots for modal states.
- CDP visual check with before/after comparison.
