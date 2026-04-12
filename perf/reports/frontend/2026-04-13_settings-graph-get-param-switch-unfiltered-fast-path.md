# Settings graph GetParamSwitch unfiltered fast path

Date: 2026-04-13
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-001/worktree-ai.log`

## Context

The prior attribution pass showed the remaining unpinned-param motion cost was
centered on `ParamDndList` row rendering and suggested one bounded product cut:
stop subscribing the common unfiltered `GetParamSwitch` path to the broad
project-state slice that was only needed for active param filtering.

This pass split `GetParamSwitch` into:

- a no-filter fast path that only subscribes to `paramFilter`
- a filtered path that keeps the heavier display-name lookup isolated behind an
  active filter

## Result

- Direct-open phase sequence:
  `73ms app_router_loading` -> `2321ms settings_loading` ->
  `3867ms backend_loading` -> `4393ms app_shell_without_surface` ->
  `8244ms project_loading` -> `23726ms surface_ready`
- Probe status: passed on one bounded retry after an earlier timeout during
  preflight `page.evaluate`
- Surface kind: `canary`
- Target section id: `0e9b34f0-08b2-4041-8945-86dbdb729c43`
- Dominant canary owner remained
  `presentedSceneSectionSubtreeReactRender`

## Live readout

- `presentedSceneSectionParamDndListRowsReactRender`:
  `24` count / `440.5ms` total / `68.7ms` max
- `presentedSceneSectionParamGroupUnpinnedParamsReactRender`:
  `24` count / `469.8ms` total / `70.9ms` max
- `presentedSceneSectionParamGroupContainerReactRender`:
  `24` count / `530.0ms` total / `76.4ms` max
- `presentedSceneSectionAreaSwitchReactRender`:
  `24` count / `565.4ms` total / `82.1ms` max
- `presentedSceneSectionBodyContentReactRender`:
  `24` count / `570.8ms` total / `82.5ms` max

## Reading

- This production hypothesis did not deliver a live win on the canonical lane;
  the row-handoff owner stayed dominant and measured slightly higher on the
  successful retry than the prior attribution run.
- The no-filter fast path is still a valid cleanup because it removes a broad
  subscription from the common path and is covered by a focused regression, but
  it should be treated as a closed non-winning hypothesis for hotspot
  reduction.
- The next bounded frontier on the same lane should move one level deeper into
  `ParamSwitch` row rendering or row sub-owners instead of spending another
  pass on `GetParamSwitch` filtering.
