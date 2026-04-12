# 2026-04-14 Settings Graph Inactive Param Sortable Bypass

- canonical lane: `rotaryParamCodeObjDefault`
- goal: remove dormant `useSortable(...)` work from real param rows when
  param drag is inactive so the normal canary no longer pays sortable-hook
  cost inside the unpinned row subtree
- product slice:
  - `frontend/src/components/Params/ParamSwitch.tsx` now routes real rows
    through a static non-sortable path whenever `useParamDndContext()?.enabled`
    is false, preserving the sortable path only for active param-drag mode
  - `frontend/src/components/Params/ParamSwitch.render-stability.test.tsx`
    now proves the inactive path bypasses `useSortable(...)` while the active
    path still keeps sortable wiring

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.render-stability.test.tsx src/components/Params/ParamSwitch.test.tsx`
  - passed (`2` files, `9` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamSwitch.render-stability.test.tsx`
  - passed

## Live canonical probe

- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-017/worktree-ai.log`
  - passed (`1` Playwright test, `1.8m`)

## Canonical readout

- previous row-split baseline (`item 456`):
  - `presentedSceneSectionParamGroupContainerReactRender`
    `531.6ms total` / `72.7ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `464.6ms total` / `68.6ms max`
  - `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
    `444.6ms total` / `64.7ms max`
  - `presentedSceneSectionParamInputReactRender`
    `243.5ms total` / `12.2ms max`
  - `averageFrameDurationMs`
    `40.15`
  - `longTaskTotalDurationMs`
    `1145`

- after the inactive sortable bypass:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `553.0ms total` / `119.1ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `489.4ms total` / `110.9ms max`
  - `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
    `466.2ms total` / `103.8ms max`
  - `presentedSceneSectionParamInputReactRender`
    `303.3ms total` / `75.0ms max`
  - `averageFrameDurationMs`
    `42.63`
  - `longTaskTotalDurationMs`
    `1215`

## Reading

- this is a valid production simplification, but it is not a win on the
  canonical lane; the measured unpinned-row hotspot regressed slightly instead
- close this specific hypothesis unless fresh attribution later shows dormant
  sortable wiring reappearing in a different motion phase
- the next bounded product slice should stay on the canonical lane but move
  higher in the still-dominant row/body subtree rather than stacking more
  inactive-drag micro-cuts inside `ParamSwitch`
