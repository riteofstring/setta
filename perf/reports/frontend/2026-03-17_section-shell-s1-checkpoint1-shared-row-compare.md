# Section Shell S1 Checkpoint 1 Shared Row Compare

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Capture the explicit untouched-`main` vs worktree shared-row compare that the acceptance gate still required, then use that read to accept or reject checkpoint 1.

## Replay

Used the existing disposable `GlobalVariables` sections already created on both live pages:

- worktree: `http://127.0.0.1:3011/smooth_hawk`
  - section id: `0007e247-e833-417f-9b3d-5eab0513026e`
- untouched `main`: `http://127.0.0.1:3087/dry_slow`
  - section id: `dd8ba98a-cd6f-437c-9e14-3febaaafe266`

Compared the first rendered kwarg row (`Add Key`) on both branches in headed DevTools.

## Geometry Read

Worktree row geometry:

- section rect: `242.98 x 123.90`
- row rect: `212.29 x 30.07`
- key rect: `98.64 x 30.07`
- value rect: `94.41 x 25.26`
- resize-handle rect: `19.25 x 30.07`

Untouched `main` row geometry:

- section rect: `242.98 x 117.88`
- row rect: `211.71 x 24.06`
- key rect: `98.64 x 24.06`
- value rect: `93.83 x 24.06`
- resize-handle rect: `19.25 x 21.65`

What stayed close:

- section width
- row width
- key width
- value width
- handle x-placement

What did not:

- worktree section height is about `6px` taller
- worktree row height is about `6px` taller
- worktree value box is taller than untouched `main`

## Computed Style Read

Worktree lower-row contract:

- row display: `flex`
- nested display: `flex`
- nested direction: `column`
- value display: `flex`
- key/value typography:
  - font size: `16px`
  - line height: `24px`
  - bottom border: `1px`

Untouched `main` lower-row contract:

- row display: `grid`
- nested display: `grid`
- nested direction: `row`
- value display: `block`
- key/value typography:
  - font size: `12px`
  - line height: `16px`
  - top/bottom padding: `2px`

## Visual Artifacts

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-shared-row-compare/worktree-global-variables-shared-row.png`
- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-shared-row-compare/main-global-variables-shared-row.png`

## Decision

- This compare does not clear checkpoint 1.
- The horizontal row layout is close enough to confirm the work is in the right seam.
- The remaining blocker is now explicit: the shared lower row contract still diverges from untouched `main` on row height and key/value typography.
- Do not move upward into `sectionChrome` yet.

## Next Target

Stay in the lower shared row contract and reconcile the geometry/typography mismatch in:

- `frontend/index.css`
- `frontend/src/components/Params/paramRowClassNames.ts`
- `frontend/src/components/Params/ParamRowShell.tsx`
- `frontend/src/components/Params/ParamContainer.tsx`
- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
