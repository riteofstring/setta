# Section Shell S1 Checkpoint 1 Residual Row Height Dead End

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Test whether the remaining `~1.2px` row-height gap could be removed at the existing row-CSS seam without reintroducing the callable reorder regression.

## Attempt

Local-only CSS follow-up on top of the kept `nameInput*` typography candidate:

- removed the `nameInputLeaf` / `nameInputParent` wrapper bottom border from layout
- redrew the underline on the inner `.peer/nameinput` / `.peer/textinput` text surfaces
- kept the same selector scope:
  - label-root seam via `data-param-label-shape`
  - first adjacent `.section-value` sibling only
- did not touch:
  - the row `<article>`
  - DnD ownership
  - pointer behavior
  - selection behavior

## Why This Was Worth Trying

The kept candidate had already narrowed the gap to:

- worktree row: `25.26px`
- untouched `main` row: `24.06px`

The headed DOM read for the kept candidate showed:

- worktree value wrapper: `25.26px`
- worktree value inner text surface: `24.06px`
- wrapper border bottom: `1px`

So this attempt explicitly targeted that last wrapper-owned contribution.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/CallableArea.test.tsx src/components/Section/Layouts/DictArea.test.tsx src/components/Section/Layouts/GlobalVariablesArea.test.tsx src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `4` files passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: failed
  - observed order after dragging `k` before `h`: `h > k > i > j`

## Evidence Review

- The residual-gap attempt is rejected.
- The change was small and local, but it still reopened the exact callable reorder failure that the broader wrapper patch had triggered earlier.
- That means the last `~1.2px` is not a free cleanup at the current row-CSS seam.

Inference from the existing evidence:

- The kept `25.26px` candidate is compatible with the current drag-over behavior.
- Pushing the wrappers closer to untouched `main` height at this seam reintroduces the same drag instability.
- So the next stronger seam is likely:
  - back in placeholder/collision handling
  - or an explicit blocker decision for the remaining visual gap

## Cleanup

- Reverted the local residual-gap CSS attempt.
- Restored the worktree to the prior green baseline:
  - commit `42c1c967f`

## Next Call

- Keep checkpoint 1 open.
- Keep the current `25.26px` worktree row as the accepted lower-seam baseline.
- Do not spend the next pass on another wrapper-border removal attempt at the same seam.
- Decide next whether full parity requires reopening the collision/placeholder owner stack or whether the residual row-height gap should be documented as blocked at the current lower seam.
