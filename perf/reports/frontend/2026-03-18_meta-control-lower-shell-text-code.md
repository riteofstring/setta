# Phase S2 MetaControl Lower Shell Text/Code Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the remaining lower MetaControl `single-cell-container` /
`single-cell-child` grid contract from the text/code editor shell without
reopening the accepted higher `sectionChrome` or the already accepted
date/time/password lower shells.

## Change

- Production seam:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
- Focused tests:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - `frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`

Implementation:

- `TextInputControl(...)` no longer uses:
  - `single-cell-container`
  - `single-cell-child`
- The lower text/code shell is now a simpler flex structure:
  - root lower shell: `relative flex ... items-stretch`
  - dummy/real editor class path: `section-value ... flex-1 self-stretch`
- The existing outer rounded border and compact editor padding are preserved.
- The multiline MetaControl editor still keeps the `min-h-24` floor for the
  `TextAreaParam` path.

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `1` file passed, `9` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
  - result: `12` passed

Added direct coverage:

- `MetaControlNode.test.tsx`
  - `TextAreaParam` no longer renders the single-cell grid shell
  - `CodeParam` no longer renders the single-cell grid shell
- `meta-control-date-time-modes.spec.ts`
  - new MetaControl text-area guardrail proves:
    - the compact editor shell remains visible
    - the editor stays inside the section bounds
    - the touched shell no longer exposes the old single-cell classes

## CDP Compare

Control page:

- untouched `main`
- existing DevTools window: `http://127.0.0.1:3087/gentle_rapid`
- representative section: multiline MetaControl text/code shell

Control read:

- lower shell still contains:
  - `single-cell-container`
  - `single-cell-child`
- geometry:
  - node bounds: `202 x 50.8`
  - shell bounds: `200 x 48.8`
  - editor bounds: `198 x 46.8`
- class read:
  - shell: `nodrag nopan single-cell-container ... rounded-lg border ...`
  - editor: `nodrag nopan single-cell-child section-value ...`

Worktree page:

- existing DevTools worktree window: `http://127.0.0.1:3011/kind_wet`
- representative section: multiline MetaControl text/code shell

Worktree read:

- lower shell now contains:
  - `relative`
  - `flex`
  - `items-stretch`
- lower shell no longer contains:
  - `single-cell-container`
  - `single-cell-child`
- geometry:
  - node bounds: `202 x 50.8`
  - shell bounds: `200 x 48.8`
  - editor bounds: `198 x 46.8`
- class read:
  - shell: `nodrag nopan relative flex ... rounded-lg border ...`
  - editor: `section-value ... flex-1 self-stretch ...`

## Visual check

- DevTools element screenshots of the worktree and untouched-`main` text/code
  controls stayed visually aligned:
  - same rounded outer shell
  - same compact multiline editor geometry
  - same visible code text and padding rhythm
- The worktree shell dropped the old lower-grid helper classes without changing
  the visible bounds relative to untouched `main`.

## Interpretation

- The lower MetaControl text/code shell is now accepted on the flex baseline.
- The higher `sectionChrome` `windowFlow` shell remains closed.
- The lower MetaControl seam is still not exhausted:
  - the remaining live `single-cell` owner in `MetaControlNode.tsx` is the
    color-picker wrapper path
- The next pass should stay lower and target that color-picker seam before
  claiming MetaControl is exhausted.
