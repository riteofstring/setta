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

## 2026-04-13 Reuse-Check Attribution Slice

- added three read-only motion-attribution owners so the worktree probe can
  distinguish pan-time reuse/stability work from the already-small resolve
  owners:
  - `presentedSceneSectionArrayReuseCheck`
  - `mountedSectionBodyIdSetReuseCheck`
  - `pixiDrawableReuseCheck`
- wrapped the section-array, mounted-body-id-set, and Pixi-drawable reuse
  comparisons in:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx`
- extended the shared instrumentation snapshot and test coverage in:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
- updated the worktree/reference perf probe expectations so those new
  attribution owners are treated as allowed residual canary owners when they
  appear

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`1` file, `5` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- live worktree probe reruns on run `027`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-027/worktree-ai.log`
  - first attempt:
    - failed after `180000ms`
    - timeout site:
      `setLocalPaneState(...)` inside
      `normalizeSettingsGraphComparePaneState(...)`
    - page-side error:
      `page.evaluate: Target page, context or browser has been closed`
  - second attempt before recovery:
    - failed in the same normalization flow with the same `180000ms` timeout
  - bounded lifecycle recovery:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - refreshed runtime facts via
      `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-027/worktree-ai.log`
  - retry after recovery:
    - failed after `180000ms`
    - timeout site moved earlier into
      `getSettingsGraphSurfaceKind(...)` during
      `runSettingsGraphComparePreflight(...)`

### Reading

- this slice landed the intended attribution seam and kept the changes
  read-only with focused regression coverage
- the live canary still did not produce a trustworthy post-change readout, so
  the new reuse owners have not yet been ranked against `panForward` /
  `panReturn`
- after one bounded lifecycle recovery, the active blocker is repeated
  compare-preflight timeout on the worktree probe rather than missing
  instrumentation

## 2026-04-13 Compare-Pane Normalization Hardening

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts`
  so the probe can synthesize a persisted `setta_data` payload for the compare
  pane state without needing the live page store
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  to cover payload rewriting that preserves unrelated persisted keys and the
  malformed-input reset path
- updated
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts` so compare-pane
  normalization:
  - writes the expected pane state into persisted local storage
  - reloads once and waits for the settings app shell to remount
  - reads preflight pane state from the bounded in-page store path instead of
    fragile persisted-state reads
  - detects graph surface kind through locators rather than page-side eval

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed (`1` file, `8` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts`
  - passed
- live worktree probe on run `028`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-028/worktree-ai.log`
  - before recovery:
    - multiple reruns still timed out inside compare-pane normalization while
      the page closed or stalled during persisted-state or page-eval reads
  - bounded lifecycle recovery:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - fresh worktree session: `3073af`
    - frontend/backend stayed on `http://127.0.0.1:3075/` and
      `http://127.0.0.1:8075`
  - retry after recovery:
    - passed (`1` Playwright test, `2.4m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- normalized compare-pane state now held steady before and after the motion
  sequence:
  - `overviewVisible`: `false`
  - `overviewTrueWidth`: `420`
  - `uiEditorVisible`: `false`
  - `uiEditorTrueWidth`: `260`
- post-recovery motion breakdown:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1066ms`
  - `longTaskMaxDurationMs`: `391ms`
  - `measurementWindowMs`: `1741.5ms`
  - `averageFrameDurationMs`: `39.92ms`
  - `panForward`: `2` tasks, `340ms` total, `221ms` max
  - `panReturn`: `1` task, `391ms` total, `391ms` max
  - `zoomIn`: `1` task, `186ms` total, `186ms` max
  - `zoomOut`: `1` task, `149ms` total, `149ms` max
- dominant named canary owner on the same run:
  - `presentedSceneSectionEntriesResolve`: `8.3ms` total, `2.2ms` max
- reuse-check owners stayed effectively zero on the passing run:
  - `presentedSceneSectionArrayReuseCheck`: `0ms`
  - `mountedSectionBodyIdSetReuseCheck`: `0ms`
  - `pixiDrawableReuseCheck`: `0.1ms`

### Updated Reading

- the compare-pane normalization lane is healthy again after the restart; the
  blocker is no longer `setLocalPaneState(...)` or `getSettingsGraphSurfaceKind(...)`
- the fresh readout confirms the new reuse-check owners are not the missing
  pan-time consumer
- the next attribution slice should target synchronous work outside the current
  canary owner set that still dominates `panForward` and `panReturn`

## 2026-04-13 Sections-Subtree React Render Attribution

### What changed

- added one profiler-backed canary motion owner:
  `presentedSceneSectionSubtreeReactRender`
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`
  with direct-duration recording so React profiler callbacks can write into the
  shared motion snapshot without manufacturing a wrapper timer
- wrapped the DOM sections subtree in
  `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
  with a React `Profiler` so the probe can measure actual subtree render
  duration during pan/zoom motion
- extended focused coverage in:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx`
- updated the worktree/reference motion probes to accept the new owner in:
  - `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  - `frontend/tests/e2e/settings/settings-view-modes-main-reference.spec.ts`

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx`

## 2026-04-13 Surface-Readiness Hardening

### What changed

- added
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSurfaceState.ts`
  with pure helpers that classify the current graph surface kind and the
  app-ready state from one DOM snapshot
- added
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSurfaceState.test.ts`
  to cover canary-vs-legacy resolution plus the app-ready gate
- updated
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
  so:
  - `getSettingsGraphSurfaceKind(...)` reads one DOM snapshot via
    `page.evaluate(...)` instead of issuing repeated locator count RPCs during
    compare preflight
  - `waitForSettingsGraphAppReady(...)` polls the same snapshot shape instead
    of composing multiple locator queries across the post-reload loading window

## 2026-04-13 Section-Body Identity Reuse Slice

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
  so the sections layer reuses the previous per-section body model when a
  section's body inputs are unchanged instead of rebuilding a fresh object for
  every presented section on each rerender
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  with a sibling-change regression proving only the changed section entry
  rerenders when one section body input changes

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx`
  - passed (`3` files, `23` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  - passed
- live worktree probe on run `035`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-035/worktree-ai.log`
  - result:
    - passed (`1` Playwright test, `1.9m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- normalized compare-pane state held steady before and after motion:
  - `overviewVisible`: `false`
  - `overviewTrueWidth`: `420`
  - `uiEditorVisible`: `false`
  - `uiEditorTrueWidth`: `260`
- post-change motion readout:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1144ms`
  - `longTaskMaxDurationMs`: `416ms`
  - `measurementWindowMs`: `1789ms`
  - `averageFrameDurationMs`: `41.08ms`
  - `panForward`: `2` tasks, `423ms` total, `261ms` max
  - `panReturn`: `1` task, `416ms` total, `416ms` max
  - `zoomIn`: `1` task, `147ms` total, `147ms` max
  - `zoomOut`: `1` task, `158ms` total, `158ms` max
- dominant named canary owner stayed
  `presentedSceneSectionSubtreeReactRender`
  (`894.2ms` total, `262.3ms` max, `30` commits)

### Reading

- this slice produced a small live win on the same dominant owner versus run
  `034`:
  `presentedSceneSectionSubtreeReactRender` moved from
  `899.5ms` / `264.5ms` to `894.2ms` / `262.3ms`
- the owner still dominates the normalized motion burst, so the lane remains
  open
- the next bounded product cut should stay on the same subtree and target
  remaining shell/body commit fan-out for unchanged visible sections rather than
  reopening harness work

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSurfaceState.test.ts`
  - passed (`1` file, `4` tests)
- `pnpm -C frontend exec prettier --write tests/e2e/settings/graphSubstrateParityProbe.ts src/components/Pages/Project/graphSubstrate/settingsGraphSurfaceState.ts src/components/Pages/Project/graphSubstrate/settingsGraphSurfaceState.test.ts`
  - completed
- live worktree probe on run `033`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-033/worktree-ai.log`
  - result:
    - passed (`1` Playwright test, `2.2m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- probe preflight no longer stalled at `getSettingsGraphSurfaceKind(...)`; the
  lane completed on the first run of the current runtime
- post-change motion breakdown:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1450ms`
  - `longTaskMaxDurationMs`: `532ms`
  - `measurementWindowMs`: `2176.4ms`
  - `averageFrameDurationMs`: `48.86ms`
  - `panForward`: `2` tasks, `499ms` total, `312ms` max
  - `panReturn`: `1` task, `532ms` total, `532ms` max
  - `zoomIn`: `1` task, `193ms` total, `193ms` max
  - `zoomOut`: `1` task, `226ms` total, `226ms` max
- dominant named canary owner on the same run:
  - `presentedSceneSectionSubtreeReactRender`: `1128.5ms` total,
    `327.8ms` max, `30` commits

### Updated Reading

- this support slice removed the current probe-health blocker on the canonical
  worktree lane without opening a new oracle family
- the live readout still names
  `presentedSceneSectionSubtreeReactRender` as the dominant remaining owner, so
  the next product slice should stay on that owner chain rather than returning
  to compare-preflight hardening
  - passed (`2` files, `10` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed
- live worktree probe on run `029`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-029/worktree-ai.log`
  - passed (`1` Playwright test, `2.0m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- normalized compare-pane state held steady before and after the motion
  sequence:
  - `overviewVisible`: `false`
  - `overviewTrueWidth`: `420`
  - `uiEditorVisible`: `false`
  - `uiEditorTrueWidth`: `260`
- post-change motion breakdown:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1130ms`
  - `longTaskMaxDurationMs`: `434ms`
  - `measurementWindowMs`: `1763.9ms`
  - `averageFrameDurationMs`: `40.70ms`
  - `panForward`: `2` tasks, `397ms` total, `260ms` max
  - `panReturn`: `1` task, `434ms` total, `434ms` max
  - `zoomIn`: `1` task, `170ms` total, `170ms` max
  - `zoomOut`: `1` task, `129ms` total, `129ms` max
- dominant named canary owner on the same run:
  - `presentedSceneSectionSubtreeReactRender`: `869.9ms` total, `246.0ms`
    max, `38` commits
- previously measured pure-function owners stayed small on the passing run:
  - `presentedSceneSectionEntriesResolve`: `6.7ms` total
  - `presentedSceneBodyMountFilter`: `2.0ms` total
  - `pixiDrawableModelResolve`: `0.7ms` total

### Updated Reading

- this slice closed the “missing owner” question for the canonical lane: the
  remaining measured pan cost is now primarily React render/commit work in the
  presented sections subtree rather than the already-instrumented visibility,
  mount-filter, or Pixi drawable resolution helpers
- the next product slice should target why that sections subtree still commits
  `38` times during the normalized motion burst, starting with broad mounted
  section-body / shell rerender fan-out rather than another attribution-only
  pass

## 2026-04-13 Deferred Local Zoom Publish Reduction

### What changed

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  so the canary stops mirroring local zoom interaction updates into the legacy
  React Flow transform store while local viewport interaction is still active
- the latest local viewport now flushes to the React Flow store once the
  interaction settles, preserving the last mirrored transform without
  streaming intermediate zoom churn through legacy subscribers
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  with focused coverage proving the zoomed local viewport stays authoritative
  during active interaction and only publishes after the interaction ends

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed (`1` file, `13` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed
- live worktree probe on run `030`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-030/worktree-ai.log`
  - first attempt:
    - failed after `180000ms`
    - timeout site:
      `getLocalPaneState(...)` inside
      `runSettingsGraphComparePreflight(...)`
  - bounded lifecycle recovery:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - refreshed runtime facts via
      `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-030/worktree-ai.log`
    - fresh worktree session: `b6148a`
  - retry after recovery:
    - failed after `180000ms`
    - timeout site stayed the same:
      `getLocalPaneState(...)` inside
      `runSettingsGraphComparePreflight(...)`

### Updated Reading

- this slice landed one real product reduction on the canonical lane, but the
  live worktree perf probe did not produce a trustworthy post-change readout
  because compare-preflight timed out twice at the same pane-state read site
  even after the one allowed lifecycle recovery
- treat the reduction as code-complete with focused unit coverage; do not claim
  a measured motion win from this pass
- the repeated blocker is now the worktree probe’s
  `getLocalPaneState(...)` preflight path on run `030`, so the next iteration
  should resolve or narrow that runtime blocker before drawing new perf
  conclusions from this lane

## 2026-04-13 Scene-Snapshot Structural Reuse

### What changed

- changed
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.ts`
  so scene snapshot rebuilds now reuse unchanged per-section scene objects from
  the previous snapshot instead of cloning every section whenever any geometry
  changes
- the resolver now also returns the previous full snapshot object when every
  section and the scene bounds stay equal, keeping downstream presented-section
  consumers on the same reference during no-op scene syncs
- updated
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneRuntime.ts`
  to pass the previous snapshot into the resolver
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.test.ts`
  with regressions proving unchanged section refs survive a sibling geometry
  update and that a fully equal rebuild reuses the prior snapshot object

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.test.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  - passed (`4` files, `31` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySceneSnapshot.test.ts`
  - passed
- live worktree probe on run `034`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-034/worktree-ai.log`
  - first attempt:
    - failed after `180000ms`
    - timeout site:
      `waitForSettingsGraphComparePaneChrome(...)`
      at `overview-pane-fullscreen-button`
  - bounded lifecycle recovery:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - refreshed runtime facts via
      `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-034/worktree-ai.log`
    - fresh worktree session: `ed4e7d`
  - retry after recovery:
    - passed (`1` Playwright test, `2.5m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- normalized compare-pane state held steady before and after the motion
  sequence:
  - `overviewVisible`: `false`
  - `overviewTrueWidth`: `420`
  - `uiEditorVisible`: `false`
  - `uiEditorTrueWidth`: `260`
- post-change motion breakdown:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1160ms`
  - `longTaskMaxDurationMs`: `420ms`
  - `measurementWindowMs`: `1828.8ms`
  - `averageFrameDurationMs`: `41.29ms`
  - `panForward`: `2` tasks, `406ms` total, `271ms` max
  - `panReturn`: `1` task, `420ms` total, `420ms` max
  - `zoomIn`: `1` task, `190ms` total, `190ms` max
  - `zoomOut`: `1` task, `144ms` total, `144ms` max
- dominant named canary owner on the same run:
  - `presentedSceneSectionSubtreeReactRender`: `899.5ms` total,
    `264.5ms` max, `30` commits
- previously measured pure-function owners stayed small on the passing run:
  - `presentedSceneSectionEntriesResolve`: `7.9ms` total
  - `presentedSceneBodyMountFilter`: `0.9ms` total
  - `pixiDrawableModelResolve`: `1.5ms` total

### Updated Reading

- this is a real product reduction on the canonical lane:
  `presentedSceneSectionSubtreeReactRender` dropped from the last passing
  `1128.5ms` / `327.8ms` readout to `899.5ms` / `264.5ms` on the same named
  lane after the retry
- the same owner still dominates the motion burst, so the next bounded product
  slice should stay on subtree commit fan-out rather than reopening verifier
  hardening

## 2026-04-13 Persisted Pane-State Read Fallback

### What changed

- changed
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
  so `getLocalPaneState(...)` first reads the normalized compare pane state
  from Playwright browser-context storage for the current origin before it
  falls back to the slower in-page store import path
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts`
  with a pure helper that reads persisted pane state directly from browser
  storage-state snapshots
- extended
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  with focused coverage for the browser-storage helper on valid and malformed
  persisted payloads

### Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts`
  - passed (`1` file, `10` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.ts src/components/Pages/Project/graphSubstrate/settingsGraphPersistedPaneState.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts`
  - passed
- live worktree probe on run `031`
  - command:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-031/worktree-ai.log`
  - first attempt:
    - failed after `180000ms`
    - timeout site moved off the old pane-state read and into
      `setLocalPaneState(...)` during compare-pane normalization because the
      target page/context closed
  - bounded lifecycle recovery:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
    - refreshed runtime facts via
      `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-031/worktree-ai.log`
    - fresh worktree session: `b8640c`
  - retry after recovery:
    - passed (`1` Playwright test, `2.5m`)

### Fresh Readout

- canonical lane: `rotaryParamCodeObjDefault`
- normalized compare-pane state held steady before and after the motion
  sequence:
  - `overviewVisible`: `false`
  - `overviewTrueWidth`: `420`
  - `uiEditorVisible`: `false`
  - `uiEditorTrueWidth`: `260`
- post-change motion breakdown:
  - `longTaskCount`: `5`
  - `longTaskTotalDurationMs`: `1247ms`
  - `longTaskMaxDurationMs`: `447ms`
  - `measurementWindowMs`: `1941.3ms`
  - `averageFrameDurationMs`: `44.57ms`
  - `panForward`: `2` tasks, `454ms` total, `264ms` max
  - `panReturn`: `1` task, `447ms` total, `447ms` max
  - `zoomIn`: `1` task, `166ms` total, `166ms` max
  - `zoomOut`: `1` task, `180ms` total, `180ms` max
- dominant named canary owner on the same run:
  - `presentedSceneSectionSubtreeReactRender`: `959.4ms` total, `280.3ms`
    max, `39` commits
- the deferred local zoom publish owner stayed at zero on the same run:
  - `reactFlowViewportPublish`: `0ms`

### Updated Reading

- this verifier slice resolved the repeated `getLocalPaneState(...)`
  preflight timeout strongly enough to recover a trustworthy live readout on
  the same canonical lane
- the run-`031` readout does not show a measurable win from the deferred local
  zoom publish reduction; the dominant owner remains
  `presentedSceneSectionSubtreeReactRender`
- default sequencing should stop on verifier repair here and return to product
  work that reduces section-subtree rerender fan-out on the same lane
