# Section Shell S1 Checkpoint 1 Drag Lifecycle Instrumentation

Date: 2026-03-17
Branch: `frontend-performance-11`
Worktree: `setta.frontend-performance-11`
Checkpoint: `Phase S1` checkpoint 1 follow-up
Status: `needs_more_work`

## Goal

Use hypothesis-driven HTTP logging to determine whether the known wrapper-local geometry correction breaks callable reorder because collisions disappear, because the drag lifecycle stops early, or because the move commits the wrong insertion index.

## Hypotheses

- `H1`: the geometry variant changes collision filtering so the params path drops to empty collisions near the top row
  - confirm with `tracker:filtered-empty` / `over:filtered-empty`
  - reject if the failing run still resolves the same top-row collisions as the clean run
- `H2`: the failing run keeps collisions but never reaches a real move candidate
  - confirm if the failing run stops before `end:move`
  - reject if the failing run still reaches `end:move`
- `H3`: the failing run reaches `end:move`, but the geometry shift perturbs the final insertion math so the wrong `newIndex` is sent and accepted
  - confirm if the failing run reaches `move:send` / `move:response 200` with a different `newIndex` from the clean run
  - reject if both runs send the same final move payload

## Instrumentation

- Added temporary HTTP logging hooks to:
  - `frontend/src/components/Params/ParamDndMonitor.tsx`
  - `frontend/src/forks/dnd-kit/ParamDndContext.tsx`
  - `frontend/src/state/actions/params/moveParams.ts`
- Routed those events through temporary backend endpoints so one Playwright run could fetch the full stream after the reorder step.
- Used a per-reproduction `runId` attached only around `runReorderAndIndentFlow(...)`.
- Removed all temporary routes, frontend helpers, and test plumbing after the evidence pass. No production code from the instrumentation remains in the branch.

## Reproduction Report

- Environment:
  - repo state before doc update: clean committed branch
  - representative: `frontend/tests/e2e/params/callable-minimum-regression.spec.ts`
  - scoped grep: `light workspace and standalone callable routes preserve reorder and tab indent behavior`
- Clean control run:
  - branch state only, with temporary instrumentation enabled
  - result: passed
- Failing run:
  - reintroduced the same wrapper-geometry direction locally in:
    - `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
    - `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
  - kept that variant local only
  - result: failed with visible order `h > k > i > j`

## Reproduction Result

- `Reproduced`
- The geometry variant still reproduces the known callable reorder failure on the light workspace representative.

## Evidence Review

- `H1`: rejected
  - the failing run still resolves the same progressive top-row `over:resolved` sequence
  - there was no evidence of `tracker:filtered-empty` or `over:filtered-empty` driving the failure
- `H2`: rejected
  - the failing run still reaches:
    - `end:move`
    - `move:send`
    - `move:response`
- `H3`: supported
  - clean branch event summary:
    - dragged row height at `start`: `21`
    - `placeholder:reorder nextIndex`: `2 -> 1 -> 0`
    - final move: `newIndex: 7`
    - backend response: `200`
  - failing geometry variant summary:
    - dragged row height at `start`: `20`
    - `placeholder:reorder nextIndex`: `2 -> 1`
    - the final top-row hover never reaches the clean branch's last `pastHalfway: false` transition
    - final move: `newIndex: 8`
    - backend response: `200`
  - interpretation:
    - the failure boundary is the last insertion step, not collision loss and not missing backend sync
    - the row-geometry shift is perturbing the final halfway / insertion math inside the shared row contract

Committed artifact summary:

- `perf/reports/frontend/artifacts/2026-03-17_section-shell-s1-checkpoint1-drag-lifecycle-instrumentation/light-workspace-dnd-event-summary.md`

## Verification

- Clean control:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "workspace and standalone callable routes preserve reorder and tab indent behavior"` -> `2 passed`
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "light workspace and standalone callable routes preserve reorder and tab indent behavior"` -> `1 passed`
- Local failing geometry variant:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-minimum-regression.spec.ts --grep "light workspace and standalone callable routes preserve reorder and tab indent behavior"` -> failed
  - observed order after dragging `k` before `h`: `h > k > i > j`

## Next Call

- Keep checkpoint 1 open.
- Do not reopen collision filtering or backend-acknowledgement theories first; the new evidence already rejects them as the primary blocker.
- Aim the next lower-seam attempt at the final insertion math under the shared row geometry:
  - preserve the clean branch's last top-row `placeholder:reorder nextIndex 0` transition
  - preserve `newIndex: 7` on the callable representative
  - recover the shared-row geometry/typography match against untouched `main`
- If the next geometry correction returns to the row/CSS seam, prefer the shape-specific row modifier seam (`labelShapeKey`) over another blanket descendant-wrapper override.
