# Settings Graph Shell-Layer Snapshot Reuse

Date: 2026-04-13
Lane: `rotaryParamCodeObjDefault`
Command:

```bash
env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 \
  ./scripts/run-settings-graph-worktree-probe.sh \
  --worktree . \
  --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-006/worktree-ai.log
```

Change:

- reused the canary-resolved shell-layer snapshot for `SectionContainer` /
  `SectionContainerCore` instead of re-subscribing to duplicate section chrome
  state in the shell-layer DOM path
- kept the fallback store-backed path for non-canary callers

Before:

- reference report:
  `perf/reports/frontend/2026-04-13_settings-graph-section-container-shell-layer-attribution.md`
- `presentedSceneSectionContainerReactRender`: `890.8ms total`, `109.1ms max`
- `presentedSceneSectionCoreShellLayerReactRender`: `872.0ms total`,
  `107.3ms max`
- `presentedSceneSectionBodySubtreeReactRender`: `902.1ms total`,
  `109.9ms max`
- `averageFrameDurationMs`: `41.29`
- `maxFrameDurationMs`: `433.3`
- `longTaskTotalDurationMs`: `1146`

After:

- direct-open phases:
  - `51ms app_router_loading`
  - `2257ms settings_loading`
  - `3916ms app_shell_without_surface`
  - `7434ms project_loading`
  - `19596ms surface_ready`
- `presentedSceneSectionContainerReactRender`: `815.0ms total`,
  `109.7ms max`
- `presentedSceneSectionCoreShellLayerReactRender`: `796.0ms total`,
  `107.2ms max`
- `presentedSceneSectionBodySubtreeReactRender`: `825.2ms total`,
  `111.2ms max`
- `presentedSceneSectionBodyContentReactRender`: `514.8ms total`,
  `77.2ms max`
- `presentedSceneSectionAreaSwitchReactRender`: `509.8ms total`,
  `76.2ms max`
- `averageFrameDurationMs`: `38.26`
- `maxFrameDurationMs`: `366.7`
- `longTaskTotalDurationMs`: `1066`

Reading:

- this slice reduced total shell-layer/container work on the live canary
  without moving the worst single commit materially
- dominant owner is still `presentedSceneSectionSubtreeReactRender`
  (`843.0ms total`, `215.4ms max`)
- the next bounded product cut should stay above or around the remaining
  section subtree/container path, not reopen param-row leaf guesses
