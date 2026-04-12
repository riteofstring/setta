## 2026-04-13 settings graph section-entry element reuse

- Canonical lane: `settings` -> `All Settings` -> `rotaryParamCodeObjDefault`
- Goal: cut repeated section-entry reconciliation work inside
  `settingsGraphSubstrateCanarySectionsLayer.tsx` without reopening the
  rejected body-mount isolation lane
- Change:
  - cache per-section `<SettingsGraphSubstrateCanarySectionEntry />` elements by
    `sectionId`
  - reuse the prior element when the section ref, cached body model, drag
    state, and body-mount gate are unchanged
  - reuse the full ordered entry array when every element in the pass is
    unchanged

### Baseline

- Command:
  `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-009/worktree-ai.log`
- Result:
  - `presentedSceneSectionEntriesResolve`: `4.3ms total`, `0.5ms max`
  - `presentedSceneSectionSubtreeReactRender`: `820.2ms total`,
    `216.9ms max`
  - `averageFrameDurationMs`: `39.14`
  - `maxFrameDurationMs`: `350.10`
  - `slowFramesOver33_3Ms`: `6`
  - `longTaskTotalDurationMs`: `1030`

### After

- Same command after the patch
- Result:
  - `presentedSceneSectionEntriesResolve`: `2.5ms total`, `0.8ms max`
  - `presentedSceneSectionSubtreeReactRender`: `818.2ms total`,
    `197.8ms max`
  - `averageFrameDurationMs`: `37.50`
  - `maxFrameDurationMs`: `316.60`
  - `slowFramesOver33_3Ms`: `5`
  - `longTaskTotalDurationMs`: `1016`

### Reading

- The dominant owner is still `presentedSceneSectionSubtreeReactRender`, but
  this cut removed most of the tracked section-entry assembly time on the
  canonical motion lane.
- Container/body subtree totals stayed roughly flat, so the next bounded cut
  should stay above the body-mount boundary and target the remaining subtree
  reconciliation cost directly.
