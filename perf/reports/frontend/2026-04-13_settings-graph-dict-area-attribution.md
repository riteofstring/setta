# Settings graph DictArea attribution

Date: 2026-04-13
Canonical lane: `rotaryParamCodeObjDefault`
Scenario: normalized live worktree canary pan + modified-wheel zoom probe on `All Settings`
Command:
`env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-054/worktree-ai.log`

## Context

The prior `CodeArea` attribution split stayed at `0` count / `0ms` on this lane.
This pass verified why: the canonical `rotaryParamCodeObjDefault` settings section is a `DictSectionImpl`, so the live `AreaSwitch` branch is `DictArea`, not `CodeArea`.

## Result

- Direct-open phase sequence:
  `69ms app_router_loading` -> `2354ms settings_loading` -> `3414ms app_shell_without_surface` -> `6942ms project_loading` -> `12585ms surface_ready`
- Probe status: passed (`1` Playwright test, `1.7m`)
- Surface kind: `canary`
- Target section id: `0e9b34f0-08b2-4041-8945-86dbdb729c43`
- Dominant canary owner still remained `presentedSceneSectionSubtreeReactRender`

## New Dict-path split

- `presentedSceneSectionParamGroupContainerReactRender`:
  `24` count / `481.0ms` total / `59.0ms` max
- `presentedSceneSectionKwargsControlsReactRender`:
  `8` count / `32.4ms` total / `5.1ms` max
- For reference on the same run:
  `presentedSceneSectionAreaSwitchReactRender`:
  `24` count / `521.2ms` total / `64.7ms` max
  `presentedSceneSectionBodyContentReactRender`:
  `24` count / `527.1ms` total / `65.3ms` max

## Reading

- The newly isolated Dict-path cost sits almost entirely in `ParamGroupContainer`.
- `KwargsControls` is present but too small to justify a default optimization pass.
- The next bounded frontier on this lane should move one level deeper inside the `ParamGroupContainer` subtree rather than reopening `CodeArea` or `KwargsControls`.
