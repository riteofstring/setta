# Section Shell S1 Checkpoint 1 Residual Gap Debug Confirmation

Date: 2026-03-18
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Confirm whether the rejected residual-gap CSS attempt reopened the same insertion-index failure path already recorded in the earlier drag-lifecycle instrumentation, or whether it introduced a new failure mode.

## Local-Only Method

Temporary instrumentation was added and removed again after capture:

- backend sink in `backend/setta/routers/status.py`
- shared frontend logger wired into the dormant `debugParamDnd(...)` hooks in:
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/forks/dnd-kit/ParamDndContext.tsx`
  - `frontend/src/state/actions/params/moveParams.ts`
- env-gated Playwright readback in:
  - `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`

The rejected residual-gap CSS attempt was then reapplied locally on top of the kept `nameInput*` typography baseline:

- removed the `nameInputLeaf` / `nameInputParent` wrapper bottom border from layout
- redrew the underline on the inner `.peer/nameinput` / `.peer/textinput` surfaces

## Verification

- `SETTA_PARAM_DND_DEBUG_RUN_ID_PREFIX=residual-gap ./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "light workspace and standalone callable routes preserve reorder and tab indent behavior"`
  - result: failed
  - observed visible order after dragging `k` before `h`: `h > k > i > j`

## Captured Event Trail

Workspace run id:

- `residual-gap-light-workspace-structure`

Key events from the captured trail:

- drag start:
  - placeholder height: `20`
  - active rect height: `20`
- same-parent placeholder reorder progressed only to:
  - `nextIndex: 2`
  - `nextIndex: 1`
- the final clean-path top-row step never happened:
  - there was an `over:resolved` on the top row with `pastHalfway: true`
  - there was no final `placeholder:reorder nextIndex: 0`
- drag end still completed:
  - `end:move`
  - `newIndex: 8`
  - `move:send`
  - `move:response`
  - backend status: `200`

## Interpretation

- This is the same failure path the checkpoint was already tracking, not a new one.
- The residual-gap CSS attempt does not kill collisions and does not kill backend acceptance.
- It still misses the last top-row placeholder transition needed to commit the clean insertion result.
- So the remaining blocker is still in the same owner seam:
  - collision resolution / `pastHalfway`
  - same-parent placeholder reorder
  - final insertion math under the changed row geometry

The temporary debug rerun therefore answers the open question from the last dead-end report:

- do not spend another pass on wrapper-border removal or another near-identical row-CSS cleanup at this seam
- if checkpoint 1 must move again, reopen the collision/placeholder owner stack directly
- otherwise record the remaining row-height gap as blocked at the current lower seam

## Cleanup

- reverted the local residual-gap CSS attempt
- removed the temporary HTTP logging instrumentation and Playwright readback
- left no production-code changes from this debug pass in the worktree
