# GPU Flow Visible Frame Final Verification - 2026-05-23

Branch: `go-rewrite-canvas-html-gpu-surfaces-plan`

## Automated Verification

- `./scripts/quality/check.sh --files $(git diff --name-only $(git merge-base HEAD main)..HEAD)`
  - Passed.
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/committedSurfaceRuntime.test.ts src/gpuFlow/htmlSurfaces/texturesBudgetEviction.test.ts`
  - Passed: 54 files, 341 tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts frontend/tests/e2e/settings/settings-retained-text-like-native-semantics.spec.ts frontend/tests/e2e/settings/settings-retained-text-like-native-semantics-ime.spec.ts`
  - Passed: 12 tests.

## Fresh Chrome Recording

- Recording: `recording-20260523-142855`
- Path: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-142855`
- Scenario: Chrome repro recorder with `CanvasDrawElement` and unsafe WebGPU enabled; automated retained Settings navigation, All Settings activation, retained section wheel scrolls, viewport pan, and viewport zoom.

Recording stream summary:

- Console events: 5 debug, 3 info, 3 warn.
- Console/page errors: 0.
- Old blocked/held exception text occurrences: 0.
- `performance-longtask`: 67 total, 64 over 50 ms, max 196 ms.
- `performance-frame-gap`: 42 total, 18 over 50 ms, max 108.3 ms.
- Active-interaction frame gaps over 50 ms: 18, max 108.3 ms.
- Visible publication outcomes observed: 1038 blocked, 78 commit, 51 hold-previous.
- Final debt snapshot: content=true, maintenance=true, motion=false.

The recorder confirms the correctness-sensitive old page-error class is gone in
the live dev path. It does not satisfy the plan's strict fresh-recording
performance target: this dev-recorder capture still contains >50 ms long tasks
and active-interaction frame gaps, despite the dedicated Playwright retained
benchmark subset passing its automated budgets.
