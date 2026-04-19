# Settings All Settings Motion Header Title Canvas Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-header-controls-suspension-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/components/Section/Header/SectionHeader.canvasOwnedTitle.test.tsx`
- `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`

## Goal

Move section header titles onto the retained canvas for the existing motion-hidden settings boundary so inactive sections keep visible titles without paying live DOM title paint on the `canvas-shell-underlay` path.

This keeps the canonical `browserSectionDefault` motion lane intact and targets the remaining hidden-section header chrome instead of reopening another body-wrapper hop.

## Implementation

- `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `SectionHeaderLeading` now marks header titles as canvas-owned resting text on the same `isCanvasOwnedSectionMotionHiddenBody(...)` boundary used by the motion-hidden body lane
- `frontend/src/components/Section/Header/SectionTitle.tsx`
  - fixed and non-editing header titles can now opt into `data-canvas-owned-resting-text="true"` and `data-canvas-owned-header-title="true"`
  - non-editing canvas-owned titles switch to `opacity-0` while the retained canvas supplies the visible title text
  - inline title editing stays DOM-visible because the edit input does not get the canvas-owned resting-text marker
- `frontend/src/components/Utils/Editable.tsx`
  - forwards non-editing attributes so the real DOM title node can be measured and rendered by the retained canvas
- focused proof now exists in:
  - `frontend/src/components/Section/Header/SectionHeader.canvasOwnedTitle.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3070/`
  - backend: `http://127.0.0.1:8070`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__browserSectionDefault`
- Sibling proof sections:
  - `settings-section__promptSectionDefault`
  - `settings-section__languageServer`

## Focused Runtime Result

The live probe used one blank pane point at `x=24`, `y=60`, dispatched one renderer wheel-zoom interaction, and verified:

- initial state:
  - all three sections exposed `data-canvas-owned-motion-body-root="true"` wrappers
  - all three sections exposed `data-canvas-owned-motion-header-controls-root="true"` wrappers
  - all three sections exposed `data-canvas-owned-header-title="true"` title roots
  - all three title roots reported `opacity: 0`
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
- during viewport interaction:
  - all three section bodies flipped to `data-canvas-owned-motion-body-hidden="true"`
  - all three trailing header wrappers flipped to `data-canvas-owned-motion-header-controls-hidden="true"`
  - all three title roots stayed present with `opacity: 0`
  - both global hidden counts rose to `45`
- after the interaction settled:
  - both hidden counts returned to `0`
  - all three title roots were still present with `opacity: 0`
  - the canonical sections restored their normal body and header-control state

Interpretation:

- the existing `browserSectionDefault` motion-hidden lane now keeps section titles on the retained canvas in addition to hiding the body subtree and trailing header controls during motion
- the checked sections stayed visually intact after the interaction, so this strengthens the motion-time header path without reopening another section-family ownership hop

## Motion-Aware Dense Result

Dense rerun on the same worktree runtime recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5584`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 60`
- `raf.meanMs: 86.83`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 12670`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-header-controls-suspension-rerun.md`:

- `documentNodeCount: 5584 -> 5584`
- `inputCount: 5 -> 5`
- `textareaCount: 2 -> 2`
- `buttonCount: 60 -> 60`
- `raf.meanMs: 124.5 -> 86.83`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 18329 -> 12670`

Interpretation:

- the focused probe proves the new title ownership is active on the same canonical motion-hidden lane as the body and trailing-controls slices
- the unchanged whole-scene DOM counts mean this pass is not another node-count reduction story; it is a header-paint ownership change on the retained-canvas path
- the dense rerun is encouraging but should still be treated as smoke-level evidence on this runtime family rather than a new clean benchmark floor by itself

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Header/SectionHeader.canvasOwnedTitle.test.tsx src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Utils/Editable.tsx src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionTitle.tsx src/components/Section/Header/SectionHeader.canvasOwnedTitle.test.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-002/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed canvas-owned header-title roots on `browserSectionDefault`, `promptSectionDefault`, and `languageServer`
- the dense probe emitted the same runtime-family metrics recorded above
- CDP visual check: done (headless Chrome DevTools, `/settings` with `All Settings` active, `fit view`, one `zoom in`, one retained graph canvas, no obvious blank or detached title/header artifact on the canonical sections)

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault`; do not reopen another section-family ownership pass from here.
- The next bounded frontier should target the remaining motion-time header leading chrome and root incrementer on this same boundary only if that move still plausibly changes the dense runtime; otherwise stop extending the motion-header chrome lane and escalate to the broader inactive-row overlay decision.
