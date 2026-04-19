# Settings All Settings SectionSizingPolicy Motion Body Overlay Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-19_settings-all-settings-param-codeobj-motion-body-overlay-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-19_settings-all-settings-motion-aware-dense-probe.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`

## Goal

Extend the current motion-hidden-body overlay boundary to the highest-payoff retained-canvas outlier, `settings-section__sectionSizingPolicy`, so one more large resting body stops painting from live DOM during viewport motion on the canvas path.

This is a product slice on the active motion lane, not another harness-only pass.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - added `CANVAS_OWNED_MOTION_HIDDEN_BODY_SECTION_IDS`
  - widened `isCanvasOwnedSectionMotionHiddenBody(...)` from the shared param-codeobj cluster to:
    - `settings-section__sectionSizingPolicy`
    - the existing shared param-codeobj sections
- focused proof now exists in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__sectionSizingPolicy`
- Canonical editor handoff row:
  - `settings-codeobj__sectionSizingPolicy__sectionSizingPolicy__byType__Browser__maxHeight`

## Focused Runtime Result

The live probe used one blank pane point at `x=24`, `y=60`, dispatched one renderer wheel-zoom interaction, and verified:

- initial state:
  - the section exposed one `data-canvas-owned-motion-body-root="true"` wrapper
  - `hiddenBodyCount: 0`
- during viewport interaction:
  - the section wrapper flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `visibility` switched to `hidden`
  - the global hidden-body count rose above `0`
- after the interaction settled:
  - the section wrapper returned to visible
  - `hiddenBodyCount: 0`

Interpretation:

- `sectionSizingPolicy` now participates in the same motion-time DOM suppression lane as the shared param-codeobj family
- the existing active-section exemption remains intact because the overlay still keys off `viewportInteractionActive` and section UI activity

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5515`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 126.89`
- `raf.p95Ms: 150.0`
- `longTasks.totalMs: 15394`
- `motionHiddenBodies.totalMotionBodyRootCount: 11`
- `motionHiddenBodies.framesWithHiddenBodies: 119 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 11`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-19_settings-all-settings-motion-aware-dense-probe.md`:

- `motionHiddenBodies.totalMotionBodyRootCount: 10 -> 11`
- `motionHiddenBodies.peakHiddenBodyCount: 10 -> 11`
- `raf.meanMs: 124.92 -> 126.89`
- `raf.p95Ms: 150.1 -> 150.0`
- `longTasks.totalMs: 15188 -> 15394`

Interpretation:

- the widened overlay is definitely active on the real `viewportInteractionActive` path; the dense probe now sees `11` motion-hidden roots instead of `10`
- this did not produce an immediate motion win on the same noisy runtime, so treat the slice as confirmed lane expansion rather than a new performance checkpoint
- the branch still needs a stronger motion-state row-body reduction beyond this single outlier

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts tests/e2e/settings/settings-all-settings-section-sizing-policy-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-005/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-section-sizing-policy-resting-text.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed the new section-sizing-policy motion-body suppression behavior
- the existing section-sizing-policy resting-text proof still preserved first-click inline editing on the canonical row
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the motion-aware dense probe as the default measurement path for further motion-body work.
- Do not spend the next pass on another harness-only iteration.
- The next product frontier should either widen motion-time body suppression to the next trustworthy shared boundary or move more row chrome off the moving DOM surface.
