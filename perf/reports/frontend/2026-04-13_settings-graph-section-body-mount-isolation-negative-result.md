## 2026-04-13 settings graph section body mount isolation negative result

- Lane: normalized live `settings` canary on `All Settings`
- Canonical target section: `rotaryParamCodeObjDefault`
- Goal: test whether isolating the mounted DOM body subtree from shell-only motion updates reduces the dominant `presentedSceneSectionSubtreeReactRender` lane

### Hypothesis

Memoizing the mounted body subtree inside
`settingsGraphSubstrateCanarySectionsLayer.tsx` might let shell transform updates
move the section without re-entering the DOM body path when `sectionBody` and
`shouldMountBody` stay unchanged.

### Verification sequence

1. Baseline from the last healthy pre-change canary probe in this lane:
   - `presentedSceneSectionSubtreeReactRender`: `815.0ms total` / `237.9ms max`
   - `presentedSceneSectionContainerReactRender`: `790.8ms total` / `99.0ms max`
   - `presentedSceneSectionBodySubtreeReactRender`: `798.4ms total` / `99.9ms max`
   - `averageFrameDurationMs`: `37.98`
   - `longTaskTotalDurationMs`: `1003`
2. Landed the local hypothesis patch and verified focused fan-out tests.
3. First live rerun timed out after the page closed during compare-pane normalization:
   - `Worktree unhealthy: page already closed before writing normalized compare pane state`
4. Per loop policy, performed the one allowed self-recovery:
   - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
   - refreshed runtime facts with `./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.pixijs-graph/. --runtime-log /tmp/codex-supervisor.wUe785/loop-001/run-008/worktree-ai.log`
5. Healthy rerun after recovery with the hypothesis patch still applied:
   - `presentedSceneSectionSubtreeReactRender`: `901.3ms total` / `255.8ms max`
   - `presentedSceneSectionContainerReactRender`: `869.9ms total` / `116.6ms max`
   - `presentedSceneSectionBodySubtreeReactRender`: `880.0ms total` / `117.8ms max`
   - `averageFrameDurationMs`: `43.02`
   - `longTaskTotalDurationMs`: `1187`

### Reading

- The hypothesis did not produce a measured win on the canonical live lane.
- The dominant owner stayed `presentedSceneSectionSubtreeReactRender`.
- Both the section-container and body-subtree lanes regressed on the recovered
  healthy rerun instead of improving.
- The local product patch was reverted in the same iteration; no production code
  from this experiment remains.

### Next frontier

Do not reopen this exact body-mount isolation hypothesis without fresh owner
evidence. The next product cut should stay above this boundary and target the
remaining `presentedSceneSectionSubtreeReactRender` owner that still dominates
after the shell-layer/container reductions already landed.
