# Section Shell S1 Checkpoint 1 Label Root Shape Seam

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Expose the planned shape-specific CSS seam in the live DOM without attaching it to the draggable row `<article>` and without perturbing the callable reorder/indent drag contract.

## Hypotheses

- `H1`: rendering the shape seam on the existing label root nodes is low risk
  - confirm if the seam can live on `ParamNameInput` and `ParamTextLabel` root nodes without moving DnD refs/listeners off the row shell
  - reject if the seam has to be attached to `ParamRowShell` to be usable
- `H2`: the seam is still useful for future row-level CSS work even if it does not live on the row owner
  - confirm if the current row child order still allows sibling selectors from the label root into the adjacent value wrapper
  - reject if the value wrapper is not structurally reachable from the label seam
- `H3`: this seam-only production change preserves the current drag canary
  - confirm if the focused Vitest set and the callable reorder/indent Playwright representative stay green
  - reject if the label-root metadata alone changes drag behavior

## Implementation

- Kept `labelShapeKey` computation in `frontend/src/components/Params/ParamSwitch.tsx`.
- Threaded that value into:
  - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
  - `frontend/src/components/Params/ParamItems/ParamTextLabel.tsx`
- Rendered `data-param-label-shape` on the existing label root nodes only:
  - the outer wrapper div in `ParamNameInput.tsx`
  - the root `<p>` in `ParamTextLabel.tsx`
- Left `frontend/src/components/Params/ParamRowShell.tsx` untouched, so the row `<article>` still owns:
  - the DnD ref
  - DnD listeners
  - row capture handlers

## Evidence Review

- `H1`: supported
  - the seam now lives on the existing label roots, not on the row shell
  - `ParamContainer` still forwards DnD ownership into `ParamRowShell`, so this patch did not move drag ownership downward
- `H2`: supported
  - `ParamContainer.tsx` still renders the label child before the adjacent `ParamInput` value wrapper
  - that keeps sibling-selector space available for a future row-level CSS candidate:
    - style the label root directly via `[data-param-label-shape=...]`
    - style the adjacent value wrapper via sibling selectors when needed
- `H3`: supported
  - focused Vitest coverage stayed green
  - the callable reorder/indent Playwright representative stayed green
  - no drag-surface regression was observed from this seam-only change

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `2 passed`

## Reproduction Status

- `Not reproduced`
- This pass did not attempt a new geometry correction. It only landed the enabling seam and verified that the current drag canary remains green.

## Next Call

- Keep checkpoint 1 open.
- Use `data-param-label-shape` as the first selector seam for the next local geometry candidate.
- Keep the draggable row `<article>` untouched while trying that candidate.
- Prefer label-root and sibling-selector changes before any row-owner or collision-stack edits.
- Rerun the callable reorder representative before any headed shared-row compare against untouched `main`.
