# Settings All Settings Motion Body Display-None Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-resting-text-motion-body-overlay-rerun.md`
Prior motion-aware dense reference: `perf/reports/frontend/2026-04-20_settings-all-settings-resting-text-motion-body-overlay-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`

## Goal

Strengthen the already-broad motion-hidden-body lane so hidden section bodies stop paying full subtree layout/paint cost during viewport interaction instead of only flipping `visibility: hidden`.

This is the first pass on the active lane that changes the suppression mode itself rather than broadening another named family.

## Implementation

- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - changed motion-hidden section bodies from `visibility: hidden` to `display: none`
- `frontend/src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx`
  - froze retained-canvas measurement observers while `viewportInteractionActive` is true so the canvas reuses the last pre-motion scene instead of dropping detail measurements when the hidden DOM subtree is removed
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
  - `hiddenBodyCount: 0`
  - each target wrapper computed `display: block`
- during viewport interaction:
  - all three wrappers flipped to `data-canvas-owned-motion-body-hidden="true"`
  - computed `display` switched to `none`
  - the global hidden-body count rose to `45`
- after the interaction settled:
  - all three wrappers returned to `display: block`
  - `hiddenBodyCount: 0`

Interpretation:

- the canonical `browserSectionDefault` lane now uses real subtree suppression instead of visibility-only hiding
- the backdrop canvas remained authoritative enough for the focused motion lane to stay visually intact while those bodies were removed from layout

## Motion-Aware Dense Result

Fresh dense rerun on the same runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5515`
- `inputCount: 3`
- `textareaCount: 1`
- `buttonCount: 47`
- `raf.meanMs: 114.28`
- `raf.p95Ms: 133.4`
- `longTasks.totalMs: 15303`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-resting-text-motion-body-overlay-rerun.md`:

- `documentNodeCount: 5515 -> 5515`
- `buttonCount: 47 -> 47`
- `motionHiddenBodies.totalMotionBodyRootCount: 45 -> 45`
- `motionHiddenBodies.peakHiddenBodyCount: 45 -> 45`
- `raf.meanMs: 121.7 -> 114.28`
- `raf.p95Ms: 150.0 -> 133.4`
- `longTasks.totalMs: 14818 -> 15303`

Interpretation:

- the stronger suppression mode improved the checked frame-time distribution on the same dense motion path without reopening DOM inventory
- long-task totals remain effectively unsolved and slightly worse on this rerun, so the broader dense-scene motion blocker is still open
- the lane should stay on `settings-section__browserSectionDefault`, but the next step now needs to remove more hidden-section body work than this one wrapper-level suppression change delivered

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Container/SectionContainerCoreResizabe.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Container/SectionContainerCoreResizabe.tsx src/components/Section/Container/SectionContainerCoreResizabe.test.tsx src/forks/xyflow/core/container/SectionShellBackdropCanvas.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./scripts/run-playwright-against-runtime.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.I7AA2M/loop-002/run-009/worktree-ai.log -- frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed `display: none` suppression on the canonical resting-text motion lane
- the live motion-aware dense probe emitted the metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault`; do not reopen another section-family broadening hop from here.
- The next product frontier should target whatever hidden-section subtree work is still dominating the dense probe after `display: none`, not another forwarding cleanup.
- If the next stronger hidden-body reduction pass still leaves triple-digit frame times and the same long-task shape, stop treating wrapper-level motion suppression as sufficient and escalate to a larger row-body ownership or overlay decision.
