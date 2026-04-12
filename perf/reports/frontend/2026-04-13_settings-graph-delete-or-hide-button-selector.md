# Settings Graph Delete/Hide Button Selector Reduction

Date: 2026-04-13
Worktree: `pixijs-graph`
Scope: mounted section-header `DeleteOrHideButton` selector fan-out

## Change

- updated `frontend/src/components/Section/Header/DeleteOrHideButton.tsx`
  to apply `zustand/shallow` equality to the selector result
  `{ visibility, isEditingViewMode }`
- added focused profiler coverage in
  `frontend/src/components/Section/Header/DeleteOrHideButton.test.tsx`

## Why this slice

- `DeleteOrHideButton` is mounted across section headers and other section
  surfaces
- before this change the selector returned a fresh object with no equality
  function, so unrelated `useProjectState` writes could re-commit the button
  even when the active view visibility and editing mode were unchanged

## Evidence

- `pnpm -C frontend exec vitest run src/components/Section/Header/DeleteOrHideButton.test.tsx`
  passes and proves:
  - unrelated `previewSectionVariantMap` writes do not trigger a new commit
  - the button still re-renders when its own active-view visibility changes
- `pnpm -C frontend exec prettier --check src/components/Section/Header/DeleteOrHideButton.tsx src/components/Section/Header/DeleteOrHideButton.test.tsx`
  passes

## Reading

- this is another mounted section-chrome selector reduction on the live canary
  lane, not harness-only work
- the next useful frontier remains the next larger mounted section-body/chrome
  subscriber or shared write fan-out on the live worktree
