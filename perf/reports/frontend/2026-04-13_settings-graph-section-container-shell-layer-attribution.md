# Settings Graph Section Container Shell-Layer Attribution

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Command:

```bash
env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 \
  ./scripts/run-settings-graph-worktree-probe.sh \
  --worktree . \
  --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-005/worktree-ai.log
```

Runtime:

- first post-change probe reached the live canary and exposed the new owners, but failed on the stale allowlist
- second retry hit the known `page already closed before writing normalized compare pane state` lifecycle failure
- bounded recovery: `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
- verified refreshed runtime with `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-005/worktree-ai.log`
- final rerun passed on session `739ed1`

Passing readout:

- direct-open phases:
  - `103ms app_router_loading`
  - `1767ms settings_loading`
  - `2849ms app_shell_without_surface`
  - `6900ms project_loading`
  - `12218ms surface_ready`
- motion window: `1833.5ms`
- average frame duration: `41.29ms`
- max frame duration: `433.3ms`
- long tasks: `5`, total `1146ms`, max `423ms`
- dominant owner remained `presentedSceneSectionSubtreeReactRender` (`924.1ms total`, `287.2ms max`)
- new split owners:
  - `presentedSceneSectionContainerReactRender`: `890.8ms total`, `109.1ms max`
  - `presentedSceneSectionCoreShellLayerReactRender`: `872.0ms total`, `107.3ms max`
  - `presentedSceneSectionBodySubtreeReactRender`: `902.1ms total`, `109.9ms max`
  - `presentedSceneSectionBodyContentReactRender`: `587.5ms total`, `73.8ms max`
  - `presentedSceneSectionAreaSwitchReactRender`: `582.9ms total`, `73.4ms max`
  - `presentedSceneSectionParamGroupContainerReactRender`: `538.7ms total`, `68.1ms max`
  - `presentedSceneSectionParamDndListRowsReactRender`: `456.3ms total`, `63.8ms max`
  - `presentedSceneSectionParamInputReactRender`: `241.0ms total`, `9.2ms max`

Reading:

- the remaining body-path cost is concentrated in the top-level section container and shell-layer core path
- the earlier `ParamInput -> ParamUI` stabilization still looks secondary on this lane after the new split
- the next bounded product hypothesis should target shell-layer section container subscriptions / shell chrome work above `AreaSwitch`, not another param-row leaf
