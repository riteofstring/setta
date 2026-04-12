# 2026-04-14 Settings Graph Unpinned Scrollability Row Boundary

- canonical lane: `rotaryParamCodeObjDefault`
- goal: keep observer-driven unpinned scrollability churn from rematerializing
  the mounted `ParamDndList` row subtree inside `ParamGroupContainer`
- product slice:
  - split the unpinned branch in
    `frontend/src/components/Params/GroupContainer.tsx` so the
    `useIsScrollable()` observer state stays in `UnpinnedParamsArea` while the
    mounted row list renders through its own memoized
    `UnpinnedParamsRows` child
  - extend the render-stability regression to prove scrollability observer
    updates do not rematerialize `ParamDndList`

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `4` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.render-stability.test.tsx`
  - passed

## Live canonical probe

- rerun:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-015/worktree-ai.log`
  - passed (`1` Playwright test, `52.1s`)

## Canonical readout

- prior param-group baseline (`item 454`):
  - `presentedSceneSectionParamGroupContainerReactRender`
    `464.9ms total` / `58.1ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `413.9ms total` / `55.0ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `399.8ms total` / `53.4ms max`
  - `presentedSceneSectionParamInputReactRender`
    `226.3ms total` / `8.6ms max`
  - `averageFrameDurationMs`
    `38.15`
  - `longTaskTotalDurationMs`
    `1074`

- after the unpinned scrollability row boundary:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `470.1ms total` / `60.2ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `415.2ms total` / `56.6ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `397.6ms total` / `54.2ms max`
  - `presentedSceneSectionParamInputReactRender`
    `223.3ms total` / `8.2ms max`
  - `averageFrameDurationMs`
    `38.37`
  - `longTaskTotalDurationMs`
    `1062`

## Reading

- this lands a real production boundary plus a focused regression on the active
  `GroupContainer` / unpinned row lane, but the live canary result is
  effectively flat
- the row and input buckets improved slightly while the parent container and
  unpinned wrapper buckets drifted slightly upward, so treat this as a
  stability/isolation step rather than a fresh live win
- the next bounded iteration should not keep stacking similar memo boundaries
  blindly; use the canonical lane data to pick a different production seam or
  fresh attribution split inside the remaining
  `presentedSceneSectionParamGroupContainerReactRender` hotspot
