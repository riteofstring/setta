# Customizable Markdown/Plain Text Master Font Size

## Goal
Provide a single master font-size control for markdown/plain text sections while preserving relative hierarchy.

## Scope
- In scope: section-level master size control, markdown scale mapping (h1/h2/body/etc).
- Out of scope: per-element manual typography editing.

## Plan
1. Add master font-size setting in section config for markdown/plain text sections.
2. Map master size to derived typography scale that preserves hierarchy ratios.
3. Update markdown/plain renderers to consume mapped scale.

## Acceptance Criteria
- One config control adjusts entire section typography scale.
- Heading/body hierarchy remains intact after scaling.

## Verification
- Add unit tests for scale mapping logic.
- Add Playwright test for markdown section resizing behavior.
- CDP visual check on mixed heading/body markdown content.
