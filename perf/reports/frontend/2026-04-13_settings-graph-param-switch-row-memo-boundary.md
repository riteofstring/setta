# 2026-04-13 Settings Graph ParamSwitch Row Memo Boundary

- canonical lane: `rotaryParamCodeObjDefault`
- goal: stop unchanged row wrappers from rematerializing when the parent
  `GetParamSwitch` subtree rerenders with the same row props
- product slice:
  - wrap `ParamSwitch` in `memo(...)` with deep prop equality so unchanged row
    props bail out before rebuilding the row shell / nested subtree
  - add a direct render-stability test that mocks `ParamContainer` and proves
    a parent-only rerender does not rematerialize the row boundary

## Focused verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.test.tsx src/components/Params/ParamSwitch.render-stability.test.tsx src/components/Params/GetParamSwitch.test.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx`
  - passed (`4` files, `10` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamSwitch.test.tsx src/components/Params/ParamSwitch.render-stability.test.tsx`
  - passed

## Live canonical probe

- first probe attempt on the existing worktree session timed out inside
  `fitGraphViewportToSection(...)` during shared preflight, so this iteration
  used the one allowed bounded lifecycle recovery:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-015/worktree-ai.log`
- rerun after recovery:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-015/worktree-ai.log`
  - passed (`1` Playwright test, `1.6m`)

## Canonical readout

- latest accepted lane before this slice (`item 445`):
  - `presentedSceneSectionSubtreeReactRender`
    `903.9ms total` / `230.7ms max`
  - `presentedSceneSectionBodySubtreeReactRender`
    `884.5ms total` / `132.5ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `426.4ms total` / `69.8ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `454.6ms total` / `72.0ms max`
  - `presentedSceneSectionParamInputReactRender`
    `239.3ms total` / `8.8ms max`
  - `averageFrameDurationMs`
    `not recorded in item 445`
  - `longTaskTotalDurationMs`
    `1173`

- after `ParamSwitch` row memo boundary:
  - `presentedSceneSectionSubtreeReactRender`
    `620.7ms total` / `174.0ms max`
  - `presentedSceneSectionBodySubtreeReactRender`
    `611.0ms total` / `69.9ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`
    `301.6ms total` / `38.6ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
    `321.7ms total` / `39.7ms max`
  - `presentedSceneSectionParamInputReactRender`
    `169.0ms total` / `4.7ms max`
  - `averageFrameDurationMs`
    `31.78`
  - `longTaskTotalDurationMs`
    `787`

## Reading

- this is a real live win on the active unpinned row lane, not a harness-only
  change
- dominant owner is still `presentedSceneSectionSubtreeReactRender`, but the
  unpinned row subtree dropped materially again after the `GetParamSwitch`
  memo boundary win
- next pass should stay on `rotaryParamCodeObjDefault` and either:
  - take another bounded product cut inside the remaining row/body subtree, or
  - add one attribution seam that resolves the remaining `Subtree` owner into
    a concrete next product boundary before another hypothesis
