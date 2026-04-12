# Settings Graph Substrate Canary Pixi Host-Size Read Hypothesis

Date: 2026-04-08
Worktree: `pixijs-graph`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Hypothesis: the Pixi shell layer's per-motion `host.clientWidth` /
  `host.clientHeight` reads inside
  `prepareSettingsGraphSubstrateCanarySectionShellPixiViewport(...)` are still a
  meaningful hotspot on the focused canary lane.
- Product experiment: temporarily cached the Pixi host size on init / resize and
  reused that cached size during viewport-only presents.
- Outcome: the focused lane did not show a measured win, so the product change
  was reverted and this hypothesis is closed for now.

## Experiment

- Temporary product slice:
  - cached the Pixi host size in
    `settingsGraphSubstrateCanarySectionShellPixiLayer.tsx`
  - added a unit test proving viewport-only rerenders could avoid repeated
    `clientWidth` / `clientHeight` reads
- Final tree state:
  - the temporary Pixi host-size cache was reverted after live verification
    because it did not improve the measured lane
  - no production frontend change from this experiment remains landed

## Verification

Commands run during the experiment:

```bash
pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx

pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanarySectionShellPixiLayer.test.tsx

source activate.sh && cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes.spec.ts -g 'settings graph substrate canary exposes live instrumentation on normalized All Settings' --reporter=line --max-failures=1 --timeout=180000

source activate.sh && cd frontend && SETTA_BOOTSTRAP_TOKEN='<fresh worktree token>' PLAYWRIGHT_BASE_URL=http://127.0.0.1:3076 SETTA_BACKEND_ORIGIN=http://127.0.0.1:8076 SETTA_MAIN_REFERENCE_FRONTEND_URL=http://127.0.0.1:3087 SETTA_MAIN_REFERENCE_BACKEND_ORIGIN=http://127.0.0.1:8087 SETTA_MAIN_REFERENCE_BOOTSTRAP_URL='<fresh main bootstrap url>' BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 pnpm exec playwright test tests/e2e/settings/settings-view-modes-main-reference.spec.ts -g 'settings graph performance probe measures the normalized rotaryParamCodeObjDefault pan and zoom lane on read-only main legacy and worktree canary' --reporter=line --max-failures=1 --timeout=180000
```

Results from the temporary branch state:

- focused canary instrumentation stayed behaviorally stable:
  - auto-fit: mounted scene sections `46`, mounted section bodies `0`,
    `pixiDrawableCount` `42`, `pixiSyncCount` `1`, `sceneSyncCount` `2`
  - focused fit-view baseline: mounted section bodies `1`,
    `pixiDrawableCount` `1`, `pixiSyncCount` `1`, `sceneSyncCount` `2`
  - after normalized blank-pane pan: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`, `sceneSyncCount` `2`
  - after one toolbar zoom-in: mounted section bodies `1`,
    `pixiDrawableCount` `2`, `pixiSyncCount` `1`, `sceneSyncCount` `2`
- normalized motion-perf output on the same runtime pair:
  - legacy `main`: average `17.80ms`, max `83.3ms`, `44` samples, long-task
    total `144ms`, visible section count `46`
  - worktree canary: average `20.15ms`, max `116.7ms`, `43` samples, long-task
    total `187ms`, visible section count `1`

## Reading

- The temporary cache removed a real layout-read shape, but the canonical lane
  did not improve in the measured live probe.
- Because the lane stayed behaviorally stable while the motion sample remained
  worse than the prior landed result on this frontier, the Pixi host-size read
  path is not the right default next slice.
- The next product pass should stay on `rotaryParamCodeObjDefault` and target
  the deeper per-motion viewport mirror / store-sync path instead of reopening
  this Pixi host-size hypothesis.
