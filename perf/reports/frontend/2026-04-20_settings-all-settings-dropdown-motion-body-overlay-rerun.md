# Settings All Settings Shared Dropdown Motion Body Overlay Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-section-sizing-policy-motion-body-overlay-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-motion-aware-dense-probe.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-dropdown-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Expand the motion-hidden-body overlay from one section-local add to the existing shared settings dropdown family so more inactive dropdown-heavy section bodies stop painting from live DOM during viewport motion on the canvas path.

This is a product slice on the active motion lane, not another harness-only pass.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - added `SHARED_SETTINGS_DROPDOWN_CANVAS_OWNED_SECTION_IDS`
  - widened `CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS` to include:
    - `settings-section__backend`
    - `settings-section__gui`
    - `settings-section__stateMachineGateSectionDefault`
    - the existing `settings-section__sectionSizingPolicy`
    - the existing shared param-codeobj sections
- focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-dropdown-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__backend`
- Sibling proof sections:
  - `settings-section__gui`
  - `settings-section__stateMachineGateSectionDefault`

## Focused Runtime Result

The live probe used one blank pane point at `x=24`, `y=60`, dispatched one renderer wheel-zoom interaction, and verified:

- initial state:
  - all three sections exposed `data-canvas-owned-motion-body-root="true"` wrappers
  - `hiddenBodyCount: 0`
- during viewport interaction:
  - all three wrappers flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `visibility` switched to `hidden`
  - the global hidden-body count rose to `14`
- after the interaction settled:
  - all three wrappers returned to visible
  - `hiddenBodyCount: 0`

Interpretation:

- the shared dropdown family now participates in the same motion-time DOM suppression lane as `sectionSizingPolicy` and the shared param-codeobj family
- the active-section exemption remains intact because the overlay still keys off `viewportInteractionActive` and section UI activity

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5520`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 48`
- `raf.meanMs: 133.61`
- `raf.p95Ms: 216.6`
- `longTasks.totalMs: 15853`
- `motionHiddenBodies.totalMotionBodyRootCount: 14`
- `motionHiddenBodies.framesWithHiddenBodies: 117 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 14`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-section-sizing-policy-motion-body-overlay-rerun.md`:

- `motionHiddenBodies.totalMotionBodyRootCount: 11 -> 14`
- `motionHiddenBodies.peakHiddenBodyCount: 11 -> 14`
- `raf.meanMs: 126.89 -> 133.61`
- `raf.p95Ms: 150.0 -> 216.6`
- `longTasks.totalMs: 15394 -> 15853`

Interpretation:

- the widened overlay is definitely active on the real `viewportInteractionActive` path; the dense probe now sees `14` motion-hidden roots instead of `11`
- this did not produce an immediate motion win on the same noisy runtime, so treat the slice as confirmed lane expansion rather than a new performance checkpoint
- the branch still needs a stronger motion-state row-body reduction than this dropdown-family broadening alone

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-dropdown-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-006/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-dropdown-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed the new shared-dropdown motion-body suppression behavior
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the motion-aware dense probe as the default measurement path for further motion-body work.
- Do not spend the next pass on another single-section motion-body add.
- The next product frontier should target a broader high-cost family or a stronger row-chrome/body reduction primitive on the same motion lane.
