# Settings graph ParamSwitch non-sortable row negative result

Date: 2026-04-13
Worktree: `pixijs-graph`
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-013/worktree-ai.log`

## Hypothesis

The current canonical lane keeps `ParamDndList` tree setup inactive, so the
common row path should not need active sortable subscriptions during ordinary
pan/zoom. The bounded product idea for this pass was:

- split real param rows into static and sortable branches
- skip `useSortable(...)` entirely when param selection / drag mode is inactive
- keep the sortable path only for the explicit selection mode

## Local verification while the patch was in place

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.test.tsx src/components/Params/GetParamSwitch.test.tsx src/components/Params/GetParamSwitch.render-stability.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamSwitch.test.tsx`

## Live readout with the hypothesis patch

- Probe status: passed (`1` Playwright test, `1.3m`)
- Surface kind: `canary`
- Target section: `rotaryParamCodeObjDefault`
- Fresh-context CDP smoke also passed on the same runtime:
  - `Settings -> All Settings` settled normally
  - graph-substrate canary mounted
  - `rotaryParamCodeObjDefault` visibly readable at normal zoom
  - no runtime console errors; only React Router future-flag warnings plus
    ordinary Vite/React DevTools notices

## Metrics

Compared against the latest accepted canonical baseline from the immediately
previous live product win on this lane (`GetParamSwitch` memo boundary):

- `presentedSceneSectionParamDndListRowsReactRender`
  - previous accepted baseline: `381.1ms total` / `59.3ms max`
  - hypothesis patch: `411.7ms total` / `69.2ms max`
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`
  - previous accepted baseline: `406.0ms total` / `61.0ms max`
  - hypothesis patch: `440.8ms total` / `72.2ms max`
- `presentedSceneSectionParamGroupContainerReactRender`
  - previous accepted baseline: `463.8ms total` / `65.0ms max`
  - hypothesis patch: `499.1ms total` / `76.9ms max`
- `presentedSceneSectionSubtreeReactRender`
  - previous accepted baseline: `802.5ms total` / `228.0ms max`
  - hypothesis patch: `877.4ms total` / `199.2ms max`
- `averageFrameDurationMs`
  - previous accepted baseline: `37.59`
  - hypothesis patch: `39.53`
- `maxFrameDurationMs`
  - previous accepted baseline: `366.7`
  - hypothesis patch: `366.6`
- `longTaskTotalDurationMs`
  - previous accepted baseline: `1020`
  - hypothesis patch: `1093`

## Reading

- This did not produce a trustworthy win on the canonical lane.
- Even if some of the delta is run-to-run variance, the hypothesis failed the
  acceptance bar for keeping extra product complexity in the tree.
- The patch was reverted after verification so the worktree does not carry this
  branch split forward as unproven churn.
- Close the non-sortable row split as the current default hypothesis for the
  unpinned row frontier unless fresh attribution later shows active sortable
  subscriptions dominating the lane.
