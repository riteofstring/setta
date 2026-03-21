# Section Shell S1 Checkpoint 1 Past Halfway Owner Seam

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Use the existing clean-versus-failing reorder evidence to isolate which code path actually owns the final wrong insertion index, so the next geometry attempt does not waste time in downstream serialization code.

## Hypotheses

- `H1`: the backend-facing insertion-index resolver is the real bug
  - confirm if `resolveFullIndexForVisibleInsertion()` can still turn a correct temp placeholder position into the wrong `newIndex`
  - reject if it only serializes whatever temp index the drag-over path already produced
- `H2`: the active seam is the same-parent placeholder branch in the drag-over path
  - confirm if the last missing top-row move depends on `resolveOverCollisionId()`, `getPastHalfway()`, and `computeNewIndex()`
  - reject if those functions cannot explain the missing final `nextIndex 0` transition
- `H3`: a future row-shape-specific CSS correction already has a clean DOM seam
  - confirm if `labelShapeKey` is already rendered into the row DOM/class output
  - reject if it is only an internal prop today

## Evidence Review

- `H1`: rejected
  - `handleParamDragEnd()` in `frontend/src/components/Params/ParamDndMonitor.tsx` only calls `resolveFullIndexForVisibleInsertion()` after it has already found the temp placeholder parent and visible sibling index
  - `resolveFullIndexForVisibleInsertion()` in `frontend/src/state/actions/params/paramTree.ts` removes the moving ids, then translates the temp placeholder's visible slot into the final full-child insertion index
  - on the current evidence, it is downstream-only: if the temp placeholder lands one slot late, the backend `newIndex` will also be one slot late
- `H2`: supported
  - `updateParamDragOver()` in `frontend/src/components/Params/ParamDndMonitor.tsx` resolves the effective top-row collision with `resolveOverCollisionId()` from `frontend/src/forks/dnd-kit/adapter/collisionCompare.ts`
  - `resolveOverCollisionId()` depends on collision ranking that prefers sortable-container collisions, uses trigger-distance comparisons when available, and promotes child collisions over parent collisions
  - `getPastHalfway()` in `frontend/src/forks/dnd-kit/adapter/collision.ts` chooses the relevant active-row edge from pointer direction and applies sticky `±10` hysteresis when the collision id repeats
  - `maybeMovePlaceholder()` then passes that boolean into `computeNewIndex()` in `frontend/src/forks/dnd-kit/adapter/sorting.ts`
  - on the exact `overIdx < activeIdx` path used by the callable reorder representative, `computeNewIndex()` returns absolute-top `overIdx` only when `pastHalfway === false`; otherwise it leaves the placeholder one slot later at `overIdx + 1`
  - this matches the existing event evidence precisely:
    - clean run: final top-row `pastHalfway: false`, `placeholder:reorder nextIndex 0`, committed `newIndex: 7`
    - failing wrapper-geometry variant: no final top-row `pastHalfway: false`, no `nextIndex 0`, committed `newIndex: 8`
  - the already observed `21px -> 20px` dragged-row height shift is therefore a plausible mechanism for the missed last flip, because both the active-row edge and the sticky halfway buffer participate in that comparison
- `H3`: rejected
  - `labelShapeKey` is computed in `frontend/src/components/Params/ParamSwitch.tsx`
  - `labelShapeKey` is passed into `frontend/src/components/Params/ParamContainer.tsx`
  - `labelShapeKey` currently only participates in the memo equality check in `ParamContainer.tsx`
  - `ParamContainer.tsx` does not render `labelShapeKey` into DOM attributes or class output, so there is no live shape-specific CSS seam yet

## Reproduction Status

- No new reproduction run in this pass.
- This was a code-read narrowing pass against the already recorded clean-versus-failing event stream from the prior HTTP-logging run.

## Verification

- No new automated tests were run in this pass.
- No new CDP/DevTools visual check was run in this pass.

## Next Call

- Keep checkpoint 1 open.
- Treat the exact owner stack for the last reorder step as:
  - `frontend/src/forks/dnd-kit/adapter/collisionCompare.ts`
  - `frontend/src/forks/dnd-kit/adapter/collision.ts`
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/forks/dnd-kit/adapter/sorting.ts`
- Do not spend the next pass in `resolveFullIndexForVisibleInsertion()` unless fresh evidence shows the temp placeholder index is already correct before drag end.
- If the next geometry candidate returns to row-level CSS, expose a shape-specific modifier seam first, but do it without changing the row `<article>` hitbox or drag surface.
- Reuse the callable reorder representative as the first gate before rerunning the shared-row compare against untouched `main`.
