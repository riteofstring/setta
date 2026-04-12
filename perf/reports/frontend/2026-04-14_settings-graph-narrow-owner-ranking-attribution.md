# Settings Graph Narrow Owner Ranking Attribution

Date: 2026-04-14
Lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan/zoom probe on `Settings -> All Settings`

## Why this slice

Items `450` and `451` were both non-winning product cuts on the canonical lane,
so the next pass had to stop guessing at another section container/body bailout
and name the next narrow live owner under the already-known cumulative section
render buckets.

## Change

- added a shared exclusion-aware ranking helper in
  `src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.ts`
- taught `tests/e2e/settings/graphSubstrateParityProbe.ts` to return
  `topCanaryNarrowMotionAttributionOwners`, which filters out the already-known
  cumulative section render owners and surfaces the next inner descendants
- added focused Vitest coverage for the exclusion path

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.test.ts`
  - passed
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.ts src/components/Pages/Project/graphSubstrate/settingsGraphMotionAttributionRanking.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts`
  - passed
- canonical live rerun:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3075 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8075 SETTA_BOOTSTRAP_TOKEN=<fresh token> pnpm -C frontend exec playwright test tests/e2e/settings/settings-view-modes.spec.ts --grep "settings graph worktree performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on the live canary" --reporter=line --timeout=180000`
    - passed (`1` Playwright test, `1.7m`)

## Live readout

- `dominantCanaryMotionAttributionOwner`
  - `presentedSceneSectionSubtreeReactRender`
- `topCanaryMotionAttributionOwners`
  - `presentedSceneSectionSubtreeReactRender`
    - `1794.6ms total`, `476.8ms max`, `30` samples
  - `presentedSceneSectionBodySubtreeReactRender`
    - `1769.9ms total`, `218.6ms max`, `32` samples
  - `presentedSceneSectionContainerReactRender`
    - `1755.8ms total`, `217.8ms max`, `32` samples
  - `presentedSceneSectionCoreShellLayerReactRender`
    - `1740.1ms total`, `217.2ms max`, `32` samples
  - `presentedSceneSectionBodyContentReactRender`
    - `1128.4ms total`, `153.2ms max`, `24` samples
- `topCanaryNarrowMotionAttributionOwners`
  - `presentedSceneSectionParamGroupContainerReactRender`
    - `1034.6ms total`, `134.6ms max`, `24` samples
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    - `921.8ms total`, `127.8ms max`, `24` samples
  - `presentedSceneSectionParamDndListRowsReactRender`
    - `863.1ms total`, `119.4ms max`, `24` samples
  - `presentedSceneSectionParamInputReactRender`
    - `510.1ms total`, `24.1ms max`, `82` samples
  - `presentedSceneSectionHeaderReactRender`
    - `455.7ms total`, `65.3ms max`, `24` samples
- context counters
  - `averageFrameDurationMs`: `73.19`
  - `longTaskTotalDurationMs`: `2467`
  - `longTaskMaxDurationMs`: `714`
  - `sampleCount`: `46`
  - `visibleSectionCount`: `1`

## Reading

The next real product frontier is no longer the broad section container/body
boundary. On the canonical lane, the narrow live cost is concentrated inside
the param-group body path, with `presentedSceneSectionParamGroupContainerReactRender`
now named as the top inner owner. The next product cut should target that
param-group / row / input subtree directly rather than another shell/container
memo guess.
