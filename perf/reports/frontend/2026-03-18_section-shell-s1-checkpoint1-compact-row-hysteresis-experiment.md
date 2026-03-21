# Section Shell S1 Checkpoint 1 Compact Row Hysteresis Experiment

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Run the first local-only experiment at the `getPastHalfway()` threshold seam without widening into broader collision-ranking or reorder math changes.

## Change

Kept the work inside:

- `frontend/src/forks/dnd-kit/adapter/collision.ts`

Specific change:

- same-collision hysteresis no longer hard-codes `±10px` for every repeated collision
- the kept baseline is now:
  - `min(10px, 25% of the smaller active/droppable axis size)`

Effect on the compact param-row path:

- `20px` rows now use a `5px` same-collision buffer instead of `10px`
- larger targets still keep the existing `10px` cap

Focused guardrail added:

- `frontend/src/forks/dnd-kit/adapter/collision.test.ts`
  - repeated same-id compact-row `true -> false` midpoint flip
  - repeated same-id compact-row `false -> true` midpoint flip
  - same-id scoping only
  - large-target cap preservation

## Verification

Unit / integration:

- `pnpm -C frontend exec vitest run src/forks/dnd-kit/adapter/collision.test.ts src/forks/dnd-kit/adapter/sorting.test.ts src/forks/dnd-kit/adapter/collisionCompare.test.ts src/forks/dnd-kit/dndCollisions.integration.test.ts`
  - result: `4` files passed, `23` tests passed

User-path canary:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: `2 passed`

## Interpretation

This is enough evidence to keep the threshold change as the new lower-seam baseline:

- the compact-row midpoint logic is now directly covered
- the adapter change did not reopen the callable reorder/indent canary

It is not enough to close checkpoint 1:

- the branch still has not rerun the shared-row residual-gap geometry candidate on top of this new hysteresis baseline
- untouched `main` versus worktree shared-row geometry parity therefore remains unresolved

## Practical Next Call

- keep checkpoint 1 open
- retry the narrow residual shared-row geometry candidate, or the closest equivalent label-root follow-up, on top of this hysteresis baseline
- rerun the callable reorder/indent canary immediately after that geometry retry
- compare untouched `main` versus worktree again on the shared-row geometry path before widening the owner seam beyond threshold sizing
