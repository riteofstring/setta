# Reorder View Modes And Tabs With DnD Kit

## Goal
Enable drag-and-drop reordering for view modes and view tabs.

## Scope
- In scope: DnD interactions, reorder state persistence, keyboard-accessible reordering fallback.
- Out of scope: redesigning tab/view mode visuals.

## Plan
1. Add DnD kit integration for view mode and tab lists.
2. Implement reorder handlers and update persistent order state.
3. Add drag handles/affordances and keyboard-friendly reorder behavior.
4. Optimize for large tab counts to avoid expensive re-renders.

## Acceptance Criteria
- Users can reorder view modes and tabs via drag-and-drop.
- Order persists correctly and remains stable after reload where applicable.

## Verification
- Add unit tests for reorder reducer/store logic.
- Add Playwright tests for drag operations and persisted ordering.
- CDP perf check for reorder responsiveness on large lists.
