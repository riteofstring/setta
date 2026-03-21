# Phase S1 WindowFlow Shell Compare

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Keep the accepted `sectionChrome` `windowFlow` split in place while restoring
pixel-perfect section-shell sizing against untouched `main`, and remove the
gesture-time shell compositor styles that were causing visibly low-resolution
pan/zoom motion on the worktree.

## Change

- Production seams:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
  - `frontend/index.css`
  - `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCore.tsx`
- Focused tests:
  - `frontend/src/components/Section/Container/SectionContainerCore.test.tsx`
  - `frontend/tests/e2e/sections/section-sizing.spec.ts`

Implementation:

- `windowFlow` surfaces now carry a shared `section-windowflow-shell` class in
  `sectionChrome.ts`.
- `frontend/index.css` recreates the old title/body sizing contract for the
  surviving section area classes with flex rules instead of grid:
  - `.section-title`
  - `.section-search`
  - `.section-args`
  - `.section-main`
  - `.section-full-no-title`
  - shared row/body variants used by the existing section layouts
- `SectionHeader.tsx` now keeps the header on a stable `22px` minimum height and
  keeps the inline title input stretched to the existing header width while
  editing.
- `MetaControlArea.tsx` now keeps the lower meta-control fill path on the same
  `min-h-0` / `flex-1` contract as the repaired windowFlow shell.
- `SectionContainerCore.tsx` no longer injects gesture-scoped shell compositor
  promotion:
  - no `willChange: transform`
  - no `translateZ(0)`
  - no `backfaceVisibility: hidden`
  - no `isolation: isolate`

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionContainerCore.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx src/components/Section/Header/SectionHeader.test.tsx src/components/ChatWindowing/ProjectChatWindowSurface.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `7` files passed, `46` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/section-sizing.spec.ts frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts frontend/tests/e2e/params/callable-minimum-regression.spec.ts frontend/tests/e2e/chat/standalone-project-surface-routes.spec.ts --grep "meta control|title editing keeps section width and header height stable|workspace and standalone callable routes preserve reorder and tab indent behavior|standalone section routes stay bound to their section thread and keep workspace project chat isolated"`
  - result: `7` passed

Added direct coverage:

- `SectionContainerCore.test.tsx`
  - proves active viewport motion no longer adds the gesture-time compositor
    styles to the section shell
- `section-sizing.spec.ts`
  - proves a `Code` section keeps stable section width and header height while
    the title is being edited inline

## CDP Compare

Control page:

- untouched `main`
- URL: `http://127.0.0.1:3087/deep_flowing`
- representative section: `GenPythonCode`

Control read:

- inner shell class still contains the shared grid shell:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
  - `grid`
- computed layout:
  - viewport scale: `1`
  - section bounds: `502 x 167.3672`
  - header bounds: `484 x 22`
  - article bounds: `500 x 135.3672`

Worktree page:

- disposable worktree instance
- URL: `http://127.0.0.1:3011/young_huge`
- representative section: `GenPythonCode`

Worktree read:

- inner shell class now keeps the flex shell without reintroducing grid:
  - `flex`
  - `min-h-0`
  - `flex-col`
- computed layout:
  - viewport scale: `0.772755`
  - raw section bounds: `387.9228 x 105.8674`
  - raw header bounds: `374.0132 x 17.0006`
  - raw article bounds: `386.3773 x 81.1393`

Normalized compare:

- dividing the worktree geometry by the worktree viewport scale resolves the
  same visible shell contract as untouched `main`:
  - section width: `502`
  - header width: `484`
  - article width: `500`
  - header height: `22`

Viewport-motion style check:

- the live worktree `GenPythonCode` section shell now reads:
  - `willChange: ""`
  - `transform: ""`
  - `backfaceVisibility: ""`
  - `isolation: ""`

## Visual Check

- The worktree `GenPythonCode` shell now keeps the same visible header/body
  proportions as untouched `main` after the grid removal.
- Inline title editing no longer makes the section width jump while the input is
  mounted.
- The blur-causing compositor styles are gone from the live shell during normal
  canvas interaction.

## Interpretation

- Keep the higher shared `sectionChrome` seam closed on `windowFlow`; the fix is
  to preserve the old shell contract with flex, not to reopen grid.
- The user-reported resize artifacts, minimum-size drift, title-edit width jump,
  and header-height drift all trace back to the missing shared windowFlow shell
  contract, and that contract is now restored with the surviving area classes.
- The jarring low-resolution pan/zoom motion was coupled to the gesture-scoped
  shell compositor promotion in `SectionContainerCore.tsx`, and that promotion
  is no longer active on this branch.
- The next live structural seam remains the lower MetaControl
  `single-cell-container` / `single-cell-child` contract.
