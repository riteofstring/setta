# Settings All Settings Motion Live Chrome Inventory Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `10337ea07` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-header-title-canvas-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Resolve the current motion-lane blocker by measuring what graph-surface chrome still stays mounted during viewport interaction after the motion-hidden body, trailing-header-controls, and header-title slices are active on the live `All Settings` surface.

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS: Playwright Chromium, headless Linux
- Viewport: `1400x900`
- Surface: `settings` -> `All Settings`
- Canonical target section: `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`
- Commands:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/SectionParts/Incrementer.tsx src/components/Section/SectionParts/Incrementer.test.tsx tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-003/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Focused Motion Inventory

- Whole-scene counts on the live worktree surface before motion:
  - `mountedSectionCount: 46`
  - `totalMotionBodyRootCount: 45`
  - `graphSurfaceButtonCount: 0`
  - `graphSurfaceInputCount: 0`
  - `graphSurfaceTextareaCount: 0`
  - `graphSurfaceIncrementerRootCount: 0`
  - `graphSurfaceIncrementerButtonCount: 0`
  - `graphSurfaceMenuTriggerCount: 46`
  - `graphSurfaceRoleSwitchCount: 156`
  - `totalTrackedChromeElementCount: 202`
- Canonical target state before motion:
  - `settings-section__browserSectionDefault`: `menuTriggerCount 1`, `roleSwitchCount 5`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
  - `settings-section__promptSectionDefault`: `menuTriggerCount 1`, `roleSwitchCount 4`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
  - `settings-section__languageServer`: `menuTriggerCount 1`, `roleSwitchCount 0`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
- Peak motion-hidden snapshot:
  - `framesWithHiddenBodies: 119 / 120`
  - `peakHiddenBodyCount: 45`
  - `hiddenHeaderControlsCount: 45`
  - `graphSurfaceButtonCount: 0`
  - `graphSurfaceInputCount: 0`
  - `graphSurfaceTextareaCount: 0`
  - `graphSurfaceIncrementerRootCount: 0`
  - `graphSurfaceIncrementerButtonCount: 0`
  - `graphSurfaceMenuTriggerCount: 46`
  - `graphSurfaceRoleSwitchCount: 0`
  - `totalTrackedChromeElementCount: 46`
- Canonical target state during motion:
  - `settings-section__browserSectionDefault`: `menuTriggerCount 1`, `roleSwitchCount 0`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
  - `settings-section__promptSectionDefault`: `menuTriggerCount 1`, `roleSwitchCount 0`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
  - `settings-section__languageServer`: `menuTriggerCount 1`, `roleSwitchCount 0`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
- Top motion survivors:
  - every top-ranked section was down to exactly one tracked element: the header menu trigger
  - no incrementer roots or incrementer buttons were present on the normalized live surface during the measured motion lane

## Fresh Dense Metrics

- `documentNodeCount: 5584`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 60`
- `raf.meanMs: 89.07`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 12911`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

## Interpretation

- The current motion-hidden lane already removes the heavy row-body/value surface during motion on `45` of `46` mounted sections.
- The remaining tracked graph-surface motion chrome is not root incrementers, buttons, inputs, or live switch bodies.
- The remaining repeated motion survivor is the per-section header menu trigger: `46` live menu-trigger roots stay mounted while the tracked chrome surface otherwise collapses from `202` elements to `46`.
- That means the next bounded motion-chrome slice, if this lane continues at all, should target header-leading menu-trigger suspension or canvas ownership rather than root incrementers.
- If a `46`-root menu-trigger reduction still does not materially move the dense motion probe, this lane should stop there and escalate to a broader renderer/perf replan instead of continuing small motion-chrome harvests by inertia.

## Verification

- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/SectionParts/Incrementer.tsx src/components/Section/SectionParts/Incrementer.test.tsx tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-003/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.2m)`
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/SectionParts/Incrementer.test.tsx`
  - result: blocked by an unrelated runner startup failure before test collection:
    - `html-encoding-sniffer` attempted `require()` on `@exodus/bytes/encoding-lite.js` and exited with `ERR_REQUIRE_ESM`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `All Settings` was active on `http://127.0.0.1:3068/settings`
  - the graph surface was mounted
  - `settings-section__browserSectionDefault`, `settings-section__promptSectionDefault`, and `settings-section__languageServer` were visually present and intact
  - no obvious blank or detached artifact appeared after one `zoom in` interaction
