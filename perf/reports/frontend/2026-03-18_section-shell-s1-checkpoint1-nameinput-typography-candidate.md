# Section Shell S1 Checkpoint 1 NameInput Typography Candidate

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Use the new `data-param-label-shape` seam to recover the `GlobalVariables` kwarg row geometry without touching the draggable row owner and without reintroducing the callable reorder regression.

## Hypotheses

- `H1`: a typography-only selector pass on `nameInput*` rows can materially reduce the shared-row geometry gap
  - confirm if the worktree headed compare moves closer to untouched `main`
  - reject if the row remains near the earlier `30.07px` worktree read
- `H2`: a label-root plus first-value-sibling selector is narrow enough to preserve the reorder canary
  - confirm if the callable reorder/indent Playwright representative stays green
  - reject if that canary regresses again
- `H3`: dict/global-variables shared-row consumers still tolerate the narrower selector pass
  - confirm if the existing dict/global-variables Playwright specs stay green
  - reject if those shared-row consumers break

## Implementation

- Added a CSS-only follow-up in `frontend/index.css`.
- Scope:
  - `nameInputLeaf`
  - `nameInputParent`
- Selector pattern:
  - the existing label root carrying `data-param-label-shape`
  - the first adjacent `.section-value` sibling
  - the mounted/dummy CodeMirror text nodes under those wrappers
- Change shape:
  - set wrapper typography to `12px / 16px`
  - make the relevant mounted/dummy CodeMirror content inherit that typography
  - do not change:
    - the row `<article>`
    - the row flex contract
    - DnD ownership
    - pointer/selection behavior

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `2 passed`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/global-variables-kwargs.spec.ts`
  - result: `4 passed`

## Headed Compare

Used the existing disposable `GlobalVariables` compare scenes:

- worktree: `http://127.0.0.1:3011/smooth_hawk`
- untouched `main`: `http://127.0.0.1:3087/dry_slow`

Compared the same `Add Key` row on both pages in headed CDP.

Worktree after the candidate:

- row rect: `212.29 x 25.26`
- label rect: `98.64 x 21.05`
- value rect: `94.41 x 25.26`
- label/value wrapper typography: `12px / 16px`

Untouched `main` control:

- row rect: `211.71 x 24.06`
- value content rect: `93.83 x 24.06`
- value content typography: `12px / 16px`

Previous blocking worktree read for context:

- row rect: `212.29 x 30.07`
- value rect: `94.41 x 25.26`
- key/value typography read at the wrapper layer: `16px / 24px`

## Evidence Review

- `H1`: supported
  - the worktree row fell from the earlier `30.07px` read to `25.26px`
  - the wrapper typography now matches the intended `12px / 16px` contract on the touched path
- `H2`: supported
  - the callable reorder/indent Playwright representative stayed green
  - this candidate did not recreate the earlier `h > k > i > j` failure
- `H3`: supported
  - the dict/global-variables shared-row Playwright specs stayed green

## Interpretation

- This is the first lower-seam geometry candidate that both:
  - materially improves the headed shared-row compare
  - preserves the reorder canary that killed the broader wrapper patch
- Checkpoint 1 is still not accepted:
  - the worktree row remains about `1.2px` taller than untouched `main`
  - the remaining work is now a narrow residual row height gap, not the earlier broad typography mismatch

## Next Call

- Keep this candidate as the new baseline.
- Do not reopen the old blanket wrapper patch.
- Narrow the next pass to the residual `~1.2px` row height gap versus untouched `main`.
- Preserve:
  - the callable reorder/indent canary
  - dict/global-variables shared-row Playwright coverage
  - the row-owner constraint on `ParamRowShell`
