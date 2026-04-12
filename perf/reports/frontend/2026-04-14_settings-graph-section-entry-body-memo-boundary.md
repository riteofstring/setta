# Settings Graph Section Entry Body Memo Boundary

Date: 2026-04-14
Lane: `rotaryParamCodeObjDefault`
Status: closed hypothesis, no live win

## Why

The latest top-owner ranking still had the mounted section body path stacked
directly under the broader presented section subtree. This slice tested whether
shell-only motion rerenders were still re-entering the mounted body subtree
because the body profiler sat inline inside `SettingsGraphSubstrateCanarySectionEntry`.

## Change

- moved the mounted canary body subtree behind its own memo boundary in
  `settingsGraphSubstrateCanarySectionsLayer.tsx`
- kept the shell entry rerender path separate so section transform / drag-state
  updates can reuse the mounted body subtree when `sectionBody` and
  `shouldMountBody` stay stable
- tightened the fanout test to prove position-only and drag-only shell rerenders
  no longer re-enter the mounted body subtree

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
- `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.j3RAmS/loop-001/run-004/worktree-ai.log`

## Canonical live readout

Comparison baseline: item `449` from the handoff (`2026-04-14 05:22 UTC`).

- `presentedSceneSectionSubtreeReactRender`
  `887.2ms total` / `249.8ms max` / `30` samples -> `933.6ms total` /
  `342.3ms max` / `30` samples
- `presentedSceneSectionBodySubtreeReactRender`
  `874.4ms total` / `115.0ms max` / `32` samples -> `915.7ms total` /
  `152.4ms max` / `32` samples
- `presentedSceneSectionContainerReactRender`
  `861.4ms total` / `113.9ms max` / `32` samples -> `906.4ms total` /
  `151.5ms max` / `32` samples
- `presentedSceneSectionCoreShellLayerReactRender`
  `856.2ms total` / `113.4ms max` / `32` samples -> `897.8ms total` /
  `150.9ms max` / `32` samples
- `presentedSceneSectionBodyContentReactRender`
  `568.9ms total` / `87.5ms max` / `24` samples -> `579.8ms total` /
  `118.1ms max` / `24` samples
- `longTaskTotalDurationMs`
  `1162` -> `1151`
- `averageFrameDurationMs`
  `41.47` -> `39.00`

## Reading

The isolated fanout path improved, but the canonical live lane did not produce
the expected subtree reduction. The dominant owner order is unchanged, which
means shell-only entry rerenders are not the main remaining cost on the live
canary. Keep this hypothesis closed and pivot the next product cut to the
store-subscribed section container/body path rather than adding more entry-level
memo layers.
