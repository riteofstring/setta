# Section Types Data Authoring

## Checklist Instructions
- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist
- [x] add time entry/modification uitype / time display section with different format option available. most likely a dev would code what they want displayed on it. Plan: `docs/plans/worktrees/section-types-data-authoring/01-time-entry-update-display-uitype.md`
- [x] text output in whatever size people want (should be configurable in section config pane). Plan: `docs/plans/worktrees/section-types-data-authoring/02-customizable-text-output-size.md`
- [x] should be able to alter the size of markdown and plain text font size from section config (can be simple for now, just a master control for the whole section and all the fonts -- maintaining the font size hierarchy in a markdown section). Plan: `docs/plans/worktrees/section-types-data-authoring/03-customizable-markdown-plain-text-master-font-size.md`
- [x] calendar / date picker uitype. Plan: `docs/plans/worktrees/section-types-data-authoring/04-calendar-date-selector-uitype.md`
- [x] task lists / kanban board (should be largely possible with pre-existing section types like dicts or lists). Plan: `docs/plans/worktrees/section-types-data-authoring/05-task-lists-kanban-board-view.md`
- [x] csv/xlsx should be viewable, and if possible editable some what. (use a styleable lib). Plan: `docs/plans/worktrees/section-types-data-authoring/06-csv-xlsx-view-and-basic-edit.md`
- [x] inputting strings shouldn't require quotes when function arg type is specified as a string. should be a setting in section config so that by default you do not need to wrap quotes around a string if the arg's type is string. Plan: `docs/plans/worktrees/section-types-data-authoring/07-string-args-without-quotes-option.md`
- [x] lists and groups need ways to config child default section types (dropdown, maybe via an icon button). Plan: `docs/plans/worktrees/section-types-data-authoring/08-list-group-child-default-section-kinds.md`
