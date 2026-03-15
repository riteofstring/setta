# Section Shell S1 Checkpoint 1 Exact GlobalVariables Compare

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `done`

## Goal

Run the exact untouched-`main` versus worktree compare for the kept value-side underline candidate and decide whether checkpoint 1 can close.

## Scene Recovery

Recovered matched disposable compare scenes through generated endpoints and SPA navigation:

- untouched `main`: `http://127.0.0.1:3087/marsh_zooming`
- worktree: `http://127.0.0.1:3011/loose_playing`

On both pages:

- created a disposable project config
- created a single `GlobalVariables` section
- added the first kwarg row so the representative control stayed the `Add Key` row

Exact rows measured:

- untouched `main`:
  - `ParamContainer-3a97fab0-9be3-4906-b2d6-05e738ff86ce-c7e13f3a-765e-4313-a1f0-7da1f5f46748`
- worktree:
  - `ParamContainer-308222a2-486f-4ed1-8b00-8dc0b17a0092-ea5d0091-aa0d-4d4f-b695-5699eda8321d`

## Measurement Read

Initial raw `getBoundingClientRect()` reads looked incompatible because React Flow was at different viewport scales:

- untouched `main` scale: `1.68298`
- worktree scale: `0.552096`

After normalizing the row boxes by each page's viewport scale, the exact compare lands at parity for the visible shared-row contract:

- row height:
  - untouched `main`: `20.0000px`
  - worktree: `20.0000px`
- key width:
  - untouched `main`: `82.0001px`
  - worktree: `82.0000px`
- value width:
  - untouched `main`: `78.0001px`
  - worktree: `78.4844px`
- typography:
  - both pages compute `12px / 16px` on the visible key/value content

Important interpretation detail:

- the internal row layout model still differs (`grid` on untouched `main`, `flex` on the worktree)
- the accepted comparison here is the visible shared-row output and drag-safe behavior, not DOM-structure identity

## Visual Check

Chrome DevTools fixed-overlay compare:

- cloned the exact `Add Key` row into a fixed-position overlay on both pages
- preserved the normalized row width while removing the canvas transform from the read
- visual result:
  - no meaningful drift in the visible row height, underline position, or key/value typography

## Verification Context

This compare is evaluated on top of the already-green verification set for the value-side underline candidate:

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `2 passed`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/dict-kwargs.spec.ts frontend/tests/e2e/params/global-variables-kwargs.spec.ts`
  - result: `4 passed`

## Interpretation

This exact compare is enough to accept the kept lower-seam baseline:

- the value-side underline candidate now clears the untouched-`main` parity gate
- the callable reorder/indent canary stayed green on the same code baseline
- checkpoint 1 no longer needs another residual shared-row geometry pass before the plan moves upward

## Practical Next Call

- accept checkpoint 1
- keep the compact-row hysteresis change plus the value-side underline move as the lower-seam baseline
- move upward into the higher shared `sectionChrome` section-surface grid seam
- keep the callable reorder/indent and shared row-contract guardrails in the loop while widening the seam again
