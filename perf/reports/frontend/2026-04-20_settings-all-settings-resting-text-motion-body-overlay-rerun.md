# Settings All Settings Shared Resting-Text Motion Body Overlay Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-shell-motion-body-overlay-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-shell-motion-body-overlay-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Widen the motion-hidden-body overlay from a few named families to the shared retained resting-text boundary so more of the visible `settings` -> `All Settings` scene stops painting from live DOM during viewport motion.

This is the first stronger shared motion-state primitive after the small family-by-family overlay broadening passes.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - changed `CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS` from the hand-maintained shell/dropdown/param-codeobj list to the full `CANVAS_OWNED_RESTING_TEXT_SECTION_IDS` boundary
- focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
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
  - `hiddenBodyCount: 0`
- during viewport interaction:
  - all three wrappers flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `visibility` switched to `hidden`
  - the global hidden-body count rose to `45`
- after the interaction settled:
  - all three wrappers returned to visible
  - `hiddenBodyCount: 0`

Interpretation:

- the motion-hidden-body boundary now follows the whole retained resting-text lane instead of a few named families
- the canonical `browserSectionDefault` lane and two non-shell siblings prove the broader boundary is live on the checked surface

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5515`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 121.7`
- `raf.p95Ms: 150.0`
- `longTasks.totalMs: 14818`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-shell-motion-body-overlay-rerun.md`:

- `documentNodeCount: 5515 -> 5515`
- `buttonCount: 47 -> 47`
- `motionHiddenBodies.totalMotionBodyRootCount: 17 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 17 -> 45`
- `raf.meanMs: 124.22 -> 121.7`
- `raf.p95Ms: 166.7 -> 150.0`
- `longTasks.totalMs: 15383 -> 14818`

Interpretation:

- the stronger shared boundary materially widened the real motion suppression lane and improved the immediate dense rerun on the same runtime family
- the branch is still far above the final motion bar, but this pass finally moved the checked motion lane with a shared primitive instead of another small family add
- if a follow-up pass on this lane does not materially improve absolute motion again, the next escalation should go beyond `visibility: hidden` rather than reopening named-family broadening

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-008/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed the broadened resting-text motion-body suppression behavior
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault` for the next motion-state decision instead of rediscovering a target.
- Do not reopen another low-count named-family motion-body add after this shared-boundary pass.
- The next product frontier should either strengthen the suppression mode beyond `visibility: hidden` or remove more per-section row-body paint cost while this broader boundary is active.
