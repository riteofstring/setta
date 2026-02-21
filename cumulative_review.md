## 2026-02-19 09:21:37 PST

- Implemented Home layout regression fixes:
  - Added compact-layout fallback for narrow screens so side panes do not compress the primary gallery surface.
  - Hid Home settings rail link in deployment/read-only mode.
  - Prevented Home path blur from resetting file-browser state when the path value is unchanged.
- Implemented FileBrowser initialization-cost fixes:
  - `includeSettaInitializedFolders` now controls whether initialized metadata is requested.
  - Root workspace initialization checks now run only when initialized metadata is enabled and the active folder is the root.
- Removed obsolete local-storage keys for legacy Home column widths and dropped them from merge output.
- Regenerated endpoint/type contracts so frontend/backend API typing stays aligned (`pnpm generate`), then removed cast-based request escape hatches.
- Added/updated verification coverage:
  - Vitest unit tests for Home helper logic and FileBrowser initialization gating.
  - Vitest local-storage merge test for deprecated key removal.
  - Playwright Home e2e tests for compact layout behavior, deployment-mode settings visibility, and no-op path-blur behavior.
- Validation status:
  - Targeted Vitest suite: passed.
  - Backend file-browser pytest suite: passed.
  - Home Playwright suite: passed.
  - CDP visual verification: completed for desktop and narrow/mobile Home states.
