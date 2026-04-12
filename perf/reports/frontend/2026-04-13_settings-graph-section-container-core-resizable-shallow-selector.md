# Settings Graph SectionContainerCoreResizable Shallow Selector

Date: 2026-04-13
Worktree: `pixijs-graph`

## Summary

- Replaced the mounted `SectionContainerCoreResizable` store selector equality
  from `lodash/isEqual` to `zustand/shallow`.
- Scope of the selector stayed the same:
  - `isMinimized`
  - `isYouTube`
  - `textBlockMetaControlStyle`
  - `hasEmbeddedTerminal`
- This component wraps each mounted section body shell, so the change removes a
  deep-equality cost from a broad container-level subscription without changing
  which project-state fields it observes.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed (`2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.subscription.test.tsx`
  - passed

## Notes

- Added profiler coverage proving unrelated `previewSectionVariantMap` writes do
  not re-commit the mounted container shell while subscribed changes to
  `isMinimized` still re-render and hide the body area.
