# Settings All Settings Param-Codeobj Motion Body Overlay Rerun

Date: 2026-04-19
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-param-codeobj-motion-body-overlay.spec.ts`
Related unit coverage:
- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Land one stronger inactive-row overlay primitive on the shared param-codeobj family by hiding those section bodies during viewport interaction on the canvas path while restoring the live DOM immediately afterward.

This slice deliberately targets motion-state body paint, not another at-rest value-shell cleanup.

## Implementation

- `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts`
  - added `isCanvasOwnedSectionMotionHiddenBody(...)` for the shared param-codeobj canvas-owned family
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - `CanvasSectionBody` now watches `viewportInteractionActive`
  - eligible shared param-codeobj bodies render with `data-canvas-owned-motion-body-root="true"`
  - while viewport interaction is active and the section is not the current active section, the body wrapper flips to `visibility: hidden` with `data-canvas-owned-motion-body-hidden="true"`
- focused proof was added in:
  - `frontend/src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts`
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-param-codeobj-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3068/`
  - backend: `http://127.0.0.1:8068`
- Browser + OS:
  - Playwright Chromium, headless Linux
- Surface:
  - `settings` -> `All Settings`
- Canonical target section:
  - `settings-section__rotaryParamCodeObjDefault`
- Sibling proof section:
  - `settings-section__sliderParamCodeObjDefault`

## Focused Runtime Result

The live probe used a blank pane point at `x=24`, `y=60`, dispatched one wheel-zoom interaction on the renderer, and recorded:

- initial state:
  - `hiddenBodyCount: 0`
  - rotary motion-body root visible
  - slider motion-body root visible
- during viewport interaction:
  - `hiddenBodyCount: 10`
  - rotary motion-body root hidden
  - slider motion-body root hidden
- after the zoom interaction settled:
  - `hiddenBodyCount: 0`
  - rotary motion-body root visible again
  - slider motion-body root visible again

Interpretation:

- the shared param-codeobj family now has a real motion-time DOM suppression primitive instead of only at-rest canvas ownership
- this is a broader motion-state body reduction, not another section-local resting-text seam
- the next measurement step should use a motion-aware dense probe, because the existing transform-only baseline path does not drive `viewportInteractionActive`

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/forks/xyflow/core/container/sectionShellCanvasOwnership.ts src/forks/xyflow/core/container/sectionShellCanvasOwnership.test.ts src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx tests/e2e/settings/settings-all-settings-param-codeobj-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-003/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-param-codeobj-motion-body-overlay.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-19
- the live probe emitted the motion-body summary above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Do not reopen another param-codeobj resting-text/value lane by inertia.
- Next default step: add or adapt one dense motion probe that drives real viewport interaction so this new body-overlay primitive can be measured against the branch baseline.
