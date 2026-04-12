# 2026-04-14 Settings Graph Duplicate Index Cache

- canonical lane: `rotaryParamCodeObjDefault`
- goal: stop rebuilding the param duplicate-name index on unrelated store
  updates so the unpinned canary path does not pay that cost during camera
  motion

## Change

- added a cache in
  `frontend/src/state/actions/params/paramDuplicateIndex.ts`
  keyed by the effective section impl plus the `codeObjs`,
  `codeObjVariants`, and `codeObjImpls` map identities
- this keeps `buildParamDuplicateIndex(...)` behavior identical, but reuses the
  previous index when camera/view updates churn unrelated project-state slices
- added
  `frontend/src/state/actions/params/paramDuplicateIndex.test.ts`
  to prove:
  - unrelated project-state updates reuse the cached index
  - changing a param name invalidates the cache and rebuilds the names map

## Focused verification

- `pnpm -C frontend exec vitest run src/state/actions/params/paramDuplicateIndex.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`2` files, `8` tests)
- `pnpm -C frontend exec prettier --write src/state/actions/params/paramDuplicateIndex.ts src/state/actions/params/paramDuplicateIndex.test.ts`

## Live canonical probe

- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-027/worktree-ai.log`
  - passed (`1` Playwright test, `1.6m`)

## Canonical readout

Comparison baseline: item `466` in the active handoff.

- `averageFrameDurationMs`
  - `39.02` -> `43.02`
- `longTaskTotalDurationMs`
  - `1099` -> `1221`
- `presentedSceneSectionParamGroupContainerReactRender`
  - `487.3ms total` / `57.8ms max` -> `521.5ms total` / `67.6ms max`
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
  - `429.2ms total` / `54.5ms max` -> `459.2ms total` / `64.5ms max`
- `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
  - `411.1ms total` / `51.9ms max` -> `444.9ms total` / `62.6ms max`
- `presentedSceneSectionParamDndListDuplicateIndexResolve`
  - `16` calls / non-top residual cost -> `16` calls / `0ms total`

## CDP visual check

- done in a fresh-context sub-agent on the current worktree runtime
- `/settings` loaded cleanly with `All Settings` active
- `rotaryParamCodeObjDefault` was visible and the canary graph surface looked
  healthy with no obvious blank-card, detached-body, or severe artifact

## Reading

- this slice eliminated the duplicate-index bucket itself, but it did not
  improve the canonical lane and the main narrow owners regressed
- close this duplicate-index cache hypothesis as a non-winning product cut
  instead of stacking more cache work nearby by proximity
- the next slice should return to the larger live owners above this helper:
  `ParamGroupContainer`, `ParamGroupUnpinnedParams`, or a first scene-owned
  static body cut if fresh evidence supports it
