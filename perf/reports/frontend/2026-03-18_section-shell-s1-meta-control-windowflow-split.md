# Phase S1 MetaControl `sectionChrome` WindowFlow Split

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the last live `section-grid-*` consumer from the higher shared
`sectionChrome` seam by moving true canvas `MetaControl` onto the same
`windowFlow` surface contract already accepted for window-only and non-meta
canvas surfaces.

## Change

- Production seam:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
- Focused tests:
  - `frontend/src/components/Section/Container/sectionChrome.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

Implementation:

- `getCanvasSectionChrome(...)` no longer keeps a grid-only override for true
  `MetaControl`.
- The true-meta path now returns the same higher-shell contract as the accepted
  non-meta canvas path:
  - `surfaceLayout: "windowFlow"`
  - `flex min-h-0 flex-col`
  - no `section-grid-cols`
  - no `section-grid-rows`
  - no `section-grid-areas`
  - no `grid-cols-1 grid-rows-1`
- The MetaControl-specific differences that remain at this seam are still only:
  - transparent frame styling
  - higher hover z-index
  - outboard drag/menu affordances

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: `2` files passed, `14` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts --grep "meta control time defaults to display and can switch to input mode|meta control calendar renders calendar UI|meta control slider only shows width resize handle"`
  - result: `3` passed

Added direct coverage:

- `sectionChrome.test.ts`
  - true canvas `MetaControl` now asserts `flex-col` and no shared grid classes
- `SectionContainerCoreResizabe.test.tsx`
  - true MetaControl canvas shell now asserts the `windowFlow` contract through
    the real container seam

## CDP Compare

Control page:

- untouched `main`
- URL: `http://127.0.0.1:3087/deep_flowing`
- representative section: disposable MetaControl slider

Control read:

- inner shell class still contains:
  - `grid`
  - `grid-cols-1`
  - `grid-rows-1`
- computed layout:
  - `display: grid`
  - viewport scale: `1`
  - node bounds: `202 x 34`
  - surface bounds: `200 x 32`
  - outboard menu trigger bounds: `22 x 22`
  - right resize handle present
  - bottom resize handle absent

Worktree page:

- disposable worktree instance
- URL: `http://127.0.0.1:3011/young_huge`
- representative section: disposable MetaControl slider

Worktree read:

- inner shell class now contains:
  - `flex`
  - `min-h-0`
  - `flex-col`
- inner shell class no longer contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
  - `grid-cols-1`
  - `grid-rows-1`
- computed layout:
  - `display: flex`
  - `flexDirection: column`
  - viewport scale: `0.772755`
  - raw node bounds: `156.10 x 26.27`
  - raw surface bounds: `154.55 x 24.73`
  - raw outboard menu trigger bounds: `17.00 x 17.00`
  - right resize handle present
  - bottom resize handle absent

Normalized compare:

- dividing the worktree bounds by the worktree viewport scale resolves the same
  visible shell geometry as untouched `main`:
  - node: `202 x 34`
  - surface: `200 x 32`
  - outboard menu trigger: `22 x 22`

## Visual check

- The worktree MetaControl screenshot kept the expected compact slider body,
  outboard menu button, and width-only resize affordance after the surface-layer
  grid removal.
- The untouched-`main` compare relied on DOM/class/computed-style inspection
  plus the accessibility snapshot because the two disposable pages were running
  at different viewport scales and did not land on perfectly matched canvas
  framing without additional scene setup.

## Interpretation

- The higher shared `sectionChrome` seam is now exhausted in the active branch:
  - window-only surfaces: accepted `windowFlow`
  - non-meta canvas surfaces: accepted `windowFlow`
  - true canvas `MetaControl`: accepted `windowFlow`
- The remaining lower seam for this section family is the MetaControl-specific
  `single-cell-container` / `single-cell-child` contract inside
  `MetaControlNode.tsx` and related input wrappers.
- The next pass should stay off `sectionChrome` and move into that lower
  MetaControl shell instead.
