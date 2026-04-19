# Settings All Settings Motion Header Controls Suspension Rerun

Date: 2026-04-20
Area: frontend
Branch/Commit: `go-rewrite-pixijs` @ `working tree`
Related plan: `docs/worktrees/go-rewrite-pixijs/plan.md`
Related handoff: `docs/worktrees/go-rewrite-pixijs/handoff.md`
Prior motion-overlay reference: `perf/reports/frontend/2026-04-20_settings-all-settings-motion-body-subtree-suspension-rerun.md`
Focused probe: `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
Dense probe: `frontend/tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts`
Related unit coverage:
- `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`

## Goal

Reduce motion-time header chrome paint on the existing motion-hidden settings boundary without reopening another section-family ownership hop.

This keeps the canonical `browserSectionDefault` motion-body lane intact while hiding trailing header controls during viewport interaction for inactive motion-hidden sections.

## Implementation

- `frontend/src/components/Section/Header/SectionHeader.tsx`
  - `SectionHeaderTrailing` now marks itself as a motion-header-controls root
  - on the `canvas-shell-underlay` path, inactive sections in `isCanvasOwnedSectionMotionHiddenBody(...)` switch to `invisible pointer-events-none` while `viewportInteractionActive` is true
- focused proof now exists in:
  - `frontend/src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
  - `frontend/tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`

## Scenario

- Runtime:
  - frontend: `http://127.0.0.1:3069/`
  - backend: `http://127.0.0.1:8069`
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
  - `hiddenBodyCount: 0`
  - `hiddenHeaderControlsCount: 0`
- during viewport interaction:
  - all three section bodies flipped to `data-canvas-owned-motion-body-hidden="true"`
  - all three trailing header wrappers flipped to `data-canvas-owned-motion-header-controls-hidden="true"`
  - the global hidden-body count rose to `45`
  - the global hidden-header-controls count also rose to `45`
- after the interaction settled:
  - both hidden counts returned to `0`
  - all three target sections restored their normal body and header-control state

Interpretation:

- the existing `browserSectionDefault` motion-hidden lane now suppresses trailing header chrome during motion in addition to the section body subtree
- the checked sections stayed visually intact after the interaction, so this strengthens the motion path without adding a new ownership family

## Motion-Aware Dense Result

Fresh dense rerun on the recovered runtime family recorded:

- blank pane point: `x=24`, `y=60`
- `documentNodeCount: 5584`
- `inputCount: 5`
- `textareaCount: 2`
- `buttonCount: 60`
- `raf.meanMs: 124.5`
- `raf.p95Ms: 116.7`
- `longTasks.totalMs: 18329`
- `motionHiddenBodies.totalMotionBodyRootCount: 45`
- `motionHiddenBodies.framesWithHiddenBodies: 118 / 120`
- `motionHiddenBodies.peakHiddenBodyCount: 45`
- `motionHiddenBodies.settledHiddenBodyCount: 0`

Compared against `perf/reports/frontend/2026-04-20_settings-all-settings-motion-body-subtree-suspension-rerun.md`:

- `documentNodeCount: 5515 -> 5584`
- `inputCount: 3 -> 5`
- `textareaCount: 1 -> 2`
- `buttonCount: 47 -> 60`
- `raf.meanMs: 116.52 -> 124.5`
- `raf.p95Ms: 116.7 -> 116.7`
- `longTasks.totalMs: 15372 -> 18329`

Interpretation:

- the focused motion probe clearly proves the new header-control suppression is active on the canonical lane
- the dense rerun happened only after a lifecycle recovery and reopened extra non-target workspace chrome, so these whole-scene counts are a smoke result for the recovered runtime family rather than a clean apples-to-apples benchmark delta
- because of that runtime-family noise, this slice should be treated as a bounded motion-chrome reduction proof, not as a trustworthy new best dense checkpoint

## Verification

- Vitest:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec vitest run src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx`
- Eslint:
  - `source activate.sh && . scripts/lib/node_tooling.sh && setta_run_pnpm "$PWD" -C frontend exec eslint src/components/Section/Header/SectionHeader.tsx src/components/Section/Header/SectionHeader.motionHiddenControls.test.tsx src/components/Section/Header/SectionHeader.test.tsx tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts`
- Playwright:
  - `source activate.sh && . scripts/lib/node_tooling.sh && RUNTIME_JSON="$(./scripts/dev-runtime-info.sh --workspace /home/ubuntu/dev/setta.go-rewrite-pixijs/. --runtime-log /tmp/codex-supervisor.GbVpg5/loop-001/run-001/worktree-ai.log)" && SETTA_BACKEND_ORIGIN="$(node -pe 'JSON.parse(process.argv[1]).backendUrl' "$RUNTIME_JSON")" && SETTA_BOOTSTRAP_TOKEN="$(node -pe 'new URL(JSON.parse(process.argv[1]).bootstrapUrl).hash.split("token=")[1]' "$RUNTIME_JSON")" && BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:3069/" SETTA_BACKEND_ORIGIN="$SETTA_BACKEND_ORIGIN" SETTA_BOOTSTRAP_TOKEN="$SETTA_BOOTSTRAP_TOKEN" setta_run_pnpm "$PWD" -C frontend exec playwright test tests/e2e/settings/settings-all-settings-resting-text-motion-body-overlay.spec.ts tests/e2e/settings/settings-all-settings-motion-aware-dense.spec.ts --reporter=line --workers=1`

Result:

- all listed checks passed locally on 2026-04-20
- the focused probe confirmed both body and trailing header-control suppression on the canonical resting-text motion lane
- the live dense probe emitted the recovered-runtime metrics recorded above
- CDP visual check: see `docs/worktrees/go-rewrite-pixijs/handoff.md` and `docs/worktrees/go-rewrite-pixijs/log.md`

## Follow-up

- Keep the canonical lane on `settings-section__browserSectionDefault`; do not reopen another section-family ownership pass from here.
- The next bounded frontier should target the remaining hidden-section subtree and chrome work with a cleaner normalized dense runtime, not another wrapper-only motion-body hop.
- Treat the dense rerun in this report as recovered-runtime smoke evidence until a fresh normalized `All Settings` session re-establishes an apples-to-apples motion benchmark.
