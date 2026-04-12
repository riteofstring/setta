# 2026-04-14 Settings Graph Param Area Measurement Observer Split

- canonical lane: `rotaryParamCodeObjDefault`
- goal: keep resize-driven param-area min-height measurement updates out of the
  mounted pinned/unpinned row subtree so motion-time `resizeEvent` churn does
  not rematerialize the list path
- product slice:
  - move `useMeasuredParamAreaMinHeight(...)` behind a tiny
    `ParamAreaMinHeightObserver` child instead of running that hook inside the
    main pinned/unpinned row components
  - add a render-stability regression proving `resizeEvent` updates do not
    rematerialize `ParamDndList`

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.render-stability.test.tsx`
  - passed

## Live canonical probe

- rerun:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-013/worktree-ai.log`
  - passed (`1` Playwright test, `2.4m`)

## Canonical readout

- prior narrow-owner attribution baseline (`item 452`):
  - `presentedSceneSectionParamGroupContainerReactRender`
    `1034.6ms total` / `134.6ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `921.8ms total` / `127.8ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `863.1ms total` / `119.4ms max`
  - `presentedSceneSectionParamInputReactRender`
    `510.1ms total` / `24.1ms max`
  - `averageFrameDurationMs`
    `73.19`
  - `longTaskTotalDurationMs`
    `2467`

- after the observer split:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `966.5ms total` / `216.6ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `862.6ms total` / `204.9ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `819.9ms total` / `201.0ms max`
  - `presentedSceneSectionParamInputReactRender`
    `429.6ms total` / `23.2ms max`
  - `averageFrameDurationMs`
    `66.66`
  - `longTaskTotalDurationMs`
    `2241`

## Reading

- this is a modest live win on the active param-group lane, not a harness-only
  cleanup
- the total owner cost dropped across the param-group container, unpinned, row,
  and input buckets, which is consistent with resize-event measurement churn
  no longer re-entering the mounted row subtree
- the remaining dominant narrow owner is still
  `presentedSceneSectionParamGroupContainerReactRender`, so the next bounded
  product cut should stay inside the same `GroupContainer` / unpinned list path
  rather than reopening shell-level seams
