# Settings Graph Motion Long-Task Phase Breakdown

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`

## Goal

Add one bounded attribution seam so the canonical live worktree motion probe
can split remaining long-task cost by motion phase instead of only reporting
aggregate long-task totals.

## Change

- added
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphMotionPerfPhases.ts`
  with the shared long-task phase names plus a pure summarizer for per-phase
  counts and durations
- added
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphMotionPerfPhases.test.ts`
  to prove the phase summarizer preserves empty buckets and aggregates
  durations correctly
- updated
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
  so motion perf capture now records each long task with the current phase
  (`captureWarmup`, `panForward`, `panReturn`, `zoomIn`, `zoomOut`,
  `postSequenceSettle`) and summarizes that breakdown after `page.evaluate`
  returns
- updated
  `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  to assert the per-phase breakdown totals still add up to the overall long-task
  count and duration

## Baseline

- fresh pre-change worktree probe on this runtime:
  - `averageFrameDurationMs`: `44.57ms`
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1247ms`
  - `longTaskMaxDurationMs`: `411ms`
  - `measurementWindowMs`: `1946.7ms`
  - dominant instrumented canary owner stayed tiny:
    `pixiDrawableModelResolve` at `1.6ms` total

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphMotionPerfPhases.test.ts`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphMotionPerfPhases.ts src/components/Pages/Project/graphSubstrate/settingsGraphMotionPerfPhases.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts tests/e2e/settings/settings-view-modes.spec.ts`
  - passed
- live worktree probe reruns after the code change:
  - first rerun exposed a real harness bug from calling the phase summarizer
    inside `page.evaluate`; fixed in the same iteration
  - second rerun after that fix still failed on this runtime because the
    target page/browser closed during compare-pane normalization before the
    probe could finish

## Reading

- the baseline confirms the current bottleneck is no longer any named canary
  motion owner; the remaining cost is in broader long tasks
- this slice lands the phase attribution needed for the next fresh-runtime
  probe to say whether those long tasks cluster before motion, during pan,
  during zoom, or during the final settle
- the remaining verification blocker is runtime health, not missing phase
  instrumentation
