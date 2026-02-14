# Reduce Pane Clutter And Add Accordion Hierarchy

## Goal
Improve visual hierarchy by reducing border noise and collapsing secondary options into accordions where appropriate.

## Scope
- In scope: pane section grouping, border and spacing rules, accordion conversion for advanced sections.
- Out of scope: introducing new data models or changing feature behavior.

## Plan
1. Inventory pane sections and classify primary vs secondary controls.
2. Simplify visual chrome (fewer repeated borders, clearer spacing and type hierarchy).
3. Convert suitable secondary sections to accordion groups consistent with skills browser patterns.
4. Ensure keyboard/accessibility behavior remains correct for expanded/collapsed content.

## Acceptance Criteria
- Panes show clearer primary actions and less visual clutter.
- Secondary controls are accessible through predictable accordions.

## Verification
- Update/add component tests for accordion open/close and focus behavior.
- Add Playwright assertion for collapsed defaults and expand interactions.
- CDP visual check comparing before/after pane density and hierarchy.

## Status
- Completed on 2026-02-14.

## Implementation Notes
- Replaced flat Section Config blocks with a two-tier accordion hierarchy (`Section Settings`, `Appearance`) and predictable trigger test IDs.
- Reduced appearance-panel chrome so color/tag controls remain readable with less repeated border noise.
- Kept behavior parity by preserving all prior controls under the new accordion grouping.

## Verification Summary
- Vitest:
  - `frontend/src/components/Panes/UiEditor/SectionConfig/SectionConfigAccordion.test.tsx`
- Playwright:
  - `frontend/tests/e2e/editor/section-config-accordion-hierarchy.spec.ts`
- CDP visual check:
  - Confirmed `SECTION SETTINGS` renders expanded by default and `APPEARANCE` collapsed.
