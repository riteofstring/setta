# section-types-data-editing

## Checklist Instructions
- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist
- [ ] add time entry/modification uitype / time display section with different format option available. most likely a dev would code what they want displayed on it. Plan: `docs/plans/worktrees/section-types-data-editing/01-time-entry-modification-display-uitype.md`
- [ ] text output in whatever size people want (should be configurable in section config pane). Plan: `docs/plans/worktrees/section-types-data-editing/02-configurable-text-output-size.md`
- [ ] should be able to alter the size of markdown and plain text font size from section config (can be simple for now, just a master control for the whole section and all the fonts -- maintaining the font size hierarchy in a markdown section). Plan: `docs/plans/worktrees/section-types-data-editing/03-configurable-markdown-plain-text-master-font-size.md`
- [ ] calendar / date picker uitype. Plan: `docs/plans/worktrees/section-types-data-editing/04-calendar-date-picker-uitype.md`
- [ ] task lists / kanban board (should be largely possible with pre-existing section types like dicts or lists). Plan: `docs/plans/worktrees/section-types-data-editing/05-task-lists-kanban-board-section.md`
- [ ] csv/xlsx should be viewable, and if possible editable some what. (use a styleable lib). Plan: `docs/plans/worktrees/section-types-data-editing/06-csv-xlsx-view-and-light-edit.md`
- [ ] inputting strings shouldn't require quotes when function arg type is specified as a string. should be a setting in section config so that by default you do not need to wrap quotes around a string if the arg's type is string. Plan: `docs/plans/worktrees/section-types-data-editing/07-string-args-without-quotes-setting.md`
- [ ] lists and groups need ways to config child default section types (dropdown, maybe via an icon button). Plan: `docs/plans/worktrees/section-types-data-editing/08-list-group-child-default-section-types.md`
