# Settings Graph Top-Owner Ranking Attribution

Date: 2026-04-14
Lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan/zoom probe on `Settings -> All Settings`

## Why this slice

Item `448` reduced the active unpinned param-body lane again, but the remaining
dominant owner was still the broad
`presentedSceneSectionSubtreeReactRender` bucket. This pass added a ranked
top-owner summary to the shared motion probe so the next product cut can target
the next real boundary instead of guessing another memo seam.

## Code change

- Added shared motion-attribution ranking helpers in
  `src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.ts`
- Extended `tests/e2e/settings/graphSubstrateParityProbe.ts` so
  `stopSettingsGraphMotionPerfCapture(...)` returns
  `topCanaryMotionAttributionOwners`
- Added focused Vitest coverage for the ranking helper

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.test.ts`
  - passed
- `pnpm -C frontend exec prettier --check tests/e2e/settings/graphSubstrateParityProbe.ts src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.ts src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.test.ts`
  - passed
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-003/worktree-ai.log`
  - passed

## Live readout

- `dominantCanaryMotionAttributionOwner`
  - `presentedSceneSectionSubtreeReactRender`
- `topCanaryMotionAttributionOwners`
  - `presentedSceneSectionSubtreeReactRender`
    - `887.2ms total`, `249.8ms max`, `30` samples
  - `presentedSceneSectionBodySubtreeReactRender`
    - `874.4ms total`, `115.0ms max`, `32` samples
  - `presentedSceneSectionContainerReactRender`
    - `861.4ms total`, `113.9ms max`, `32` samples
  - `presentedSceneSectionCoreShellLayerReactRender`
    - `856.2ms total`, `113.4ms max`, `32` samples
  - `presentedSceneSectionBodyContentReactRender`
    - `568.9ms total`, `87.5ms max`, `24` samples
- context counters
  - `averageFrameDurationMs`: `41.47`
  - `longTaskTotalDurationMs`: `1162`
  - `longTaskMaxDurationMs`: `453`
  - `sampleCount`: `43`
  - `visibleSectionCount`: `1`
  - `rootDomNodeCount`: `129`
  - `sectionDomNodeCount`: `126`

## Reading

The remaining cost is still concentrated above the already-memoized row/list
boundaries. The next product slice should stay on the same canonical lane and
target the section container/body boundary named by this ranking, not reopen
another support-only probe pass.
