# Settings graph GetParamSwitch memo boundary

Date: 2026-04-13
Canonical lane: `settings` -> `All Settings` -> `rotaryParamCodeObjDefault`
Command:

```bash
env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 \
  ./scripts/run-settings-graph-worktree-probe.sh \
  --worktree . \
  --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-012/worktree-ai.log
```

## Change

- wrapped `GetParamSwitch` in `React.memo(..., _.isEqual)` so unchanged row-list
  props can bail out before rematerializing the unpinned `ParamSwitch` subtree
  during parent churn
- added a focused render-stability test proving unchanged parent rerenders do
  not rematerialize the row list

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/GetParamSwitch.test.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx src/components/Params/ParamSwitch.test.tsx`
- `pnpm -C frontend exec prettier --write src/components/Params/GetParamSwitch.tsx src/components/Params/GetParamSwitch.test.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx`

## Live readout

- prior canonical baseline from the last live `ParamGroupContainer` split:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `579.3ms total` / `91.0ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `517.1ms total` / `88.8ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `485.9ms total` / `85.5ms max`
  - `presentedSceneSectionParamInputReactRender`
    `254.9ms total` / `10.4ms max`
  - `presentedSceneSectionSubtreeReactRender`
    `989.3ms total` / `257.3ms max`
- current live probe on the same canonical lane:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `463.8ms total` / `65.0ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `406.0ms total` / `61.0ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `381.1ms total` / `59.3ms max`
  - `presentedSceneSectionParamInputReactRender`
    `212.5ms total` / `7.9ms max`
  - `presentedSceneSectionSubtreeReactRender`
    `802.5ms total` / `228.0ms max`
  - `averageFrameDurationMs`
    `43.56` -> `37.59`
  - `maxFrameDurationMs`
    `466.6` -> `366.7`
  - `longTaskTotalDurationMs`
    `1279` -> `1020`

## Reading

- the memo boundary produced a real live win on the canonical unpinned row path
  without changing the lane setup
- `ParamDndList` row work is still a dominant owner, but the remaining cost is
  now smaller and more concentrated inside the still-live row subtree
- the next bounded frontier should stay on `rotaryParamCodeObjDefault` and
  resolve the remaining owner inside the row subtree rather than reopening the
  already-closed section-entry or pinned-param lanes
