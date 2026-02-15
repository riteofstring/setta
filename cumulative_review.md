## 2026-02-17 09:04:23 PST

- Fixed Overview rail regression by restoring stable tab `data-testid` hooks, restoring chat-first ordering, and restoring `overview-tab-content-shell` for overflow/inset checks.
- Fixed project-config reorder UX defects by persisting order in local storage (`overviewProjectConfigOrder`) and preventing drag-handle clicks from triggering navigation.
- Fixed Home selected-project section count to use object keys and reduced per-item favorite subscriptions by passing favorite state from parent sections.
- Removed redundant view-mode ordering utility code and consolidated `ViewModeTabs` sorting to a single pass.
- Hardened backend init status response by removing exposed worktree paths, removing duplicate `worktreeOptions`, and eliminating duplicate git worktree-list calls per snapshot.
- Added/updated coverage across backend pytest, frontend Vitest, and Playwright overview E2E flows for rail order, pane overflow, view-mode/project-config reordering, and drag-handle behavior.

