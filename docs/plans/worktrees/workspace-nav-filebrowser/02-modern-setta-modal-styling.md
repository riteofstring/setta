# Modern Setta Modal Styling

## Goal
Bring modal UI styling in line with current Setta visual direction.

## Scope
- In scope: modal shell, spacing, typography, border/radius/shadow, and focus/hover states.
- Out of scope: modal feature changes beyond presentation.

## Plan
1. Define modal style tokens from current Setta UI anchors.
2. Apply consistent modal layout and surface styling to load/save and related dialogs.
3. Validate keyboard behavior, focus visibility, and color contrast after styling updates.
4. Verify final visuals with Playwright and chrome-devtools-mcp.

## Acceptance Criteria
- Target modals match modern Setta styling patterns.
- No regressions in modal interaction/accessibility behavior.

## Verification
- Run/update component tests for modal interaction behavior.
- Add Playwright snapshots or assertions for key modal states.
- CDP visual check with before/after comparison.
