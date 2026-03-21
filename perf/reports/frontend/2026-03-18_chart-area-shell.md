# Phase S2 Chart Shell Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the remaining `single-cell-container` shell contract from the active
Chart body path without reopening the accepted section-surface split or the
shared sizing regressions already covered by the section-sizing suite.

## Change

- Production seam:
  - `frontend/src/components/Section/Layouts/ChartArea/ChartArea.tsx`
- Focused tests:
  - `frontend/tests/e2e/sections/chart-canvas-shell.spec.ts`
  - `frontend/tests/e2e/sections/section-sizing.spec.ts`

Implementation:

- The outer chart figure now uses:
  - `section-w-full section-row-main relative flex h-auto min-h-0 w-full min-w-0 max-w-full items-center justify-center overflow-clip py-2.5`
  - no `single-cell-container`
- The chart canvas now uses:
  - `block max-w-full`
  - no `single-cell-child`
- The explicit `py-2.5` slack keeps the same `300 x 270` outer figure
  geometry that untouched `main` still shows around the compact `275 x 250`
  chart canvas.

## Automated Verification

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections/chart-canvas-shell.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
  - result: `10` passed

Added direct coverage:

- `chart-canvas-shell.spec.ts`
  - the chart body shell no longer exposes `single-cell-container`
  - the touched chart markup no longer exposes `single-cell-child`
  - the chart canvas keeps positive geometry inside the compact shell
- Existing chart regressions stayed green:
  - the chart resize clamp and persistence path in `section-sizing.spec.ts`
  - the shared sizing canaries that run in the same file

## CDP Compare

Control tab:

- untouched `main`
- existing DevTools tab restored to `http://127.0.0.1:3087/sleet_taking`
- disposable compare project `hiding_swift` was created from that existing tab
  and removed after the read

Control read:

- outer chart figure still reads:
  - `section-w-full section-row-main single-cell-container flex h-auto w-full max-w-full items-center justify-items-center overflow-clip`
- visible geometry:
  - figure `300 x 270`
  - canvas `275 x 250`

Worktree tab:

- existing DevTools tab restored to `http://127.0.0.1:3011/home`
- disposable compare project `writing_pearl` was created from that existing
  tab and removed after the read

Worktree read:

- outer chart figure now reads:
  - `section-w-full section-row-main relative flex h-auto min-h-0 w-full min-w-0 max-w-full items-center justify-center overflow-clip py-2.5`
  - no `single-cell-container`
- chart canvas now reads:
  - `block max-w-full`
  - no `single-cell-child`
- visible geometry:
  - figure `300 x 270`
  - canvas `275 x 250`

## Visual Check

- In the existing DevTools worktree tab, the chart shell preserved the same
  `300 x 270` outer figure and `275 x 250` visible canvas box seen on
  untouched `main`.
- The branch no longer relies on the old single-cell helper to center the
  chart canvas inside that shell.
- The existing Chrome DevTools tabs were restored to:
  - `http://127.0.0.1:3011/home`
  - `http://127.0.0.1:3011/settings`
  - `http://127.0.0.1:3087/sleet_taking`

## Interpretation

- The Chart shell is now accepted.
- The higher `sectionChrome` baseline stays closed.
- The next pass should return to the remaining section-owned lower shell in:
  - `frontend/src/components/Section/Layouts/BrowserArea.tsx`
