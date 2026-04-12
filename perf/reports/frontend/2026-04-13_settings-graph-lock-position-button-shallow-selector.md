# Settings graph lock position button shallow selector

Date: 2026-04-13
Worktree: `setta.pixijs-graph`
Scope: mounted section-header lock-position subscription on the live settings canary lane

## Change

- switched `frontend/src/components/Section/Header/LockPositionButton.tsx`
  from `lodash/isEqual` to `zustand/shallow` for the composite selector that
  derives `isGroup` and `positionAndSizeLocked`
- added `frontend/src/components/Section/Header/LockPositionButton.test.tsx`
  to prove unrelated `previewSectionVariantMap` writes do not re-commit a
  mounted lock button while a real lock-state change still does

## Why this slice

- `LockPositionButton` is mounted in section header chrome on the settings
  canary, so every unrelated project-state write was still paying a lodash deep
  comparison on a tiny two-field selector
- this keeps the existing source-of-truth fields and behavior intact while
  reducing equality overhead on a hot mounted header-control path

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Header/LockPositionButton.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Header/LockPositionButton.tsx src/components/Section/Header/LockPositionButton.test.tsx`
- headless Chrome DevTools MCP smoke on `http://127.0.0.1:3075/settings`
  confirming the settings surface still hydrates with visible section cards and
  header chrome after the selector change
