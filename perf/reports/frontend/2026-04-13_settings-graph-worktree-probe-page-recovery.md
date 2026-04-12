# Settings graph worktree probe page recovery

Date: 2026-04-13
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-014/worktree-ai.log`

## Context

The canonical worktree probe had regressed into an early `worktree_unhealthy`
failure before compare-pane normalization started:

- `Worktree unhealthy: page already closed before writing normalized compare pane state`

That blocked fresh live reads on the active `rotaryParamCodeObjDefault` lane,
so this pass hardened the probe to reopen the same `/settings` URL once when
the browser is still connected but the Playwright page has already closed.

## Change

- added a narrow lifecycle predicate in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle.ts`
  so the probe only attempts recovery for the specific
  `browserConnected && pageClosed && pageUrl` case
- added focused unit coverage in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle.test.ts`
- updated
  `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
  so `setLocalPaneState(...)` / `normalizeSettingsGraphComparePaneState(...)`
  can reopen the closed page and return the active replacement page
- updated the canonical worktree probe in
  `frontend/tests/e2e/settings/settings-view-modes.spec.ts`
  to keep using that active page handle after normalization and during restore

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle.test.ts`
  - passed (`1` file, `4` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle.ts src/components/Pages/Project/graphSubstrate/settingsGraphProbePageLifecycle.test.ts tests/e2e/settings/graphSubstrateParityProbe.ts tests/e2e/settings/settings-view-modes.spec.ts`
  - passed
- canonical live rerun:
  - passed (`1` Playwright test, `1.1m`)

## Fresh Readout

- direct-open phases:
  - `62ms app_router_loading`
  - `3263ms settings_loading`
  - `4818ms app_shell_without_surface`
  - `10890ms project_loading`
  - `21598ms surface_ready`
- motion owners:
  - `presentedSceneSectionSubtreeReactRender`: `903.9ms total`, `230.7ms max`
  - `presentedSceneSectionBodySubtreeReactRender`: `884.5ms total`, `132.5ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`: `426.4ms total`, `69.8ms max`
  - `presentedSceneSectionParamGroupUnpinnedParamsReactRender`: `454.6ms total`, `72.0ms max`
  - `presentedSceneSectionParamInputReactRender`: `239.3ms total`, `8.8ms max`
- long-task split:
  - `longTaskTotalDurationMs`: `1173`
  - `panForward`: `398ms`
  - `panReturn`: `417ms`
  - `zoomIn`: `197ms`
  - `zoomOut`: `161ms`

## Reading

- the page-recovery slice restored the canonical worktree measurement lane
  without reopening broader lifecycle/bootstrap work
- the active product frontier is still above the same row/body subtree rather
  than in compare-pane normalization
- the next bounded product or attribution cut should stay on
  `rotaryParamCodeObjDefault` and resolve the remaining
  `presentedSceneSectionSubtreeReactRender` / row-subtree cost instead of
  spending another default pass on lifecycle recovery
