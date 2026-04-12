# 2026-04-14 Settings Graph ParamDndList Memo Boundary

- canonical lane: `rotaryParamCodeObjDefault`
- goal: stop unchanged param-list parents from re-entering the row subtree when
  the surrounding section body rerenders with the same list props
- product slice:
  - wrap `ParamDndList` in `memo(...)` with deep prop equality so stable list
    props bail out before re-running duplicate-index / filter selection and row
    subtree materialization
  - add a direct render-stability test that mocks `GetParamSwitch` and proves a
    parent-only rerender does not rematerialize the row-list boundary

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamDndList.render-stability.test.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx src/components/Params/ParamSwitch.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`4` files, `4` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/ParamDndList.tsx src/components/Params/ParamDndList.render-stability.test.tsx`
  - passed

## Live canonical probe

- rerun:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-002/worktree-ai.log`
  - passed (`1` Playwright test, `1.3m`)

## Canonical readout

- latest accepted lane before this slice (`item 447`):
  - `presentedSceneSectionSubtreeReactRender`
    `1351.1ms total` / `402.3ms max`
  - `presentedSceneSectionBodySubtreeReactRender`
    `1333.8ms total` / `153.0ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `668.1ms total` / `89.8ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `708.6ms total` / `93.8ms max`
  - `presentedSceneSectionParamInputReactRender`
    `375.3ms total` / `13.0ms max`
  - `averageFrameDurationMs`
    `58.33`
  - `longTaskTotalDurationMs`
    `1811`

- after `ParamDndList` memo boundary:
  - `presentedSceneSectionSubtreeReactRender`
    `952.6ms total` / `321.9ms max`
  - `presentedSceneSectionBodySubtreeReactRender`
    `933.3ms total` / `122.6ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `444.9ms total` / `64.1ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `465.8ms total` / `65.6ms max`
  - `presentedSceneSectionParamInputReactRender`
    `235.5ms total` / `9.7ms max`
  - `averageFrameDurationMs`
    `43.80`
  - `longTaskTotalDurationMs`
    `1261`

## Reading

- this is another real live win on the active unpinned param-body lane, not a
  harness-only change
- dominant owner is still `presentedSceneSectionSubtreeReactRender`, but the
  list/body subtree dropped materially again after moving the memo boundary one
  level up from `GetParamSwitch` / `ParamSwitch`
- next pass should stay on `rotaryParamCodeObjDefault` and resolve the
  remaining subtree owner into the next concrete product boundary before
  spending another hypothesis on this lane
