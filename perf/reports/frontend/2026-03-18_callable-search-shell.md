# Phase S2 Callable Search Shell Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the remaining `single-cell-container` / `single-cell-child` overlay
contract from the callable `SectionSearch` shell without reopening the
accepted shared color-picker seam or the higher `sectionChrome` baseline.

## Change

- Production seam:
  - `frontend/src/components/Section/SectionParts/Search.tsx`
- Focused tests:
  - `frontend/tests/e2e/sections/callable-search-shell.spec.ts`
  - `frontend/tests/e2e/sections/agentic-edge-callable-handle-alignment.spec.ts`
  - `frontend/tests/e2e/sections/agentic-edge-listroot-child-handles.spec.ts`
  - `frontend/tests/e2e/sections/minimized-callable-edge-handles.spec.ts`
  - `frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
  - `frontend/src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`

Implementation:

- The outer callable search row now uses:
  - `section-search relative flex w-full min-w-0 items-stretch`
  - no outer `single-cell-container`
- The dummy and real editor roots now use:
  - `min-w-0 flex-1 self-stretch`
  - no `single-cell-child`
- The right-side ready/error indicator wrapper now uses an absolute inset-right
  flex shell instead of the old overlaid `single-cell-child` helper.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Utils/CodeMirror/TextInputCodeMirror.test.ts`
  - result: `1` file passed, `5` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/callable-search-shell.spec.ts frontend/tests/e2e/sections/agentic-edge-callable-handle-alignment.spec.ts frontend/tests/e2e/sections/agentic-edge-listroot-child-handles.spec.ts frontend/tests/e2e/sections/minimized-callable-edge-handles.spec.ts frontend/tests/e2e/params/callable-phase0-baseline.spec.ts`
  - result: `6` passed

Added direct coverage:

- `callable-search-shell.spec.ts`
  - the callable search shell no longer exposes `single-cell-container`
  - the dummy and real editor roots no longer expose `single-cell-child`
  - the right-side ready/error indicator wrapper stays off the old single-cell
    helpers after activation
- The existing callable/search guardrails stayed green on the accepted shell:
  - handle alignment
  - minimized handle placement
  - list-root child handles
  - callable phase-0 geometry
  - text-input CodeMirror lifecycle

## CDP Compare

Control tab:

- untouched `main`
- existing DevTools tab restored to `http://127.0.0.1:3087/sleet_taking`
- disposable compare project `tall_grove` was created from that existing tab
  and removed after the read

Control read:

- search row still reads:
  - `section-search single-cell-container relative w-full`
- dummy editor root still reads:
  - `single-cell-child ...`
- geometry:
  - search row `200 x 26`
  - dummy editor `196 x 26`
  - source handle `14 x 14`
  - target handle `14 x 14`

Worktree tab:

- existing DevTools tab restored to `http://127.0.0.1:3011/home`
- disposable compare project `leaving_buying` was created from that existing
  tab and removed after the read

Worktree read:

- search row now reads:
  - `section-search relative flex w-full min-w-0 items-stretch`
  - no `single-cell-container`
- dummy editor root now reads:
  - `min-w-0 flex-1 self-stretch ...`
  - no `single-cell-child`
- real editor root now reads:
  - `min-w-0 flex-1 self-stretch ...`
  - no `single-cell-child`
- right-side ready/error indicator wrapper now rides the absolute inset-right
  flex shell
- geometry:
  - search row `200 x 26`
  - editor `196 x 26`
  - source handle `14 x 14`
  - target handle `14 x 14`

## Visual Check

- In the existing DevTools worktree tab, the callable search shell preserved
  the same compact row and handle geometry seen on untouched `main`.
- The untouched-`main` control tab kept the old single-cell search helpers on
  the representative callable path, giving a direct class-level control for
  the seam.
- The existing Chrome DevTools tabs were restored to:
  - `http://127.0.0.1:3011/home`
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3087/sleet_taking`

## Interpretation

- The callable search shell is now accepted.
- The shared color-picker seam stays closed.
- The higher `sectionChrome` baseline stays closed.
- The next pass should return to the remaining section-owned lower shell in:
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
