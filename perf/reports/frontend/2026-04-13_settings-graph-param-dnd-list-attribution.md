# Settings graph ParamDndList attribution

Date: 2026-04-13
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-056/worktree-ai.log`

## Context

The prior ParamGroupContainer split showed that almost all remaining motion cost
on the canonical lane already lived inside the unpinned params subtree.

This pass split the immediate `ParamDndList` owners on that same subtree into:

- duplicate-index resolution
- DnD tree resolution
- row-render handoff into `GetParamSwitch`

## Result

- Direct-open phase sequence:
  `52ms app_router_loading` -> `2187ms settings_loading` ->
  `3713ms backend_loading` -> `4307ms app_shell_without_surface` ->
  `7320ms project_loading` -> `13410ms surface_ready`
- Probe status: passed (`1` Playwright test, `1.4m`)
- Surface kind: `canary`
- Target section id: `0e9b34f0-08b2-4041-8945-86dbdb729c43`
- Dominant canary owner still remained
  `presentedSceneSectionSubtreeReactRender`

## New ParamDndList split

- `presentedSceneSectionParamDndListRowsReactRender`:
  `24` count / `391.5ms` total / `54.9ms` max
- `presentedSceneSectionParamDndListDuplicateIndexResolve`:
  `32` count / `1.5ms` total / `0.2ms` max
- `presentedSceneSectionParamDndListTreeResolve`:
  `0` count / `0ms` total / `0ms` max
- For reference on the same run:
  `presentedSceneSectionParamGroupUnpinnedParamsReactRender`:
  `24` count / `420.7ms` total / `57.3ms` max
  `presentedSceneSectionParamGroupContainerReactRender`:
  `24` count / `469.6ms` total / `61.8ms` max
  `presentedSceneSectionAreaSwitchReactRender`:
  `24` count / `507.3ms` total / `68.5ms` max
  `presentedSceneSectionBodyContentReactRender`:
  `24` count / `511.9ms` total / `68.9ms` max

## Reading

- The remaining unpinned params motion cost on this canonical lane is now
  concentrated in row rendering rather than duplicate-index prep.
- The DnD tree path is inactive for this scenario, so it is not part of the
  current hotspot.
- The next bounded frontier on this lane should go one level deeper into the
  row-render path itself, likely `GetParamSwitch` filtering versus
  `ParamSwitch` row rendering, instead of spending another pass on DnD tree
  setup or duplicate-index work.
