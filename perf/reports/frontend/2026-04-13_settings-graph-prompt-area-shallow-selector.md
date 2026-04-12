# Settings Graph Prompt Area Shallow Selector

Date: 2026-04-13
Worktree: `pixijs-graph`

## Summary

- Replaced the mounted `PromptArea` project-state selector equality from
  `lodash/isEqual` to `zustand/shallow`.
- Scope of the selector stayed the same:
  - `projectConfigId`
  - `promptTemplateId`
  - `template`
  - `format`
  - `isFrozen`
  - `renderedText`
  - `renderError`
- `PromptArea` is a mounted section-body owner on the settings surface, so the
  change removes generic deep-equality work from a broad body subscription
  without changing which prompt-section fields it observes.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/PromptArea.test.tsx`
  - passed (`1` file, `6` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/PromptArea.tsx src/components/Section/Layouts/PromptArea.test.tsx`
  - passed
- fresh-context headless CDP smoke on `http://127.0.0.1:3075/settings`
  - passed
  - the page advanced from the loading shell to populated Settings chrome with
    visible overview/settings content and section tabs instead of a blank root

## Notes

- Added profiler coverage proving unrelated `previewSectionVariantMap` writes
  do not re-commit a mounted `PromptArea` while a real prompt template text
  change still updates the editor value.
