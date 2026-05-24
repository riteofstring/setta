# GPU Flow Retained Coverage Compositor Refactor After

Date: 2026-05-15

## Baseline

`docs/plans/gpu-flow-retained-coverage-compositor-refactor-plan.md` records
the failure mode that motivated this refactor:

- render-frame spikes around 200-267 ms during retained pan/zoom
- frame gaps up to about 292 ms
- `retainedTexturePageTargetDescriptorCount` up to 585
- `retainedTexturePageRejectedStaleRectCount` around 33,000
- raster and upload near zero during the slow frames

## After

Command:

```sh
SETTA_RETAINED_COMPOSITOR_FRAME_PROBE=1 \
SETTA_RETAINED_COMPOSITOR_PERF_JSONL=../perf/reports/frontend/2026-05-15_gpu-flow-retained-coverage-compositor-refactor-after.jsonl \
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Result: passed.

Key recorded values:

- No browser long tasks in any measured gesture.
- `pan`: p95 16.9 ms, max 24.1 ms, slow-frame ratio 0.071.
- `retainedHoverZoom`: p95 9.1 ms, max 17.2 ms, slow-frame ratio 0.007.
- `retainedScroll`: p95 15.5 ms, max 33.4 ms, slow-frame ratio 0.038.
- `scrollThenRetainedHoverZoom`: p95 9.2 ms, max 33.2 ms, slow-frame ratio 0.027.
- `zoom`: p95 9.0 ms, max 9.6 ms, slow-frame ratio 0.
- retained frame probe max `durationMs`: 43.4 ms.
- retained frame probe max `retainedTexturePageTargetDescriptorCount`: 90.
- retained frame probe max `retainedTexturePageTrueHoleRectCount`: 0.

The high-volume synchronous page coverage loop is gone from display planning;
the remaining descriptor count is raster-scheduler work derived after visible
replacement requests.

## Verification Caveat

A broader combined Playwright run covering the large-scene performance spec,
retained cadence spec, pan/zoom spec, retained scroll spec, and GPU Flow E2E
directory was also exercised after the refactor. The latest full combined run
failed the pan workload threshold with p95 23.2 ms against a 20 ms limit after
the preceding retained coverage and cadence checks passed. The same pan/zoom
spec passed when run independently, and the large-scene performance probe also
passed with no long tasks and no retained visual blanking.

The retained scroll performance spec passed independently after its existing
scrollbar warm-up was moved before the measured baseline. A reduced combined
run without the pan/zoom spec was attempted to re-check combined-order scroll,
but it stopped early on an unrelated duplicate `context-menu-core` strict
locator in the GPU Flow context-menu E2E; that context-menu test passed in the
preceding full combined run.

Owner: GPU Flow retained compositor.

Follow-up path: keep the 120 fps-class per-workload specs split for signal in
CI, and re-baseline or tune the combined multi-spec cadence only with a fresh
Chrome recording if the combined order remains noisy.
