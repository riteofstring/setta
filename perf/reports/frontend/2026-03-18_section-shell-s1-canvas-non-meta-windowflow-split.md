# Phase S1 Canvas Non-Meta `sectionChrome` WindowFlow Split

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Keep the accepted window-only `windowFlow` split, then remove the remaining shared
`section-grid-*` inner shell from the non-meta canvas path without widening into
true `MetaControl`.

## Change

- Production seam:
  - `frontend/src/components/Section/Container/sectionChrome.ts`
- Focused tests:
  - `frontend/src/components/Section/Container/sectionChrome.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

Implementation:

- `getCanvasSectionChrome(...)` now routes:
  - true `MetaControl` through `surfaceLayout: "grid"`
  - every other canvas section through `surfaceLayout: "windowFlow"`
- This keeps the higher shared section-surface seam narrow:
  - no production changes were needed in `SectionContainerCoreResizabe.tsx`
  - no production changes were needed in the section header or placeholder owners

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/sectionChrome.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/components/Section/Container/SectionContainerCore.test.tsx src/components/Section/Container/SectionWindowSurface.test.tsx`
  - result: `4` files passed, `22` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/global-variables-kwargs.spec.ts frontend/tests/e2e/overview/project-ai/project-chat-bottom-dock.spec.ts`
  - result: `31` passed

Added direct coverage:

- `sectionChrome.test.ts`
  - non-meta canvas chrome now asserts `flex-col` and no `section-grid-cols`
- `SectionContainerCoreResizabe.test.tsx`
  - standard canvas shell now asserts the `windowFlow` class contract
  - root path now keeps `Incrementer` inside the same `windowFlow` shell
  - text-block meta-control style remains off the true meta-control grid path

## CDP Compare

Control page:

- untouched `main`
- URL: `http://127.0.0.1:3087/marsh_zooming`
- representative section: `GenPythonCode`

Control read:

- inner shell class still contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
- computed layout:
  - `display: grid`
  - `sectionRect: 1500 x 496`
  - `articleRect: 1500 x 406`
- editor typography:
  - `fontFamily: monospace`
  - `fontSize: 13px`
  - `lineHeight: 18.2px`

Worktree page:

- disposable worktree instance
- URL: `http://127.0.0.1:3211/working_slate`
- representative section: `GenPythonCode`

Worktree read:

- inner shell class now contains:
  - `flex`
  - `min-h-0`
  - `flex-col`
- inner shell class no longer contains:
  - `section-grid-cols`
  - `section-grid-rows`
  - `section-grid-areas`
- computed layout:
  - `display: flex`
  - `flexDirection: column`
  - `sectionRect: 500 x 187`
  - `articleRect: 500 x 165`
- editor typography:
  - `fontFamily: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`
  - `fontSize: 16px`
  - `lineHeight: 22.4px`

Scene caveat:

- the disposable worktree project carried an existing Project AI conversation pane over the canvas, so the visual check used:
  - DevTools DOM/class reads
  - computed-style reads
  - accessibility snapshot confirmation that `Generated Python Code` still resolves to the expected canvas section subtree
- the overlay did not obscure the shell contract itself, but it did make element screenshots less trustworthy than the DOM read on this exact scene

## Interpretation

- The higher shared `sectionChrome` seam is now split three ways:
  - window-only surfaces: accepted `windowFlow`
  - non-meta canvas surfaces: accepted `windowFlow`
  - true canvas `MetaControl`: still the remaining shared grid consumer
- The broader callable/dict/global-variables/placeholder canaries stayed green while this surface split moved upward.
- The next pass should not reopen the accepted non-meta canvas surfaces; it should treat true `MetaControl` as the only remaining `sectionChrome` grid consumer and decide whether that seam can still move or whether the next lower-shell target is now the meta-control single-cell contract.
