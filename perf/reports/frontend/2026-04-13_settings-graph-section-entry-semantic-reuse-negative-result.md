## 2026-04-13 settings graph section-entry semantic reuse negative result

- Canonical lane: `settings` -> `All Settings` -> `rotaryParamCodeObjDefault`
- Goal: keep cached DOM section entries when only non-entry scene metadata
  changes, without reopening the rejected body-mount isolation lane
- Change tested and reverted:
  - relaxed `settingsGraphSubstrateCanarySectionsLayer.tsx` entry reuse so a
    cached section entry could survive `sceneSection` identity churn when the
    shell/body-facing fields still matched
  - added a focused fan-out regression proving that `sceneBoundsSize` /
    `sizeAuthority`-only changes did not remount the entry subtree
  - reverted both after the live canary did not show a measured win

### Baseline

- Last accepted baseline for this lane:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-009/worktree-ai.log`
- Prior accepted readout:
  - `presentedSceneSectionEntriesResolve`: `2.5ms total`, `0.8ms max`
  - `presentedSceneSectionSubtreeReactRender`: `818.2ms total`,
    `197.8ms max`
  - `averageFrameDurationMs`: `37.50`
  - `maxFrameDurationMs`: `316.60`
  - `slowFramesOver33_3Ms`: `5`
  - `longTaskTotalDurationMs`: `1016`

### Experiment

- Command:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-010/worktree-ai.log`
- Result with the semantic-entry-reuse patch in place:
  - `presentedSceneSectionEntriesResolve`: `1.6ms total`, `0.7ms max`
  - `presentedSceneSectionSubtreeReactRender`: `855.8ms total`,
    `279.9ms max`
  - `averageFrameDurationMs`: `39.53`
  - `maxFrameDurationMs`: `433.30`
  - `slowFramesOver33_3Ms`: `5`
  - `longTaskTotalDurationMs`: `1073`

### Reading

- The slice trimmed a small amount of tracked entry-resolution work but made the
  dominant `presentedSceneSectionSubtreeReactRender` owner worse on the live
  canonical lane.
- Because the measured win did not survive the real probe, the product patch
  and focused regression were reverted in the same iteration.
- Keep the section-entry semantic-reuse idea closed unless fresh owner evidence
  shows repeated `sceneSection` identity churn above the current subtree cost.
