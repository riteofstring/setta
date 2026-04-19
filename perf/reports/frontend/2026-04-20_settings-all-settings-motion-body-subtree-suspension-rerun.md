# Settings All Settings Motion Body Subtree Suspension Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-body-display-none-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-body-display-none-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Strengthen the existing motion-hidden body lane beyond wrapper-level hiding by suspending the hidden section subtree itself during viewport interaction.

This keeps the retained-canvas motion body root contract in place while stopping hidden sections from keeping their layout subtree mounted under the wrapper.

## Implementation

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - motion-hidden canvas-owned section bodies now keep the wrapper root but stop rendering `AreaSwitch` while `viewportInteractionActive` is true and the section is not the active UI section
- focused proof now exists in:
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

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

## Focused Runtime Result

The live probe used one blank pane point at `x=24`, `y=60`, dispatched one renderer wheel-zoom interaction, and verified:

- initial state:
  - all three sections exposed `data-canvas-owned-motion-body-root="true"` wrappers
  - each wrapper computed `display: block`
  - each wrapper had `childElementCount: 2`
  - `hiddenBodyCount: 0`
- during viewport interaction:
  - all three wrappers flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `display` switched to `none`
  - each wrapper dropped to `childElementCount: 0`
  - the global hidden-body count rose to `45`
- after the interaction settled:
  - all three wrappers returned to `display: block`
  - each wrapper restored `childElementCount: 2`
  - `hiddenBodyCount: 0`

Interpretation:

- the canonical `browserSectionDefault` lane now suspends the hidden section subtree itself instead of only hiding it inside the retained motion-body wrapper
- the retained canvas stayed visually authoritative enough for the checked lane to remain intact while those descendants were absent

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5515`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 116.52`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 15372`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-body-display-none-rerun.md`:

- `documentNodeCount: 5515 -> 5515`
- `buttonCount: 47 -> 47`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`
- `raf.meanMs: 114.28 -> 116.52`
- `raf.p95Ms: 133.4 -> 116.7`
- `longTasks.totalMs: 15303 -> 15372`

Interpretation:

- the stronger subtree suspension clearly changes the runtime shape on the canonical lane, but the dense-scene result is still mixed rather than a broad win
- the checked p95 tightened materially, but mean frame time regressed slightly and long-task totals stayed effectively flat-to-worse
- this is enough to close the wrapper-only follow-up idea on `browserSectionDefault`, but not enough to claim the hidden-section subtree blocker is solved

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-010/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed the canonical resting-text motion-body roots drop to zero rendered child elements during viewport motion and restore afterward
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault`; do not reopen another section-family broadening hop from here.
- The next product frontier should target whatever hidden-section subtree work still dominates motion after subtree suspension, not another wrapper-only change.
- If the next stronger pass still leaves triple-digit frame times and flat long-task totals, stop treating the motion-hidden wrapper lane as the main answer and escalate to a broader inactive-row ownership or overlay decision.
