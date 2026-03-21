# Section Shell S1 Checkpoint 1 Value Wrapper Underline Candidate

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Retry the residual shared-row geometry step on top of the compact-row hysteresis baseline without reopening the broader key-label wrapper seam.

## Change

Kept the work inside the shared value-side underline path:

- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`

Candidate shape:

- removed the value wrapper bottom border from layout
- redrew the underline with an out-of-flow `after` pseudo-element on the value wrapper
- left the editable key/name wrapper unchanged
- left the collision / reorder logic unchanged beyond the already-kept hysteresis baseline

Why this is narrower than the previously rejected residual-gap attempt:

- only the value-side wrapper changed
- the key/name wrapper box model stayed intact
- underline painting stayed on the wrapper layer instead of moving onto inner text surfaces

## Verification

Layout/unit coverage:

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed

Interaction coverage:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `2 passed`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/global-variables-kwargs.spec.ts`
  - result: `4 passed`

CDP worktree-only read on the live `smooth_hawk` callable scene:

- representative row heights after the candidate:
  - `mode`: row `21px`, value wrapper `21px`
  - `newline`: row `21px`, value wrapper `21px`
  - `errors`: row `21px`, value wrapper `21px`
- visual spot-check:
  - callable section screenshot taken from chrome-devtools-mcp after the change
  - no obvious underline or row-breakage was visible in the worktree scene

## Interpretation

This candidate survives the current automated guardrails and materially tightens the value-side row box on the worktree.

It is still not enough to accept checkpoint 1:

- the exact untouched-`main` versus worktree compare has not been rerun for this candidate
- the current CDP read is worktree-only and on the callable scene, not the earlier `GlobalVariables` `Add Key` control row used for the tighter parity read

## Practical Next Call

- keep checkpoint 1 open
- recreate or recover the untouched-`main` control scene for the exact shared-row compare
- measure this value-wrapper candidate against untouched `main` before deciding whether it becomes the new kept geometry baseline
- if the main compare still shows a meaningful residual gap, keep the current candidate only as a partial recovery and continue with the next lower-seam read
