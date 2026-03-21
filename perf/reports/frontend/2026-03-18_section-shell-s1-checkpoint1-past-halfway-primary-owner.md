# Section Shell S1 Checkpoint 1 Past Halfway Primary Owner

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Use the confirmed residual-gap rerun plus code read to decide the strongest next owner seam inside the lower param-row drag path.

## Conclusion

The strongest next owner seam is:

- `frontend/src/forks/dnd-kit/adapter/collision.ts`
  - `getPastHalfway()`

Specifically, the next useful checkpoint-1 question is:

- why the final top-row hover stays `pastHalfway: true`
- instead of flipping to `pastHalfway: false`
- after the row-height change

## Why This Is The Stronger Seam

The confirmed residual-gap rerun already established:

- the top row is still reached
- the backend still accepts the move
- the failure is the missing final placeholder transition before drag end

That makes `getPastHalfway()` the strongest remaining owner because it directly controls whether the same-parent placeholder can move from index `1` to `0`.

Relevant code:

- `frontend/src/forks/dnd-kit/adapter/collision.ts`
  - `getPastHalfway()`
  - `updatePointerDirections()`
- `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `updateParamDragOver()`
  - `maybeMovePlaceholder()`

Key behavior in the current implementation:

- `getPastHalfway()` uses:
  - pointer position fallback
  - pointer direction memory
  - active-rect edge selection (`top` / `bottom` for param rows)
  - sticky `±10px` hysteresis when the collision stays on the same row
- that means a small geometry shift can keep the final top-row hover on the wrong side of the midpoint test even when the correct row is already selected

## What Current Evidence Rules Out First

### `computeNewIndex()` is downstream, not the primary seam

In the current same-parent reorder branch:

- `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `maybeMovePlaceholder()`
- `frontend/src/forks/dnd-kit/adapter/sorting.ts`
  - `computeNewIndex()`

For the decisive final step:

- `activeIndex = 1`
- `overIndex = 0`

Current semantics already do the correct thing when `pastHalfway === false`:

- return `0`

Current semantics keep the placeholder at index `1` only when:

- `pastHalfway === true`

So `computeNewIndex()` is only reflecting the upstream boolean; it is not the first seam to reopen.

### `resolveOverCollisionId()` is not the strongest next seam

The confirmed residual-gap rerun already showed:

- an `over:resolved` event on the top row
- but still with `pastHalfway: true`

So the current evidence does not say “the wrong row won.”
It says:

- the right row can still win
- but the last midpoint flip never happens

`resolveOverCollisionId()` only becomes the stronger seam if a later rerun shows the final top-row collision itself is wrong.

### `maybeMovePlaceholder()` / parent normalization is weaker on current evidence

The failure remains in the same-parent reorder path, not the parent-change path:

- no parent move is needed
- no backend rejection occurs
- no missing optimistic move occurs

`maybeMovePlaceholder()` is still relevant as the immediate consumer, but its decisive branch is gated by `pastHalfway`.

## Practical Next Call

If checkpoint 1 continues:

- reopen `getPastHalfway()` first
- treat pointer-direction memory plus the `±10px` sticky buffer as the main candidate mechanism
- only fall back to `resolveOverCollisionId()` if fresh evidence shows the final top-row collision itself is wrong

If checkpoint 1 stops here instead:

- document the remaining `~1.2px` row-height gap as blocked at the current lower seam
- with the blocker specifically tied to `getPastHalfway()` sensitivity under the geometry change, not to generic collision loss or backend sync
