# Settings All Settings Motion-Hidden Header Chrome State Hoist Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion inventory reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-live-chrome-inventory-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`

## Goal

Remove one more repeated motion-start / motion-settle renderer-main fanout on the canonical `settings-section__browserSectionDefault` lane by computing the motion-hidden chrome state once in `SectionContainerCoreResizable` and reusing it in `SectionHeader` and `MenuButton` instead of letting those section-header paths subscribe to `viewportInteractionActive` and section-active state independently.

## Implementation

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - now passes the already-resolved `motionHidden` decision down to section header chrome as `motionHiddenInteractionActive`
- `frontend/src/components/Section/Header/SectionHeader.tsx`
  - now treats motion-hidden trailing-header visibility as a prop-driven decision from the container instead of re-reading React Flow interaction state and section-active state locally
- `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - now hides lightweight motion-time menu triggers from the same container-owned state instead of subscribing to viewport interaction and active-section state on its own
- Focused tests:
  - `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
  - Chrome DevTools MCP, headless Chromium
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Fresh Live Results

Fresh dense rerun on the current worktree runtime recorded:

- `documentNodeCount: 5494`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `canvasCount: 1`
- `raf.meanMs: 45.52`
- `raf.p50Ms: 33.3`
- `raf.p95Ms: 50.1`
- `raf.maxMs: 816.58`
- `longTasks.count: 12`
- `longTasks.totalMs: 3667`
- `longTasks.maxMs: 821`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`
- `motionHiddenSubtreeChurn.childListMutationCount: 0`
- `motionHiddenSubtreeChurn.subtreeAddedElementCount: 0`
- `motionHiddenSubtreeChurn.subtreeRemovedElementCount: 0`

Fresh focused motion inventory on the same runtime recorded:

- before motion:
  - `graphSurfaceMenuTriggerCount: 46`
  - `graphSurfaceRoleSwitchCount: 156`
  - `graphSurfaceSectionResizeHandleCount: 138`
  - `totalTrackedChromeElementCount: 202`
- peak motion:
  - `graphSurfaceMenuTriggerCount: 1`
  - `graphSurfaceRoleSwitchCount: 0`
  - `graphSurfaceSectionResizeHandleCount: 3`
  - `hiddenBodyCount: 45`
  - `hiddenHeaderControlsCount: 45`
  - `hiddenMenuTriggerCount: 45`
  - `hiddenResizeHandleRootCount: 45`
  - `totalTrackedChromeElementCount: 1`
- canonical sections during motion:
  - `browserSectionDefault`: `motionBodyHidden true`, `motionHeaderControlsHidden true`, `motionMenuTriggerHidden true`, `menuTriggerCount 0`, `roleSwitchCount 0`, `sectionResizeHandleCount 0`
  - `promptSectionDefault`: `motionBodyHidden true`, `motionHeaderControlsHidden true`, `motionMenuTriggerHidden true`, `menuTriggerCount 0`, `roleSwitchCount 0`, `sectionResizeHandleCount 0`
  - `languageServer`: `motionBodyHidden true`, `motionHeaderControlsHidden true`, `motionMenuTriggerHidden true`, `menuTriggerCount 0`, `roleSwitchCount 0`, `sectionResizeHandleCount 0`
- remaining peak-motion survivor:
  - one non-motion-hidden section, `settings-section__codeCallableCodeObjDefault`, still kept `menuTriggerCount 1` and `sectionResizeHandleCount 3`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-live-chrome-inventory-rerun.md` on the same lane:

- peak `graphSurfaceMenuTriggerCount: 46 -> 1`
- peak `totalTrackedChromeElementCount: 46 -> 1`
- canonical `browserSectionDefault` motion-time `menuTriggerCount: 1 -> 0`
- canonical `promptSectionDefault` motion-time `menuTriggerCount: 1 -> 0`
- canonical `languageServer` motion-time `menuTriggerCount: 1 -> 0`

## Interpretation

- This is a real product slice on the renderer-main motion path, not another harness-only rerun: the motion-hidden chrome decision now comes from one section-container computation instead of multiple per-header subscriptions.
- On the live canary, that change removed `45` lightweight menu triggers from the tracked peak-motion surface and collapsed the remaining tracked chrome to one non-motion-hidden survivor section.
- The dense rerun stayed in the current post-run-037 band and materially improved long-task totals versus the noisy run-038 rerun, but it is still not the new whole-scene milestone by itself.
- The canonical `browserSectionDefault` lane remains visually intact and structurally clean, so the next pass should move to another real retained-scene redraw / snapshot / broader graph-surface candidate instead of reopening header-menu plumbing on this same lane.

## Verification

- ESLint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/MenuButton/MenuButton.tsx src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: passed
- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - result: `15 passed`
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.Tkw5gG/loop-001/run-006/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.1m)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent on the current `3068/8068` runtime with a fresh bootstrap URL
  - `/settings` loaded with `All Settings` active
  - `fit view` was applied once
  - `browserSectionDefault`, `promptSectionDefault`, and `languageServer` were present in the graph surface
  - no obvious blank/transparent canvas or detached shell/body artifact appeared on that lane
