# Task Lists / Kanban Board View

## Goal
Support task list and kanban board workflows using existing section primitives where possible.

## Scope
- In scope: board/list representation, item status transitions, minimal kanban interactions.
- Out of scope: full project management feature expansion.

## Plan
1. Model task/column data atop existing dict/list section capabilities.
2. Build board and list presentation modes with shared state.
3. Implement core actions (create task, move column/state, reorder where needed).
4. Keep render/update paths efficient for large task sets.

## Acceptance Criteria
- Users can manage tasks as list and kanban views.
- Core create/move/update interactions work reliably.

## Verification
- Add unit tests for task state transitions.
- Add Playwright scenarios for task creation and column moves.
- CDP perf check on large boards and repeated updates.
