# TaskBoard Area Surface Owners

- Date: `2026-03-16`
- Slice: extracted task-board model, toolbar, task-list view, and kanban view
  owners out of `frontend/src/components/Section/Layouts/TaskBoardArea.tsx`
- CDP page: `http://127.0.0.1:3002/knowing_tight`
- Scenario: one Task Board section with two tasks (`ship task board`,
  `schedule followup`) measured in task-list mode, then checked again in
  kanban mode

## Before

- Task list metrics:
  - `listRows: 2`
  - `headerPresent: true`
  - `dragBeforeCheckbox: true`
  - `checkboxBeforeTitle: true`
  - `dragInset: 0.3`
  - `gapAfterCheckbox: 2.2`
  - `totalNodes: 783`
- Kanban checks:
  - `3` lanes
  - `2` task cards in the first lane
  - `2` resize handles

## After

- Task list metrics:
  - `listRows: 2`
  - `headerPresent: true`
  - `dragBeforeCheckbox: true`
  - `checkboxBeforeTitle: true`
  - `dragInset: 0.3`
  - `gapAfterCheckbox: 0.6`
  - `totalNodes: 774`
- Kanban checks:
  - `laneCount: 3`
  - `cardCount: 2`
  - `resizeHandleCount: 2`
  - `firstLaneStyleWidth: 240px`
  - `horizontalOverflow: false`
  - `totalNodes: 795`

## Notes

- Task-list DOM nodes dropped by `9` while the header and row control ordering
  stayed intact.
- The checkbox-to-title gap tightened slightly in live metrics, but the task
  row shell still kept drag handle -> checkbox -> title ordering and the
  Playwright layout assertions continued to pass.
- Kanban lane count, card count, resize handles, and default lane width stayed
  stable after the extraction.
