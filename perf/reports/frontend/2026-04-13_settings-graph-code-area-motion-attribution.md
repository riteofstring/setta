# Settings Graph Code Area Motion Attribution

Date: 2026-04-13
Worktree: `pixijs-graph`
Canonical target section: `rotaryParamCodeObjDefault`

## Goal

Split the mounted body-content attribution lane one level deeper so the probe can answer whether the canonical code section still spends motion time inside `CodeArea` itself or in the surrounding mounted body subtree.

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Section/Layouts/CodeArea.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Section/Layouts/CodeArea.tsx src/components/Section/Layouts/CodeArea.test.tsx`
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.2KScG0/loop-001/run-052/worktree-ai.log`

## Direct-open phase sequence

- `46ms` `app_router_loading`
- `2254ms` `settings_loading`
- `3935ms` `app_shell_without_surface`
- `7466ms` `project_loading`
- `12690ms` `surface_ready`

## Motion attribution readout

- Dominant owner stayed `presentedSceneSectionSubtreeReactRender` at `857.3ms` total / `248.8ms` max.
- Mounted body subtree stayed high at `presentedSceneSectionBodySubtreeReactRender` `838.3ms` total / `101.5ms` max.
- Mounted body content remained substantial at `presentedSceneSectionBodyContentReactRender` `515.7ms` total / `62.9ms` max.
- New inner code editor owner stayed inactive on this motion lane:
  `presentedSceneSectionCodeAreaReactRender` `0` count / `0ms` total / `0ms` max.
- Header branch remained smaller:
  `presentedSceneSectionHeaderReactRender` `205.4ms` total / `35.2ms` max.

## Reading

The canonical pan/zoom lane is not spending measurable motion time re-rendering `CodeArea` itself. The remaining cost is still above the editor, inside the broader mounted body subtree and shell/body-content path, so the next product cut should not target the inner code editor render path again without fresh contrary evidence.
