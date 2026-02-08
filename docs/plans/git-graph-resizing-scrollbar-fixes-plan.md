# Git Graph Resizing + Scrollbar Regression Fix Plan

## Summary

This plan fixes two UX regressions in the Git Graph history pane:

1. A horizontal scrollbar appears in the commit history area even when there is sufficient width.
2. Column resize affordances are confusing/incomplete:
   - No visible divider between `Message` and `Author`.
   - For non-`Graph` columns, dragging changes width but the visible divider does not move.

The intent is to make separators behave like true column boundaries while removing horizontal overflow from the commit list.

## Current Symptoms

1. Commit list horizontal scrollbar is always/mostly visible.
2. Only the `Graph | Message` divider feels correct.
3. `Author`, `Date`, and `Hash` resizing changes widths but divider position appears static.

## Likely Root Causes (from current implementation)

1. **Grid overflow from an extra grid item in commit rows**
   - The row button uses a 5-column grid but also renders an extra `sr-only` element, creating an implicit 6th column.
   - This can force overflow and produce persistent horizontal scroll.

2. **Resize handle placement is on the wrong edge for flexible-grid behavior**
   - `Author`, `Date`, and `Hash` handles are currently rendered on each column’s right edge.
   - Because `Message` is `1fr`, resizing these fixed columns often compensates by shrinking/growing `Message`, so those right-edge boundaries can remain visually stationary.

3. **Missing `Message | Author` boundary handle**
   - There is no handle anchored at the boundary the user expects between `Message` and `Author`.

4. **Handle hit areas can extend beyond bounds**
   - Negative offsets on handle elements can contribute to tiny overflow artifacts depending on container/layout.

## Goals

1. No horizontal scrollbar in the commit history list under normal viewing.
2. Visible and intuitive column boundaries:
   - `Graph | Message`
   - `Message | Author`
   - `Author | Date`
   - `Date | Hash`
3. Dragging a divider should move that divider on screen.
4. Keep persisted widths and min/max guardrails intact.
5. Preserve virtualization/performance behavior.

## Non-Goals

1. Changing data model or backend APIs.
2. Redesigning the full Git Graph UI structure.
3. Adding entirely new resize keyboard interactions (optional follow-up).

## UX Behavior Spec

1. Four visible vertical separators in the header.
2. Divider behavior:
   - `Graph | Message` drag right => `Graph` wider.
   - `Message | Author` drag right => `Author` narrower (boundary moves right).
   - `Author | Date` drag right => `Date` narrower.
   - `Date | Hash` drag right => `Hash` narrower.
3. Double-clicking a divider resets the corresponding fixed column width to default.
4. Divider visual line should track pointer movement for all resizers.

## Implementation Plan

### 1. Remove overflow-producing row structure

File:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Remove the extra `sr-only` grid child from commit rows.
2. Preserve accessibility by moving lane count into `aria-label` on the row button (or equivalent non-layout-affecting metadata).
3. Keep row/header grid column count strictly aligned with the template.

### 2. Re-anchor resize handles to actual moving boundaries

File:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Introduce explicit boundary handles at:
   - right edge of `Graph`
   - left edge of `Author`
   - left edge of `Date`
   - left edge of `Hash`
2. Update `ColumnResizeHandle` to support `edge="left" | "right"` (or equivalent) without overflowing container bounds.
3. Ensure handle line/hitbox stays inside header box (`overflow-hidden` safe).

### 3. Update drag math so divider movement matches visible boundary

File:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Keep CSS-variable + `requestAnimationFrame` strategy.
2. For left-edge handles (`Author`, `Date`, `Hash`), invert delta sign when applying width:
   - `nextWidth = startWidth - deltaX`
3. Retain existing clamp rules and fit-to-container checks.
4. Persist final widths only on pointer up.

### 4. Harden overflow constraints on commit list containers

Files:

- `frontend/src/components/Git/GitGraphOverlay.tsx`

Changes:

1. Ensure commit list wrapper remains `min-w-0` and `overflow-x-hidden`.
2. Keep per-row content truncation on path/message cells.
3. Avoid any handle element extending beyond pane width.

### 5. Playwright regression coverage

File:

- `frontend/tests/e2e/git/git-diff-and-graph-overlay.spec.ts`

Add/update tests:

1. Assert no horizontal overflow for commit history list container:
   - `scrollWidth <= clientWidth + tolerance`.
2. Assert presence of expected boundary handles (`Graph|Message`, `Message|Author`, `Author|Date`, `Date|Hash`).
3. For each non-graph divider, drag and assert divider x-position changes (not only width values).
4. Keep existing width-change assertions for author/date/hash behavior.

## Verification Plan

1. Automated:
   - `./scripts/run-playwright-e2e.sh tests/e2e/git/git-diff-and-graph-overlay.spec.ts`
2. Manual/CDP (required visual gate):
   - Open Git Graph overlay.
   - Confirm no horizontal scrollbar in commit history pane.
   - Drag each divider and confirm the line itself moves.
   - Confirm expanded rows still render lane continuity gutter correctly.

## Risks and Mitigations

1. **Risk:** Delta inversion introduces unintuitive direction on one handle.
   - **Mitigation:** Validate each boundary against behavior spec and adjust sign per handle.
2. **Risk:** Removing the `sr-only` element changes accessible name expectations in tests.
   - **Mitigation:** Update `aria-label` intentionally and update E2E locator expectations where needed.
3. **Risk:** Small layout shifts break previous snapshot assumptions.
   - **Mitigation:** Prefer semantic/data-testid selectors and geometry assertions over brittle text snapshots.

## Done Criteria

1. Commit history pane no longer shows persistent horizontal scrollbar.
2. `Message | Author` divider exists and is draggable.
3. Non-graph divider drags visibly move the divider.
4. All targeted Playwright tests pass.
5. CDP visual verification is completed and documented in final task response.
