# Phase S2 Draw Canvas Shell Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the remaining `single-cell-container` / `single-cell-child` overlay
contract from the Draw canvas shell without reopening the accepted toolbar
color-picker wrapper seam or the higher `sectionChrome` baseline.

## Change

- Production seam:
  - `frontend/src/components/Section/Layouts/DrawArea/DrawArea.tsx`
  - `frontend/src/state/hooks/sectionSizes.ts`
- Focused tests:
  - `frontend/src/state/hooks/sectionSizes.test.tsx`
  - `frontend/tests/e2e/sections/draw-canvas-shell.spec.ts`
  - `frontend/tests/e2e/sections/draw-color-picker-shell.spec.ts`
  - `frontend/tests/e2e/sections/realtime-binary-draw.spec.ts`

Implementation:

- The Draw body shell now uses:
  - `nodrag section-row-main section-key-value relative flex ...`
  - no outer `single-cell-container`
- The inner Draw wrapper now uses:
  - `relative flex max-w-full shrink-0`
  - explicit `width` / `height` from the Draw canvas size helper
  - no inner `single-cell-container`
- The stacked layer and draft canvases now use:
  - `absolute inset-0 h-full w-full`
  - no `single-cell-child`
- `getDrawAreaCanvasSize(...)` now preserves the browser-default
  `300 x 150` canvas fallback whenever a fixed Draw section size would
  otherwise resolve to a non-positive inner canvas dimension. That keeps the
  compact default Draw scene aligned with untouched `main` instead of
  collapsing the new explicit wrapper.

## Automated Verification

- `pnpm -C frontend exec vitest run src/state/hooks/sectionSizes.test.tsx`
  - result: `1` file passed, `10` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/draw-canvas-shell.spec.ts frontend/tests/e2e/sections/draw-color-picker-shell.spec.ts frontend/tests/e2e/sections/realtime-binary-draw.spec.ts`
  - result: `3` passed

Added direct coverage:

- `sectionSizes.test.tsx`
  - keeps the Draw auto canvas defaults at `500 x 500`
  - keeps the fixed-size invalid Draw fallback at `378 x 150` for the compact
    default Draw scene
- `draw-canvas-shell.spec.ts`
  - the Draw canvas shell no longer exposes `single-cell-container`
  - the inner wrapper and canvases no longer expose `single-cell-child`
  - the wrapper and visible canvases keep the same positive compact geometry
- Existing draw regressions stayed green:
  - toolbar color-picker shell
  - realtime binary draw transport

## CDP Compare

Control tab:

- untouched `main`
- existing DevTools tab restored to `http://127.0.0.1:3087/sleet_taking`
- disposable compare project `knowing_eager` was created from that existing
  tab and removed after the read

Control read:

- Draw body shell still reads:
  - `nodrag single-cell-container section-row-main section-key-value relative max-h-full min-w-0`
- Inner wrapper still reads:
  - `single-cell-child single-cell-container`
- Stacked canvases still read:
  - `single-cell-child max-w-full place-self-center ...`
- visible draw-box geometry:
  - wrapper `378 x 150`
  - canvas `378 x 150`

Worktree tab:

- existing DevTools tab restored to `http://127.0.0.1:3011/home`
- disposable compare project `clean_chasing` was created from that existing
  tab and removed after the read

Worktree read:

- Draw body shell now reads:
  - `nodrag section-row-main section-key-value relative flex max-h-full min-h-0 min-w-0 items-center justify-center`
  - no `single-cell-container`
- Inner wrapper now reads:
  - `relative flex max-w-full shrink-0`
  - inline style `width: 378px; height: 150px;`
  - no `single-cell-container`
  - no `single-cell-child`
- Stacked canvases now read:
  - `absolute inset-0 h-full w-full`
  - no `single-cell-child`
- visible draw-box geometry:
  - wrapper `378 x 150`
  - canvas `378 x 150`

## Visual Check

- In the existing DevTools worktree tab, the visible Draw wrapper/canvas pair
  matched untouched `main` at `378 x 150` on the default compact Draw scene.
- The helper fallback preserved the same browser-default height contract that
  untouched `main` was already relying on when the fixed Draw size resolved to
  an invalid inner canvas height.
- The existing Chrome DevTools tabs were restored to:
  - `http://127.0.0.1:3011/home`
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3087/sleet_taking`

## Interpretation

- The Draw canvas shell is now accepted.
- The accepted Draw toolbar color-picker wrapper stays closed.
- The higher `sectionChrome` baseline stays closed.
- The next pass should return to the remaining section-owned lower shell in:
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`
