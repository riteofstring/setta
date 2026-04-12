# 2026-04-13 settings graph spreadsheet-area shallow selector

- lane: direct authenticated `/settings` canary on the live worktree
- target owner: `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx`
- local ranking:
  - checked the remaining mounted section-body and section-shell owners still using `lodash/isEqual`
  - `SpreadsheetArea` was the clearest remaining broad body-entry owner with a seven-field primitive snapshot (`filePath`, `activeSheet`, `readOnly`, `showRowNumbers`, `density`, `autoReloadOnExternalChange`, `isFrozen`)
  - narrower header/control candidates were left for later passes
- product change:
  - switched the mounted spreadsheet body selector from `lodash/isEqual` to `zustand/shallow`
  - kept the subscribed source-of-truth fields unchanged so the slice only reduces comparator cost on unrelated project-state writes
- focused coverage:
  - extended `frontend/src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - proved mounted spreadsheet bodies stay out of unrelated `previewSectionVariantMap` churn
  - proved the body still re-renders when its subscribed spreadsheet density changes
- verification:
  - `pnpm -C frontend exec vitest run src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - `pnpm -C frontend exec prettier --check src/components/Section/Layouts/SpreadsheetArea.tsx src/components/Section/Layouts/SpreadsheetArea.test.tsx`
