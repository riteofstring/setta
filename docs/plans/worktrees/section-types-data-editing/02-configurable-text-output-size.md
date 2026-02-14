# Configurable Text Output Size

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
