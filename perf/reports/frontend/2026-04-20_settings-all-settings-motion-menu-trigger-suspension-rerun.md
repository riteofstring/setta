# Settings All Settings Motion Menu Trigger Suspension Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `c8515e8de` (working tree)
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-live-chrome-inventory-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`

## Goal

Suspend the remaining repeated motion-time header-leading survivor on the normalized `All Settings` lane by hiding lightweight section menu triggers during viewport interaction for inactive motion-hidden settings sections.

This is the last bounded motion-chrome harvest that the prior inventory said was still worth trying on canonical `settings-section__browserSectionDefault`.

## Implementation

- `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`
  - now reads `viewportInteractionActive` and `useIsSectionUIActive(sectionId)` on the existing `canvas-shell-underlay` path
  - lightweight menu triggers on sections that already opt into `isCanvasOwnedSectionMotionHiddenBody(...)` switch to `invisible pointer-events-none` during viewport interaction while preserving layout space
  - the lightweight trigger wrapper now exposes `data-canvas-owned-motion-menu-trigger-hidden="true"` during that hidden state so focused motion probes can measure the suspension directly
- focused proof now exists in:
  - `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`
- Commands:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Header/MenuButton/MenuButton.tsx src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

## Focused Motion Inventory

- Whole-scene counts on the live worktree surface before motion:
  - `mountedSectionCount: 46`
  - `totalMotionBodyRootCount: 45`
  - `graphSurfaceMenuTriggerCount: 46`
  - `graphSurfaceRoleSwitchCount: 156`
  - `totalTrackedChromeElementCount: 202`
- Canonical target state before motion:
  - `settings-section__browserSectionDefault`: `menuTriggerCount 1`, `motionMenuTriggerHidden false`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
  - `settings-section__promptSectionDefault`: `menuTriggerCount 1`, `motionMenuTriggerHidden false`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
  - `settings-section__languageServer`: `menuTriggerCount 1`, `motionMenuTriggerHidden false`, `motionBodyHidden false`, `motionHeaderControlsHidden false`
- Peak motion-hidden snapshot:
  - `framesWithHiddenBodies: 118 / 120`
  - `peakHiddenBodyCount: 45`
  - `hiddenHeaderControlsCount: 45`
  - `hiddenMenuTriggerCount: 45`
  - `graphSurfaceMenuTriggerCount: 1`
  - `graphSurfaceRoleSwitchCount: 0`
  - `totalTrackedChromeElementCount: 1`
- Canonical target state during motion:
  - `settings-section__browserSectionDefault`: `menuTriggerCount 0`, `motionMenuTriggerHidden true`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
  - `settings-section__promptSectionDefault`: `menuTriggerCount 0`, `motionMenuTriggerHidden true`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
  - `settings-section__languageServer`: `menuTriggerCount 0`, `motionMenuTriggerHidden true`, `motionBodyHidden true`, `motionHeaderControlsHidden true`
- Residual motion survivor:
  - the only remaining tracked chrome element at peak motion belonged to one non-motion-hidden section (`settings-section__codeCallableCodeObjDefault`)

## Fresh Dense Metrics

- `documentNodeCount: 5579`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 59`
- `raf.meanMs: 89.91`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 13181`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-live-chrome-inventory-rerun.md`:

- `documentNodeCount: 5584 -> 5579`
- `buttonCount: 60 -> 59`
- `graphSurfaceMenuTriggerCount during peak motion: 46 -> 1`
- `totalTrackedChromeElementCount during peak motion: 46 -> 1`
- `raf.meanMs: 89.07 -> 89.91`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 12911 -> 13181`

## Interpretation

- The menu-trigger suspension worked exactly at the intended ownership boundary: the canonical `browserSectionDefault`, `promptSectionDefault`, and `languageServer` sections are fully chrome-free during peak motion.
- The broader motion-chrome lane is now effectively exhausted. The focused inventory collapsed the tracked graph-surface motion chrome from `202` elements at rest to `1` at peak motion, and from `46` repeated menu triggers to `1`.
- Dense motion did not materially improve after that last repeated survivor was removed. `documentNodeCount` nudged down by `5`, but `raf.meanMs` regressed slightly and `longTasks.totalMs` increased.
- That makes this a lane-closing stop signal, not a reason to keep harvesting tiny motion-header details. The next default pass should pivot to a broader inactive-row/body overlay or stronger renderer-side structural decision instead of another motion-chrome micro-slice.

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
  - result: `1 passed (4.13s)`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Header/MenuButton/MenuButton.tsx src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts`
  - result: passed
- Playwright focused + dense probe:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-004/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-motion-live-chrome-inventory.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`
  - result: `2 passed (1.4m)`
- CDP visual check:
  - done in a fresh headless DevTools sub-agent
  - `All Settings` was active on `http://127.0.0.1:3068/settings`
  - `fit view` was applied and exactly one retained graph canvas was mounted before and after one `zoom in`
  - `settings-section__browserSectionDefault`, `settings-section__promptSectionDefault`, and `settings-section__languageServer` remained visually intact
  - no obvious blank or detached artifact appeared on the motion-menu-trigger suspension path

## Follow-up

- Keep the motion-header menu-trigger lane closed unless a fresh visible defect appears there.
- Do not spend the next default pass on another motion-chrome harvest.
- Start the next product pass from a broader inactive-row/body overlay or stronger renderer-side structural reduction that can still plausibly move dense `All Settings` motion after the menu-trigger stop signal.
