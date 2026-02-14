# Fix Pane Content Overflow

## Goal
Prevent pane content from bleeding outside the right edge and keep all pane layouts clipped and scroll-safe.

## Scope
- In scope: pane body containers, overflow CSS, width constraints, and responsive breakpoints.
- Out of scope: redesigning pane information hierarchy.

## Plan
1. Audit pane wrappers and identify where width/overflow constraints are missing.
2. Normalize pane shell CSS (`min-width`, `max-width`, `overflow-x`, and content flex behavior).
3. Add targeted fixes for known offenders (tables, code blocks, long labels, inline controls).
4. Validate desktop and narrow widths to ensure no horizontal bleed.

## Acceptance Criteria
- No pane content visually bleeds outside pane boundaries.
- Horizontal scrolling appears only where intentionally allowed.

## Verification
- Run relevant frontend tests for pane components.
- Run/extend Playwright coverage for pane overflow regressions.
- CDP visual check for pane-heavy views at multiple viewport sizes.
