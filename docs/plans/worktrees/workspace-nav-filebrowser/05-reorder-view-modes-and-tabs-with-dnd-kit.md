# Reorder View Modes and Tabs with DnD Kit

## Goal
Enable drag-and-drop reordering for view modes and view tabs.

## Scope
- In scope: DnD interactions, reorder state persistence, and keyboard-accessible fallback behavior.
- Out of scope: redesigning tab/view mode visuals.

## Plan
1. Integrate DnD Kit with both view-mode and view-tab list surfaces.
2. Implement reorder handlers that update and persist ordering state.
3. Add clear drag affordances and keyboard-compatible reorder interactions.
4. Guard against performance regressions for large tab/view-mode counts.

## Acceptance Criteria
- Users can reorder view modes and tabs via drag-and-drop.
- Reordered state persists correctly and remains stable after reload where applicable.

## Verification
- Add unit tests for reorder reducer/store logic.
- Add Playwright tests for drag operations and persisted ordering.
- CDP perf check for reorder responsiveness on large lists.
