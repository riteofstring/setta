# GPU Flow Retained Compositor Runtime Refactor

Date: 2026-05-14

Plan: `docs/plans/gpu-flow-retained-compositor-runtime-refactor-plan.md`

## Scope

This report records the current retained compositor acceptance evidence for the
runtime refactor. The current implementation:

- samples retained scroll/hover/scrollbar state during frame composition instead
  of applying runtime state back into retained scenes;
- composes row hover and scrollbar feedback as native visual overlays;
- keeps committed retained page coverage reusable through viewport frames;
- uses larger production retained pages for common visible settings surfaces;
- packs retained pages into shared texture atlases and batches consecutive flat
  quads that share the same texture bind group, so retained composition is no
  longer limited to one bind/draw per page when pages share an atlas;
- uses a cached row-band hit index so retained pointer routing checks hit
  records for the relevant visible row geometry instead of scanning every
  retained hit record for each pointer interaction;
- adds plan-specific compositor behavior tests:
  - `frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`;
  - `frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`.

## Baseline Status

A disposable baseline worktree was created at current `HEAD` before the
uncommitted refactor changes:

```sh
git worktree add --detach "$baseline_dir" HEAD
```

Only the new retained compositor test files were copied into that worktree. The
baseline checkout could not run from a bare dependency install because the
existing frontend workspace relies on checked-out dev dependency directories, so
the disposable worktree reused the current `.tools`, `.venv`, `frontend/node_modules`,
and `frontend/plugin-sdk/app-subsystem/node_modules` directories by symlink.
The normal Playwright wrapper was then run with JSONL output enabled:

```sh
SETTA_RETAINED_COMPOSITOR_PERF_JSONL=/tmp/setta-retained-baseline-final.jsonl \
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts \
  frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Result: failed before-refactor baseline, `1 passed`, `1 failed`.

The retained-hover zoom cadence test passed in this CI-capped baseline run. The
latest Chrome recording cited by the plan remains the retained-hover
before-refactor evidence: `~33-35ms` p95 frame intervals with `41-50ms` frame
gaps when ctrl-wheel zooming over retained rows.

The retained-section scroll test failed in the disposable baseline and
reproduced the scroll class of the observed bug:

- control RAF cadence: p50 `8.3ms`, p95 `10.2ms`, max `16.7ms`;
- retained section scroll: p50 `8.9ms`, p95 `26.4ms`, p99/max `75.1ms`,
  slow-frame ratio `0.295`, 2 long tasks, max `79ms`;
- retained scroll event spacing: p50 `63.94ms`, p95/max `122.33ms`, slow ratio
  `1.000`;
- scroll then retained-hover zoom: p50 `9.6ms`, p95 `33.1ms`, p99 `66.7ms`,
  max `74.7ms`, slow-frame ratio `0.357`, 2 long tasks, max `78ms`;
- scroll then retained-hover event spacing: p50 `30.0ms`, p95 `73.1ms`,
  p99/max `125.55ms`, slow ratio `1.000`;
- native page scroll stayed `0 -> 0`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9809` after scroll, `0.9807` after the combined gesture.

## Current CI-Capped Run

Command:

```sh
SETTA_RETAINED_COMPOSITOR_PERF_JSONL="$tmp_report" \
  ./scripts/run-playwright-e2e.sh \
    frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts \
    frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Result: `3 passed (22.2s)`.

Browser: Chrome for Testing Canary `150.0.7835.0`, macOS arm64.

The run used the CI behavior lane. The harness measured the page RAF cadence in
the same browser run and applied a capped-browser budget. This is not a
substitute for the plan's local 120Hz performance gate.

### Retained-Hover Zoom Cadence

Control RAF cadence: p50 `8.3ms`, p95 `16.7ms`, max `16.7ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Viewport zoom away from retained content | 8.3ms | 9.7ms | 25.1ms | 74.9ms | 0.016 | 1, max 80ms |
| Retained-hover zoom | 8.3ms | 10.3ms | 25.1ms | 67.5ms | 0.023 | 1, max 72ms |

Observed behavior:

- viewport zoom changed from `1.0` to `1.9`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9819` after;
- retained-hover zoom stayed in the same cadence class as non-retained zoom.

### Retained Section Scroll Then Retained-Hover Zoom

Control RAF cadence: p50 `8.3ms`, p95 `9.7ms`, max `16.6ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Retained section scroll | 8.3ms | 9.1ms | 10.3ms | 10.3ms | 0.000 | 0 |
| Scroll then retained-hover zoom | 8.3ms | 9.7ms | 16.6ms | 66.9ms | 0.010 | 1, max 73ms |

Observed behavior:

- retained scroll signature changed;
- viewport zoom changed from `1.0` to `1.2`;
- native page scroll stayed `0 -> 0`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9809` after scroll, `0.9807` after the combined gesture.

### All Settings Large Scene

Scene summary:

- canvas graph nodes: `46`;
- retained rows: `476`;
- retained surfaces: `45`;
- retained control kinds: `color-picker`, `dropdown`, `nested`, `switch`,
  `text-like`.

Control RAF cadence: p50 `8.3ms`, p95 `10.0ms`, max `16.7ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Viewport pan | 8.3ms | 9.6ms | 25.1ms | 75.0ms | 0.016 | 1, max 77ms |
| Viewport zoom away from retained content | 8.3ms | 10.0ms | 25.0ms | 75.0ms | 0.016 | 1, max 84ms |
| Retained-hover zoom | 8.3ms | 10.3ms | 17.8ms | 66.8ms | 0.024 | 1, max 73ms |
| Retained section scroll | 8.3ms | 9.8ms | 75.0ms | 75.0ms | 0.029 | 1, max 78ms |
| Scroll then retained-hover zoom | 8.3ms | 10.0ms | 15.5ms | 16.3ms | 0.000 | 0 |

Observed behavior:

- viewport pan moved the y transform by more than `8px`;
- viewport zoom changed from `1.0` to `2.3`;
- retained scroll signature changed;
- native page scroll stayed `0 -> 0`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9819` after.

## Final CI-Capped Rerun

Command:

```sh
tmp_report=/tmp/setta-retained-compositor-final-hit-index.jsonl
rm -f "$tmp_report"
SETTA_RETAINED_COMPOSITOR_PERF_JSONL="$tmp_report" \
  ./scripts/run-playwright-e2e.sh \
    frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts \
    frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Result: `3 passed (22.2s)`.

Browser: Chrome for Testing Canary `150.0.7835.0`, macOS arm64.

This run includes the retained texture atlas path, renderer run batching, and
row-banded retained hit-test index. It is still a CI behavior lane run, not
local 120Hz acceptance evidence.

### Retained-Hover Zoom Cadence

Control RAF cadence: p50 `8.3ms`, p95 `16.6ms`, max `16.7ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Viewport zoom away from retained content | 8.3ms | 9.9ms | 25.0ms | 74.9ms | 0.016 | 1, max 83ms |
| Retained-hover zoom | 8.3ms | 10.1ms | 25.0ms | 68.0ms | 0.023 | 1, max 72ms |

Observed behavior:

- viewport zoom changed from `1.0` to `1.9`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9819` after;
- retained-hover zoom stayed in the same cadence class as non-retained zoom.

### Retained Section Scroll Then Retained-Hover Zoom

Control RAF cadence: p50 `8.4ms`, p95 `9.5ms`, max `9.8ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Retained section scroll | 8.3ms | 9.1ms | 10.2ms | 10.2ms | 0.000 | 0 |
| Scroll then retained-hover zoom | 8.3ms | 9.8ms | 16.8ms | 66.5ms | 0.019 | 1, max 74ms |

Observed behavior:

- retained scroll signature changed;
- viewport zoom changed from `1.0` to `1.2`;
- native page scroll stayed `0 -> 0`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9809` after scroll, `0.9807` after the combined gesture.

### All Settings Large Scene

Scene summary:

- canvas graph nodes: `46`;
- retained rows: `476`;
- retained surfaces: `45`;
- retained control kinds: `color-picker`, `dropdown`, `nested`, `switch`,
  `text-like`.

Control RAF cadence: p50 `8.3ms`, p95 `9.7ms`, max `16.9ms`.

| Gesture | p50 | p95 | p99 | max | slow ratio >16.7ms | long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Viewport pan | 8.3ms | 9.2ms | 26.2ms | 76.4ms | 0.016 | 1, max 81ms |
| Viewport zoom away from retained content | 8.3ms | 9.5ms | 10.2ms | 74.9ms | 0.008 | 1, max 82ms |
| Retained-hover zoom | 8.3ms | 10.3ms | 17.6ms | 67.7ms | 0.016 | 1, max 73ms |
| Retained section scroll | 8.3ms | 10.1ms | 75.1ms | 75.1ms | 0.029 | 1, max 78ms |
| Scroll then retained-hover zoom | 8.3ms | 10.0ms | 10.4ms | 16.4ms | 0.000 | 0 |

Observed behavior:

- viewport pan moved the y transform by more than `8px`;
- viewport zoom changed from `1.0` to `2.3`;
- retained scroll signature changed;
- native page scroll stayed `0 -> 0`;
- retained section nonblank ratio stayed high: `0.9807` before,
  `0.9819` after.

## Manual Chrome Trace

Command:

```sh
SETTA_RETAINED_COMPOSITOR_CHROME_TRACE=/tmp/setta-retained-compositor-current-trace.json \
  ./scripts/run-playwright-e2e.sh \
    frontend/tests/e2e/settings/manual-retained-compositor-chrome-trace.spec.ts
```

Result: `1 passed (11.8s)`.

Trace: `/tmp/setta-retained-compositor-current-trace.json`, 225,664 events.

The trace contains explicit marks for viewport zoom, retained-hover zoom,
retained scroll, and scroll-then-zoom windows. Durations below are Chrome trace
`X` events inside each marked window.

| Window | Duration | RunTask p95/max, >=1ms events | >50ms RunTask | FireAnimationFrame p95/max | Dominant long function |
| --- | ---: | ---: | ---: | ---: | --- |
| Viewport zoom away from retained content | 995.7ms | 9.7ms / 72.9ms | 1 | 4.6ms / 9.5ms | `performWorkUntilDeadline` 72.9ms |
| Retained-hover zoom | 957.8ms | 4.9ms / 73.0ms | 1 | 4.2ms / 4.5ms | `performWorkUntilDeadline` 72.9ms |
| Retained section scroll | 481.1ms | 11.3ms / 26.5ms | 0 | 5.1ms / 5.6ms | none above 30ms |
| Scroll then retained-hover zoom | 1519.8ms | 11.6ms / 77.6ms | 1 | 5.1ms / 5.4ms | `performWorkUntilDeadline` 77.5ms |

Trace interpretation:

- the same React scheduler function,
  `react-dom_client.js:performWorkUntilDeadline`, produces the isolated
  `72-78ms` outliers in non-retained viewport zoom and retained-hover/combined
  windows;
- retained-hover zoom has lower traced animation-frame work than the
  non-retained viewport zoom control window: p95 `4.2ms` versus `4.6ms`, max
  `4.5ms` versus `9.5ms`;
- retained scroll and scroll-then-zoom animation-frame work stays under
  `5.6ms` in the trace;
- traced paint/raster/GPU work is small in the marked windows: viewport zoom has
  `Paint` max `2.2ms` and `RasterImplementation::RasterCHROMIUM` max `1.9ms`;
  retained-hover zoom has `Layerize` max `2.4ms`, `GPUTask` max `1.2ms`, and
  `RendererRasterWorker` max `1.1ms`;
- the trace does not show retained page generation, raster/upload, or page-count
  dependent draw work dominating active input windows after the refactor.

## Local 120Hz And Adjusted Target

The current CI-capped run is strong behavior evidence, but it is not a clean
120Hz pass. The strict 120Hz command was still attempted:

Strict-mode command attempted:

```sh
SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 \
  ./scripts/run-playwright-e2e.sh \
    frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts \
    frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts
```

Result: failed on the first test before running the remaining strict windows.

Current strict-mode first-window data after atlas batching:

- control RAF cadence: p50 `8.4ms`, p95 `16.6ms`, max `16.6ms`;
- viewport zoom away from retained content: p50 `8.3ms`, p95 `10.1ms`,
  p99 `25.1ms`, max `76.6ms`, 1 long task max `84ms`;
- retained-hover zoom: p50 `8.3ms`, p95 `10.3ms`, p99 `24.9ms`, max
  `66.7ms`, 1 long task max `75ms`;
- failure threshold: p95 `<= 8.5ms`, p99 `<= 16.7ms`, max `<= 50ms`,
  long task max `<= 50ms`.

This strict run is not clean local 120Hz evidence because the measured control
cadence itself had p95 `16.6ms`. The Chrome trace above identifies the remaining
strict p99/max failures as isolated browser/React scheduler outliers that also
occur during the non-retained viewport zoom control window.

The local-performance replacement target for this refactor is therefore the
plan's trace-backed adjustment path:

- p95 frame interval `<= 11.1ms` for viewport pan, viewport zoom,
  retained-hover zoom, retained section scroll, and scroll-then-retained-hover
  zoom;
- retained-hover zoom and retained-section scroll must remain in the same
  cadence class as comparable non-retained viewport gestures, with no
  retained-specific p95 regression above `1.0ms`;
- p99/max and long-task outliers must remain reported, but isolated
  `performWorkUntilDeadline` scheduler outliers are not treated as retained
  compositor failures unless they correlate with retained-specific slowdown;
- retained visible content must remain nonblank and native page scroll must stay
  owned by the canvas during retained-section wheel gestures.

The post-atlas run satisfies this adjusted target:

- large-scene p95 values were `9.2ms` pan, `9.5ms` viewport zoom, `10.3ms`
  retained-hover zoom, `10.1ms` retained section scroll, and `10.0ms`
  scroll-then-retained-hover zoom;
- retained-hover zoom p95 was within `0.2ms` of non-retained viewport zoom in
  the focused cadence test and within `0.8ms` in the large-scene test;
- retained section scroll p95 was `9.1ms` in the focused test and `10.1ms` in
  the large-scene test;
- visual nonblank ratios stayed at approximately `0.98` across the measured
  retained sections, and native page scroll stayed `0 -> 0`.
