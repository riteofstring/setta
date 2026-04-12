## Summary

- Replaced the top-level `MetaControlArea` mounted section-body selector
  equality from `lodash/isEqual` to `zustand/shallow`.
- Added focused profiler coverage proving unrelated
  `previewSectionVariantMap` writes do not re-commit a mounted
  `MetaControlArea`, while a real `showSectionTitle` change still does.

## Why this slice

- This iteration started with the handoff requirement to re-rank the remaining
  mounted section-body/chrome subscribers before taking another small selector
  cleanup.
- Local ranking of the remaining broad mounted section-body entry points found
  `MetaControlArea` still subscribing to a two-field object
  (`controlParamId`, `showSectionTitle`) behind generic deep equality at the
  body switch boundary inside `SectionContainerCoreResizabe`.
- Other still-visible `lodash/isEqual` sites on this path were either already
  narrowed in recent passes, more type-specific (`StateMachineNodeArea`), or
  farther inside the body tree. `MetaControlArea` was the clearest remaining
  section-body entry slice that could be completed and verified within one
  iteration.

## Files

- `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- `frontend/src/components/Section/Layouts/MetaControlArea.test.tsx`

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/MetaControlArea.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/MetaControlArea.tsx src/components/Section/Layouts/MetaControlArea.test.tsx`
- headless CDP smoke on `http://127.0.0.1:3075/settings`

