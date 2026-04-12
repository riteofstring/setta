# 2026-04-14 Settings Graph Required-Path Subtree Scope

- canonical lane: `rotaryParamCodeObjDefault`
- goal: cut one bounded unpinned-row fanout path by passing each
  `ParamSwitch` row only the `requiredParamIdsToPaths` entries for that row's
  own subtree instead of the whole section map
- product slice:
  - `frontend/src/components/Params/GetParamSwitch.tsx` now builds one
    ancestor-indexed map and hands each row only its subtree-scoped
    `requiredParamIdsToPaths`
  - `frontend/src/components/Params/GetParamSwitch.render-stability.test.tsx`
    now proves sibling rows receive different subtree-scoped maps
  - `frontend/src/components/Params/ParamDndList.tsx` plus the
    `settings-view-modes` allowlists keep the pinned versus unpinned row-owner
    split active so the live probe can report whether this row-local cut moves
    the remaining unpinned branch

## Focused verification

- `source activate.sh && pnpm -C frontend exec vitest run src/components/Params/GetParamSwitch.render-stability.test.tsx src/components/Params/GetParamSwitch.test.tsx src/components/Params/ParamDndList.render-stability.test.tsx src/components/Params/ParamSwitch.render-stability.test.tsx src/components/Params/GroupContainer.instrumentation.test.tsx`
  - passed (`5` files, `9` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/GetParamSwitch.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx src/components/Params/ParamDndList.tsx src/components/Params/GroupContainer.instrumentation.test.tsx tests/e2e/settings/settings-view-modes.spec.ts tests/e2e/settings/settings-view-modes-main-reference.spec.ts`
  - passed

## Live canonical probe

- first run:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-025/worktree-ai.log`
  - failed with `Worktree unhealthy: page closed while writing normalized compare pane state`
- bounded lifecycle recovery:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime facts with `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-025/worktree-ai.log`
- retry:
  - same probe command
  - passed (`1` Playwright test, `2.2m`)

## Canonical readout

- comparison baseline: `perf/reports/frontend/2026-04-14_settings-graph-param-row-owner-split-attribution.md`
- before this subtree-scope cut:
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
- after this subtree-scope cut:
  - `presentedSceneSectionParamGroupContainerReactRender`
    `561.3ms total` / `68.0ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `476.2ms total` / `63.0ms max`
  - `presentedSceneSectionUnpinnedParamDndListRowsReactRender`
    `454.3ms total` / `59.5ms max`
  - `presentedSceneSectionParamInputReactRender`
    `272.2ms total` / `17.2ms max`
  - `averageFrameDurationMs`
    `43.56`
  - `longTaskTotalDurationMs`
    `1256`

## Reading

- this cut is behaviorally correct and keeps the lane healthy, but it did not
  produce a live win on the canonical lane
- the same three narrow owners still dominate the `ParamGroupContainer` branch,
  so the next pass should not spend another iteration on adjacent row-level
  map/memo trimming
- the next real frontier is a larger reduction above this row seam:
  either remove broader `ParamGroupContainer` DOM work or shift more static
  section-body rendering out of the mounted DOM subtree
