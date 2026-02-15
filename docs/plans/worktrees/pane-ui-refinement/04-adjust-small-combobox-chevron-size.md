# Adjust Small Combobox Chevron Size

## Goal
Ensure the chevron button in small combobox/dropdown variants is correctly sized and vertically aligned.

## Scope
- In scope: compact dropdown/combobox sizing tokens, icon button dimensions, alignment styles.
- Out of scope: full combobox redesign.

## Plan
1. Identify compact-size control tokens and the chevron icon/button style source.
2. Align chevron container height and icon size to input height for small variants.
3. Verify hover/focus states and hit target remain usable.

## Acceptance Criteria
- Chevron fits snugly within the small input field area.
- No clipping, overlap, or vertical misalignment in compact mode.

## Verification
- Add/adjust component tests for small combobox class application.
- Add Playwright visual assertion for compact combobox rows.
- CDP visual check with normal and dense form layouts.

## Status
- Completed on 2026-02-14.

## Implementation Notes
- Updated compact combobox button sizing classes so the chevron button aligns with the small input height.
- Kept interactive affordances unchanged (focus ring, hit target, dropdown behavior).

## Verification Summary
- Vitest:
  - `frontend/src/components/Utils/Combobox/ComboboxParts.test.tsx`
- Playwright:
  - `frontend/tests/e2e/chat/project-ai-combobox.spec.ts`
- CDP visual check:
  - Project AI settings combobox measured at input height `30px`, chevron button height `28px`, center delta `0px`.
