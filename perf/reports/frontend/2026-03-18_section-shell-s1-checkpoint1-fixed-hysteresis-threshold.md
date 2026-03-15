# Section Shell S1 Checkpoint 1 Fixed Hysteresis Threshold

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Narrow the `getPastHalfway()` owner seam one step further by checking whether the fixed same-row hysteresis buffer is itself strong enough to explain the clean-versus-failing split.

## Code Read

Current midpoint logic:

- `frontend/src/forks/dnd-kit/adapter/collision.ts`
  - `getPastHalfway()`

Relevant behavior:

- when the collision stays on the same row and the previous state was `pastHalfway === true`
  - `buffer = 10`
- on the vertical param-row path, if the pointer direction is upward
  - `referenceAxisValue = activeRect.top`
- the final test is:
  - `activeRect.top + 10 > midpoint`

Representative drag direction:

- `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - `dragParamBeforeTarget()`
- the existing reorder representative drags `k` upward before `h`, so the negative-Y / `activeRect.top` branch is the live branch for the final top-row hover on current evidence

## Threshold Math

Inference from the current formula plus the already-recorded row heights:

- clean dragged row height at start:
  - `21px`
- failing residual-gap dragged row height at start:
  - `20px`

For a same-row repeated collision with previous `pastHalfway === true`:

- `20px` row:
  - midpoint is `rowTop + 10`
  - condition becomes:
    - `activeTop + 10 > rowTop + 10`
    - so the flip to `false` requires:
      - `activeTop <= rowTop`
- `21px` row:
  - midpoint is `rowTop + 10.5`
  - condition becomes:
    - `activeTop + 10 > rowTop + 10.5`
    - so the flip to `false` requires:
      - `activeTop <= rowTop + 0.5`

## Interpretation

This does not prove the full bug alone, but it is a stronger threshold-level explanation than the current generic “check getPastHalfway” wording.

The fixed same-row `+10px` buffer effectively consumes almost the entire half-height budget of these compact param rows:

- on a `20px` row, the dragged top edge has to reach the target row’s top edge
- on a `21px` row, it still has to get within roughly `0.5px` of that same boundary

That means the final `pastHalfway: false` flip becomes highly sensitive to:

- one pixel of row-height change
- tiny endpoint differences in the scripted drag path
- subpixel rect rounding

So the strongest next checkpoint-1 sub-seam is now more specific:

- not generic collision handling
- not generic pointer-direction memory
- not downstream `computeNewIndex()`
- but the fixed same-row hysteresis threshold inside `getPastHalfway()`

## Practical Next Call

If checkpoint 1 continues:

- reopen `getPastHalfway()` at the fixed same-row `±10px` buffer first
- treat buffer sizing or buffer scoping for compact param rows as the first local-only experiment
- only widen back out to broader collision ranking or parent normalization if a fresh rerun disproves this threshold explanation

If checkpoint 1 stops here:

- document the remaining `~1.2px` row-height gap as blocked specifically by the fixed same-row hysteresis threshold at this lower seam
