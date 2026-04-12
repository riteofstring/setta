# Settings graph ParamGroupContainer subtree attribution

Date: 2026-04-13
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-055/worktree-ai.log`

## Context

The prior Dict-area split showed that almost all remaining Dict-path motion cost
was already inside `ParamGroupContainer`, while `KwargsControls` was too small
to justify a default optimization pass.

This pass split `ParamGroupContainer` into its three immediate owners:

- `EdgesStrip`
- pinned params
- unpinned params

## Result

- Direct-open phase sequence:
  `127ms app_router_loading` -> `2464ms settings_loading` ->
  `4025ms app_shell_without_surface` -> `7412ms project_loading` ->
  `13627ms surface_ready`
- Probe status: passed (`1` Playwright test, `1.6m`)
- Surface kind: `canary`
- Target section id: `0e9b34f0-08b2-4041-8945-86dbdb729c43`
- Dominant canary owner still remained
  `presentedSceneSectionSubtreeReactRender`

## New ParamGroupContainer split

- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`:
  `24` count / `508.0ms` total / `61.7ms` max
- `presentedSceneSectionParamGroupEdgesStripReactRender`:
  `16` count / `2.2ms` total / `0.3ms` max
- `presentedSceneSectionParamGroupPinnedParamsReactRender`:
  `16` count / `1.7ms` total / `0.6ms` max
- For reference on the same run:
  `presentedSceneSectionParamGroupContainerReactRender`:
  `24` count / `577.3ms` total / `65.5ms` max
  `presentedSceneSectionKwargsControlsReactRender`:
  `8` count / `32.4ms` total / `5.0ms` max
  `presentedSceneSectionAreaSwitchReactRender`:
  `24` count / `619.8ms` total / `71.0ms` max
  `presentedSceneSectionBodyContentReactRender`:
  `24` count / `624.6ms` total / `71.6ms` max

## Reading

- The remaining `ParamGroupContainer` motion cost on this lane is almost
  entirely inside `GetUnpinnedParams`.
- `EdgesStrip` and pinned params are effectively noise on the canonical lane.
- `KwargsControls` remains materially smaller than the unpinned params subtree.
- The next bounded frontier on this lane should move one level deeper inside
  the unpinned params path, likely around `ParamDndList` / row rendering,
  rather than reopening edge-strip, pinned-param, or `KwargsControls` work.
