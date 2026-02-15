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

## 2026-02-17 10:10:48 PST

- Fixed keyboard propagation regressions in Home list rows and Overview Project Config edit rows by scoping row key handlers to direct-target events and stopping nested action-button keydown bubbling.
- Restored accessible Home project-card keyboard open behavior by supporting both `Enter` and `Space` on the thumbnail focus surface while preserving single-click select and double-click open.
- Reduced default Home file-browser overhead by making Setta initialization badges opt-in via a new UI toggle and forcing a root refresh only when the toggle state changes.
- Removed duplicate frontend ID dedupe implementations by introducing a shared `dedupeStringIds` utility and reusing it in local-storage ordering and project-config merge logic.
- Removed stale worktree helper surface (`get_dev_worktree_name`) and deleted its dedicated test.
- Simplified backend sort-order validation by removing redundant post-loop set-equivalence checks while keeping length, membership, and duplicate guards intact.
- Added/updated Vitest, pytest, and Playwright coverage for dedupe utility behavior, file-browser default badge payload behavior, sort-order duplicate rejection, Home keyboard interactions, and project-config delete-button keyboard bubbling.
- Added an append-only perf report documenting before/after Home file-browser request behavior for `includeSettaInitialized`.

## 2026-02-17 11:00:08 PST

- Removed unused backend init-status payload surface by dropping `worktreeOptionDetails` and deriving `worktreeName` directly from repo root to avoid per-poll `git worktree list` subprocess work.
- Fixed Home list-view keyboard parity so `Enter` opens the active project while `Space` keeps selection behavior.
- Optimized Home project partitioning to a single-pass favorite/non-favorite split and removed temporary concat-based counting.
- Fixed Home file-browser Setta badge toggle behavior to refresh loaded folders in place without resetting `selectedPath` or collapsing expanded folders.
- Removed legacy Overview `ProjectConfigs` compatibility remap and standardized View Modes initial-pane routing to current behavior only.
- Removed duplicate Save/Load modal close transitions by keeping one close path.
- Updated backend pytest, frontend Vitest, and Playwright coverage for init-status/worktree behavior, Home keyboard interactions, Home badge-toggle state retention, and new partition logic.
- Added a new append-only frontend perf report for Home project partitioning (`single-pass` vs legacy filtering).
