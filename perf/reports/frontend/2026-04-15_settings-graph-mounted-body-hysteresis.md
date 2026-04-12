# Settings Graph Mounted-Body Hysteresis

Date: 2026-04-15
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce pan-time DOM section-subtree churn on the canary path by keeping an
already-mounted section body alive through a small below-threshold viewport-edge
 movement instead of immediately unmounting it.

## Change

- added a narrow body-mount hysteresis window in
  `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts`
  so already-mounted bodies use a lower visible-screen threshold than first
  mounts
- threaded the previous mounted-body id set through:
  - `frontend/src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx`
- added focused coverage for:
  - sticky body mounting through a small below-threshold pan
  - eventual unmount once the section is fully offscreen
  - section-layer fan-out staying out of body rerenders on that small
    threshold-edge motion

## Baseline

- prior live worktree attribution on the same named lane from
  `perf/reports/frontend/2026-04-13_direct-settings-open-phase-classification.md`
  still showed `presentedSceneSectionSubtreeReactRender` as the dominant motion
  owner while the earlier `reactFlowViewportPublish` owner remained `0`

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  - passed (`2` files, `20` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.ts src/components/Pages/Project/graphSubstrate/SettingsGraphSubstrateCanary.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionPresentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionsLayerFanout.test.tsx`
  - passed
- attempted live worktree probe:
  - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-settings-graph-worktree-probe.sh --worktree . --worktree-runtime-log /tmp/codex-supervisor.FqYaPr/loop-001/run-025/worktree-ai.log`
  - failed before test discovery with the existing runner/tooling drift:
    `section_ui_editor_tab_compatibility.json needs an import attribute of type "json"`
- CDP visual smoke on `http://127.0.0.1:3053/settings`
  - mounted successfully
  - graph surface visible in normal view
  - no obvious blank-card or detached-body artifact

## Reading

- this is a real product-side reduction on the current section-subtree owner,
  not another harness-only slice
- the intended effect is to reduce mount/unmount churn at the viewport edge
  during small pan/zoom motions without keeping fully offscreen bodies mounted
- live before/after motion numbers are still pending because the trusted
  Playwright runner path is currently blocked by the known JSON-import failure,
  so this slice should be treated as landed with focused regression coverage and
  pending runtime attribution confirmation
