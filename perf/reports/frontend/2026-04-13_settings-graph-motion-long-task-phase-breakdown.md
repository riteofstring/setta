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

## Fresh Runtime Rerun

- worktree-only live probe on a fresh runtime:
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-024/worktree-ai.log`
  - result:
    - passed (`1` Playwright test, `1.3m`)
    - the repeated `worktree_unhealthy` blocker did not reproduce on this run
- fresh phase breakdown on the canonical `rotaryParamCodeObjDefault` lane:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1137ms`
  - `longTaskMaxDurationMs`: `395ms`
  - `measurementWindowMs`: `1797.3ms`
  - `averageFrameDurationMs`: `40.53ms`
  - dominant instrumented canary owner stayed tiny:
    `pixiDrawableModelResolve` at `1.0ms` total
- per-phase long-task split:
  - `panForward`: `2` tasks, `397ms` total, `275ms` max
  - `panReturn`: `1` task, `395ms` total, `395ms` max
  - `zoomIn`: `1` task, `182ms` total, `182ms` max
  - `zoomOut`: `1` task, `163ms` total, `163ms` max
  - `captureWarmup`: `0`
  - `postSequenceSettle`: `0`
  - `unknown`: `0`

## Updated Reading

- the long-task attribution lane is now healthy enough to use for product
  sequencing again; the blocker is no longer runtime health
- about `792ms` of the `1137ms` total clusters in the pan phases
  (`panForward` + `panReturn`), so the next bounded attribution slice should
  focus on synchronous work triggered during pan rather than zoom or warmup
- because the named canary motion owners remain near-zero on the same run, the
  next owner is likely outside the current instrumentation set and needs a
  narrow pan-phase owner split rather than another micro-optimization inside
  `pixiDrawableModelResolve` or `presentedSceneSectionVisibilityFilter`
