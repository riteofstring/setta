## 2026-02-17 09:04:23 PST

- Fixed Overview rail regression by restoring stable tab `data-testid` hooks, restoring chat-first ordering, and restoring `overview-tab-content-shell` for overflow/inset checks.
- Fixed project-config reorder UX defects by persisting order in local storage (`overviewProjectConfigOrder`) and preventing drag-handle clicks from triggering navigation.
- Fixed Home selected-project section count to use object keys and reduced per-item favorite subscriptions by passing favorite state from parent sections.
- Removed redundant view-mode ordering utility code and consolidated `ViewModeTabs` sorting to a single pass.
- Hardened backend init status response by removing exposed worktree paths, removing duplicate `worktreeOptions`, and eliminating duplicate git worktree-list calls per snapshot.
- Added/updated coverage across backend pytest, frontend Vitest, and Playwright overview E2E flows for rail order, pane overflow, view-mode/project-config reordering, and drag-handle behavior.

## 2026-02-17 09:41:34 PST

- Fixed Home initial-load width clamping so persisted left/right panel widths are only clamped after desktop width is measured, preventing silent layout collapse on reload.
- Fixed Project Config ordering robustness by deduping persisted IDs, sanitizing writes to `overviewProjectConfigOrder`, and fully gating reorder/drag behavior behind `canEditProjectConfigs`.
- Restored drag affordance clarity for tabbed view modes by rendering the visible handle glyph and adding explicit drag handle accessibility labels.
- Removed low-value branching and selector cost by dropping deep `_.isEqual` subscription in file-menu metadata hook and removing obsolete array fallback in project-config preview rendering.
- Updated stale perf-report assertion text to match current automated perf coverage.
- Added/updated Vitest and Playwright coverage for Home width persistence, read-only reorder lock, duplicate-order sanitization, tab handle affordance visibility, file-menu selector behavior, and project-config preview rendering.
