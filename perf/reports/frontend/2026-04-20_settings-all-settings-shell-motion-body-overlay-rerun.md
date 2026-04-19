# Settings All Settings Shared Shell Motion Body Overlay Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-dropdown-motion-body-overlay-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-motion-aware-dense-probe.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-shell-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Expand the motion-hidden-body overlay to the heavyweight shared shell family so the large `callable`, `dict`, and `GlobalVariables` section bodies stop painting from live DOM during viewport motion on the canvas path.

This is a product slice on the active motion lane, not another section-local cleanup.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - widened `CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS` to include the shared shell boundary:
    - `settings-section__callableSectionDefault`
    - `settings-section__dictSectionDefault`
    - `settings-section__globalVariablesSectionDefault`
  - retained the existing `sectionSizingPolicy`, shared settings dropdown, and shared param-codeobj entries
- focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-shell-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__callableSectionDefault`
- Sibling proof sections:
  - `settings-section__dictSectionDefault`
  - `settings-section__globalVariablesSectionDefault`

## Focused Runtime Result

The live probe used one blank pane point at `x=24`, `y=60`, dispatched one renderer wheel-zoom interaction, and verified:

- initial state:
  - all three sections exposed `data-canvas-owned-motion-body-root="true"` wrappers
  - `hiddenBodyCount: 0`
- during viewport interaction:
  - all three wrappers flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `visibility` switched to `hidden`
  - the global hidden-body count rose to `17`
- after the interaction settled:
  - all three wrappers returned to visible
  - `hiddenBodyCount: 0`

Interpretation:

- the heavyweight shared shell family now participates in the same motion-time DOM suppression lane as `sectionSizingPolicy`, the shared dropdown family, and the shared param-codeobj family
- the active-section exemption remains intact because the overlay still keys off `viewportInteractionActive` and section UI activity

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5515`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 124.22`
- `raf.p95Ms: 166.7`
- `longTasks.totalMs: 15383`
- `motionHiddenBodies.totalMotionBodyRootCount: 17`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 17`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-dropdown-motion-body-overlay-rerun.md`:

- `documentNodeCount: 5520 -> 5515`
- `buttonCount: 48 -> 47`
- `motionHiddenBodies.totalMotionBodyRootCount: 14 -> 17`
- `motionHiddenBodies.peakHiddenBodyCount: 14 -> 17`
- `raf.meanMs: 133.61 -> 124.22`
- `raf.p95Ms: 216.6 -> 166.7`
- `longTasks.totalMs: 15853 -> 15383`

Interpretation:

- the widened overlay is definitely active on the real `viewportInteractionActive` path; the dense probe now sees `17` motion-hidden roots instead of `14`
- this is a better motion-aware rerun than the immediate dropdown-family pass, but it is still far above the branch target and not a clean enough global win to call the motion blocker solved
- the next frontier should target a stronger motion-state row-body/body-paint reduction primitive than another small family expansion

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-shell-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-007/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-shell-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed the new shared-shell motion-body suppression behavior
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Do not spend the next pass on another low-count motion-body family add.
- Treat the shell-family expansion as the last bounded overlay broadening before a stronger motion-state primitive decision.
- The next product frontier should either reduce more row-body paint cost per hidden section or escalate beyond `visibility: hidden` body suppression.
