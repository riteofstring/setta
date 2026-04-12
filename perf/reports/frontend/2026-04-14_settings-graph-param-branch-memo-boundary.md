# 2026-04-14 Settings Graph Param Branch Memo Boundary

- canonical lane: `rotaryParamCodeObjDefault`
- goal: keep `ParamGroupContainer`-local rerenders from rematerializing the
  pinned/unpinned param branches when the parent updates for unrelated local
  state such as waiting overlays or observer-driven bookkeeping
- product slice:
  - wrap `GetPinnedParams`, `PinnedParamsArea`, and `GetUnpinnedParams` in
    local memo boundaries inside
    `frontend/src/components/Params/GroupContainer.tsx`
  - add a render-stability regression proving
    `useWaitingForLSPResult.parametersRequest[sectionId]` updates do not
    rematerialize the mounted `ParamDndList` subtree

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/GroupContainer.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`2` files, `3` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GroupContainer.tsx src/components/Params/GroupContainer.render-stability.test.tsx`
  - passed

## Live canonical probe

- rerun:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-014/worktree-ai.log`
  - first attempt failed with Playwright browser/page-context teardown during
    pane normalization
  - second bounded retry passed (`1` Playwright test, `50.4s`)

## Canonical readout

- prior param-group baseline (`item 453`):
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

- after the param-branch memo boundary:
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

## Reading

- this slice keeps the active frontier inside the same param-group lane and
  lands a real product reduction rather than another attribution-only pass
- the narrow-owner stack still points at
  `presentedSceneSectionParamGroupContainerReactRender`, but the totals are now
  substantially lower across the container, unpinned, row, and input buckets
- the next bounded product cut should stay inside the same
  `GroupContainer` / unpinned row path and target whichever remaining owner
  still forces the section body subtree to commit during the motion sequence
