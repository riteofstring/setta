# GPU Flow Atomic Retained Display Frame After Report - 2026-05-15

Implementation progress and residual risk for the retained display frame refactor.

## Recorded Large-Scene Sample

- JSONL artifact: `perf/reports/gpu-flow-atomic-retained-display-frame-after-20260515.jsonl`
- Source command: `SETTA_RETAINED_COMPOSITOR_PERF_JSONL=perf/reports/gpu-flow-atomic-retained-display-frame-after-20260515.jsonl ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- Browser: repo Chrome for Testing Canary `150.0.7835.0`.
- Cadence lane: refresh-aware `ci-capped`, not a claimed 120 Hz hardware run.

Large scene shape:

- Nodes: `46`
- Retained rows: `476`
- Retained surfaces: `45`
- Control kinds: `color-picker`, `dropdown`, `nested`, `switch`, `text-like`
- Sampled retained surface: `settings-section__shortcuts:param-content:unpinned`
- Visible retained rows in sampled surface: `15`

Latest representative frame cadence from the `2026-05-15T18:40:50.700Z` recorded sample:

- Pan: frame p95 `8.9ms`, max `9.4ms`, slow-frame ratio `0`, long-task max `0ms`
- Viewport zoom: frame p95 `8.9ms`, max `9.2ms`, slow-frame ratio `0`, long-task max `0ms`
- Retained-hover zoom: frame p95 `9.2ms`, max `9.4ms`, slow-frame ratio `0`, long-task max `0ms`
- Retained section scroll: frame p95 `9.3ms`, max `9.3ms`, slow-frame ratio `0`, long-task max `0ms`
- Scroll then retained-hover zoom: frame p95 `9.2ms`, max `24.9ms`, slow-frame ratio `0.010`, long-task max `0ms`

Visible content checks from the recorded sample:

- Before retained visual nonblank ratio: `0.9819`
- After retained visual nonblank ratio: `0.9819`
- Native page scroll stayed fixed at `0` during retained section scrolling.
- Retained scroll signature changed from first-row Y `144` to `-1150.3`.

## Verification Summary

- Focus, typing, and follow-up retained section scroll: passed.
- Close zoom retained text sharpness: passed.
- Full `frontend/tests/e2e/gpu-flow` Playwright directory: passed.
- GPU Flow probe helpers under `frontend/tests/e2e/gpuFlow*.test.ts`: passed under Vitest. The plan's Playwright-wrapper command is not valid for these Vitest probe files in this checkout.
- Retained settings activation, focused editor scroll, large-scene compositor cadence, fast zoom visibility, and All Settings scroll performance specs: passed.
- `./scripts/quality/check.sh`: passed.
- CDP visual check: All Settings rendered with canvas present, `476` retained debug rows, `18` visible retained debug rows, visible retained labels present, and no console errors. Console messages were limited to Vite/React dev messages, the existing React Router future-flag warning, and the existing form-field accessibility issue.

## Residual Risk

This run used refresh-aware local cadence thresholds and did not prove true 120 Hz-class hardware behavior. The latest All Settings large-scene sample records no interaction long tasks over `50ms`; the remaining performance caveat is that this is still a local refresh-aware run, not a confirmed 120 Hz hardware run.
