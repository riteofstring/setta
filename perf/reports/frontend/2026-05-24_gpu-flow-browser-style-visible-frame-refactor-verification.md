# GPU Flow Browser-Style Visible Frame Refactor Verification

Date: 2026-05-24

## Scope

Verified the browser-style visible-frame refactor for the Settings GPU Flow
surface. The pass replaces the old visible-frame kernel/resource-registry/
engine boundary with coordinator/resource-graph/state-machine naming, keeps
browser visual publication proof and completeness decisions explicit, and
preserves browser-style retained DOM controls during scroll, pan, zoom, and
text-control activation.

## Implementation Delta

- Active and passive retained DOM controls now activate from retained
  pointer/mouse down; text-like DOM-owned controls are treated as browser
  activation targets instead of canvas-control commit targets.
- Browser-visual holes are represented as actor/readiness debt with committed
  surface proof metadata, so passive maintenance debt no longer blocks committed
  content completeness while active controls and true holes still block.
- The visible-frame scheduler separates motion, critical content, non-critical
  repair, and maintenance debt; retained scroll motion defers non-critical
  content catchup without starving explicit activation or resize content.
- Compact retained section shell textures use stable texture metadata, and
  single-texture dirty source rects are ignored when they do not intersect the
  source texture instead of queuing invalid uploads.
- E2E helpers now wait for committed retained compositor viewport state before
  parity screenshots, removing recorder/grid-view races from the visible-frame
  coherence checks.

## Commands

- Focused frontend unit sweep for visible-frame/projection/html-surface/retained
  interaction changes.
  - Result: 29 files passed, 357 tests passed.
- Final split/regression unit sweep:
  `pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/htmlSurfaces/texturesSourceRect.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/frameCaptureTargets.test.tsx src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.test.tsx src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.activation.test.tsx src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/GpuFlow/domControlPlaneActivation.test.tsx src/gpuFlow/projectionSchedulerRetry.test.ts`
  - Result: 9 files passed, 122 tests passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-native-semantics.spec.ts`
  - Result: 5 tests passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-native-semantics-ime.spec.ts`
  - Result: 1 test passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts frontend/tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts`
  - Result: 7 tests passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts`
  - Result: 7 tests passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
  - Result: 1 test passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-activation.spec.ts`
  - Result: 3 tests passed.
- `./scripts/quality/check.sh`
  - Result: passed.
- `pnpm -C frontend exec tsc --noEmit --pretty false`
  - Result: still fails on existing unrelated frontend type errors outside the
    changed frontend source files. Filtering the output through the final
    changed-file pattern produced no diagnostics for the touched files.

## DOM Golden Evidence

Captured disposable `go-rewrite` DOM-only Settings evidence under:

```text
perf/artifacts/frontend/2026-05-24_settings-dom-golden-go-rewrite
```

The capture was run from a disposable `go-rewrite` worktree. That historical
branch needed a worktree-only Combobox nullability patch to boot Settings; the
patch was not applied to this worktree. Summary values:

- target section: `settings-section__chatSectionDefault`;
- scroll changed pixel ratio: `0.07797270955165692`;
- scroll mean delta: `3.48326835607539`;
- baseline cadence: max `9.3 ms`, p50 `8.3 ms`, p95 `9.2 ms`;
- gesture cadence: max `58.3 ms`, p95 `50.1 ms`;
- long tasks during the captured gesture: `0`.

The target section was small in this capture because `go-rewrite` fit-view
settled at zoom `0.1`; the screenshots remain useful as DOM-only layout and
scroll movement reference evidence, not as a strict same-scale pixel oracle.

## Chrome Recording Evidence

Before the held-budget publication repair, fresh manual-flow recordings still
showed repeated held-budget loops:

- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after`
  reported 67 blocked publication events, including 44
  `visible-transaction:held-previous-budget-exceeded` and 12
  `retained-projection:held-previous-budget-exceeded` reasons.
- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-manual-cadence`
  reported 61 blocked publication events, including 24
  `visible-transaction:held-previous-budget-exceeded` and 6
  `retained-projection:held-previous-budget-exceeded` reasons.

After the repair, recorder bundles no longer show held-budget publication
reasons:

- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-held-budget-fix`
  reported 5 blocked publication events and 0 held-budget reasons.
- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-held-budget-fix-cdp`
  reported 0 blocked publication events and 0 held-budget reasons.
- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-held-budget-fix-native`
  reported 0 blocked publication events and 0 held-budget reasons.
- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-held-budget-fix-oswheel`
  reported 0 blocked publication events and 0 held-budget reasons.
- `perf/artifacts/frontend/2026-05-24_visible-frame-chrome-recording-after-held-budget-fix-manual-replay`
  captured 12 recorder-visible page-runtime wheel markers with
  `syntheticReplay: true`: 4 pan-wheel, 4 ctrl-wheel-zoom, and 4
  retained-scroll markers. It reported 0 blocked publication events and 0
  held-budget reasons. The 3 long tasks in that bundle happened before the
  replayed wheel window; no long task was recorded during the replay window.

Recorder limitation: API-driven CDP, Playwright mouse, scheduled DOM wheel, and
CoreGraphics wheel attempts did not produce trusted collector-visible `wheel`
events in the post-repair bundles. The Settings Playwright observed-behavior
and scroll-performance specs are the interaction/cadence verification for
retained scroll, pan, and zoom in this pass. The post-repair Chrome bundles are
useful for app-state startup, blocked-publication evidence, and synthetic replay
event capture, not for trusted native/manual wheel cadence.

## CDP Visual Check

Ran a headed Chrome DevTools MCP check with:

```text
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features"
```

Observed `/settings` with `All Settings` selected:

- retained row diagnostics reported 441 rows;
- cold-start shell was absent after settle;
- retained scroll on `settings-section__shortcuts:param-content:unpinned`
  changed the visible first row from
  `settings-codeobj__shortcuts__shortcuts__advancedSearchShortcut` to
  `settings-codeobj__shortcuts__shortcuts__focusUiEditorShortcut`;
- retained scroll offset changed from `0` to `240`;
- DOM-control count stayed nonzero at 32;
- actor-manifest `missingActorsByFamily` stayed empty;
- pan changed the viewport transform from `{x: 372.5, y: 24.7, zoom: 0.4}`
  to `{x: 276.5, y: -46.1, zoom: 0.4}`;
- no console errors were observed during the check.

Screenshots were captured locally during the CDP check:

- `/tmp/setta-cdp-visible-frame-all-settings.png`
- `/tmp/setta-cdp-visible-frame-after-scroll.png`
- `/tmp/setta-cdp-visible-frame-after-pan-zoom.png`

## Remaining Evidence Gap

The implementation and automated observed-behavior checks cover the Settings
regression, and post-repair Chrome app-state evidence shows the held-budget
publication loop is gone. The remaining gap is recorder-environment specific:
a recorder-visible synthetic wheel replay bundle is available, but a trusted
native/manual wheel recording that also drives app state is still not available
from this environment.

The full Phase 10 manual-flow Chrome recording requirement remains partially
unmet for trusted native wheel cadence only.
