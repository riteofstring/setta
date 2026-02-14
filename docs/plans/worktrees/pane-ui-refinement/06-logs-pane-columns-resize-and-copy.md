# Logs Pane Columns, Resize Handles, And Copy

## Goal
Upgrade logs pane UX with a column title bar, resizable columns, and per-log copy action.

## Scope
- In scope: logs table/header structure, column resizing UX, copy message interaction.
- Out of scope: changing backend log schema.

## Plan
1. Introduce a visible column header row with stable column labels.
2. Implement column resize handles with bounded widths and persisted state if applicable.
3. Add copy button/action for each log message row with clear feedback.
4. Ensure performance remains acceptable for large log lists.

## Acceptance Criteria
- Logs pane shows clear column headers.
- Columns can be resized without layout breakage.
- Users can copy log message text from each row.

## Verification
- Add unit tests for resize state and copy action behavior.
- Add Playwright coverage for drag-resize and copy action.
- CDP visual and interaction check on long log datasets.
