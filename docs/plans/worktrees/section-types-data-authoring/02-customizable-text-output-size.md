# Customizable Text Output Size

## Goal
Allow users to set text output size to their preferred scale via section config.

## Scope
- In scope: configurable size control and rendering application for text output sections.
- Out of scope: global theme typography system overhaul.

## Plan
1. Add section config option for text size scale.
2. Apply size option to text output renderer with safe min/max bounds.
3. Ensure persistence and rehydration of chosen size.

## Acceptance Criteria
- Text output size is configurable from section config.
- Size changes are visible immediately and persist.

## Verification
- Add unit tests for config persistence and renderer mapping.
- Add Playwright test for changing size and verifying output.
- CDP visual check at small/medium/large sizes.

## Delivery Notes (2026-02-14)
- Added a section-config master font size slider for text sections in `frontend/src/components/Panes/UiEditor/SectionConfig/TextBlockSettings.tsx`.
- Wired text-output rendering to apply configured typography in `frontend/src/components/App/appRegistry.tsx`.
- Added/updated tests: `frontend/src/components/Panes/UiEditor/SectionConfig/SectionDataAuthoringSettings.test.tsx`, `frontend/src/components/Section/Layouts/TextBlock.test.tsx`, and `frontend/tests/e2e/editor/section-types-data-authoring.spec.ts`.
