## 2026-04-13 settings graph canvas section body vs AreaSwitch attribution

- lane: `rotaryParamCodeObjDefault`
- command:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-053/worktree-ai.log`
- result:
  the first live probe run reached the mounted canary and emitted the new
  attribution payload before failing only because the Playwright allowlist did
  not yet include the two new motion owners added in this slice

### Direct-open phase sequence

- `55ms app_router_loading`
- `1744ms settings_loading`
- `3294ms app_shell_without_surface`
- `7285ms project_loading`
- `12426ms surface_ready`

### Motion attribution readout

- dominant owner stayed `presentedSceneSectionSubtreeReactRender`
- `presentedSceneSectionBodyContentReactRender`: `24` count / `547.6ms` total /
  `75.1ms` max
- `presentedSceneSectionCanvasSectionBodyReactRender`: `24` count /
  `542.7ms` total / `74.4ms` max
- `presentedSceneSectionAreaSwitchReactRender`: `24` count / `542.7ms` total /
  `74.4ms` max
- `presentedSceneSectionCodeAreaReactRender`: `0` count / `0ms` total /
  `0ms` max
- `presentedSceneSectionHeaderReactRender`: `24` count / `201.7ms` total /
  `26.3ms` max

### Reading

- the remaining mounted body-content cost is not inside `CodeArea`
- the new split shows nearly all measured body-content motion cost is already
  inside the `AreaSwitch` subtree for the canonical code section
- the outer `CanvasSectionBody` shell contributes almost no measurable cost
  beyond the subtree it wraps on this lane
- the next bounded frontier should move deeper into the code-section body path
  chosen by `AreaSwitch`, not back into `CanvasSectionBody` windowing/minimize
  plumbing unless fresh evidence points there
