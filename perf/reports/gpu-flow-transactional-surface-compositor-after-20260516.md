# GPU Flow Transactional Surface Compositor After Report - 2026-05-16

Implementation and verification report for
`docs/plans/gpu-flow-transactional-surface-compositor-refactor-plan.md`.

## Baseline

Earlier reports captured the repair-based retained path:

- `perf/reports/retained-text-like-row-diagnostics-20260513.md`: passive
  text-like readiness could leave hundreds of retained rows missing or blank.
- `perf/reports/gpu-flow-pan-zoom-runtime-baseline-20260513.md`: dense
  pan/zoom was blocked by synchronous viewport-store fanout more than renderer
  draw time.
- `perf/reports/gpu-flow-visual-continuity-refactor-after-20260516.md`:
  pre-publish repair avoided visible blanks, but retained scroll still sampled
  around one 60 Hz frame at p95 and the architecture depended on repair.

## Implementation Summary

- Added `frontend/src/gpuFlow/surfaceCompositor/` contracts for immutable
  actors, generations, coverage proofs, display transactions, scheduling, and
  diagnostics.
- Retained display-frame publication now resolves a
  `SurfaceDisplayTransaction` and reports exact, compatible, held, blocked, or
  cold-placeholder outcomes instead of pre-publish true-hole repair.
- Retained page maintenance is scheduler-only follow-up work. Small visible
  snapshot-exact replacements may run during interaction; large refinement sets
  defer after submit.
- Retained text-like source filtering and page preparation now share the same
  filtered source set, so passive row readiness and prepared coverage do not
  disagree within a visible frame.
- DOM sections, edge labels, selection, resize, and drag overlays now expose
  surface actor metadata.
- Interaction projection is centralized in `htmlSurfaces/interactionProjector`
  for source projection and active DOM island alignment.
- Diagnostics now include transaction outcome, held-motion counters, desired
  and published viewport/scroll samples, true-hole count, protected resource
  counts, generation count, and bounded retained texture metrics.

## Browser Contract

- Supported browser/channel for this run: Chrome for Testing Canary
  `150.0.7835.0`.
- Required runtime APIs: native html-in-canvas `layoutsubtree`, `paint`,
  `requestPaint()`, `copyElementImageToTexture`, and WebGPU
  adapter/device/context support.
- Required local flags used for CDP verification:
  `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`.
- Minimum Chromium version for this implementation remains tied to the pinned
  repo Chrome for Testing build until the html-in-canvas API is stable.
- Unsupported browsers: browsers without native html-in-canvas and WebGPU
  support. There is no fallback DOM renderer for this path.
- Expected failure UI: the existing GPU Flow capability failure surface for
  missing html-in-canvas/WebGPU APIs.
- Pinned E2E tooling: Playwright `1.59.1`, Chrome for Testing Canary
  `150.0.7835.0`.
- Capability probe coverage is exercised by the GPU Flow browser/E2E tests and
  the Settings retained compositor specs; CDP also confirmed `navigator.gpu`
  was available and the Settings page did not show the html-in-canvas support
  error.

## Recorded Sample

JSONL artifact:

```sh
perf/reports/gpu-flow-transactional-surface-compositor-after-20260516.jsonl
```

Source command:

```sh
SETTA_RETAINED_COMPOSITOR_PERF_JSONL=../perf/reports/gpu-flow-transactional-surface-compositor-after-20260516.jsonl \
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-transactional-performance.spec.ts
```

Result: passed, `1` test.

Environment:

- OS: macOS Darwin `25.3.0`, arm64.
- Hardware: Apple M1 Pro, 8 logical CPUs, 32 GiB memory.
- Browser: Chrome for Testing Canary `150.0.7835.0`.
- Display baseline/control cadence: p50 `16.7ms`, p95 `17.9ms`, max `24.0ms`.
- Cadence lane: `ci-capped`. This local sample is a 60 Hz-class environment,
  not a strict 120 Hz proof.

Scene shape:

- Nodes: `46`.
- Retained rows: `476`.
- Retained surfaces: `45`.
- Control kinds: `color-picker`, `dropdown`, `nested`, `switch`,
  `text-like`.

Gesture metrics:

| Workload | Frame p50 | Frame p95 | Frame p99 | Max | Slow ratio | Long tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| pan | `8.3ms` | `10.2ms` | `10.3ms` | `10.3ms` | `0` | `0` |
| zoom | `8.3ms` | `9.9ms` | `10.1ms` | `10.3ms` | `0` | `0` |
| retained-hover zoom | `8.3ms` | `10.2ms` | `16.8ms` | `24.7ms` | `0.016` | `0` |
| retained scroll | `8.3ms` | `24.5ms` | `25.4ms` | `25.4ms` | `0.054` | `0` |
| retained scroll then zoom | `8.3ms` | `16.7ms` | `33.3ms` | `50.2ms` | `0.048` | `1`, max `52ms` |
| switch then zoom | `8.3ms` | `10.2ms` | `10.3ms` | `10.3ms` | `0` | `0` |

Input and visual checks:

- Native page scroll: `0 -> 0` during retained scroll ownership.
- Retained scroll signature changed: first visible row Y `144 -> 265.9`.
- Viewport changed after pan: `{ x: 324.5, y: 47, zoom: 1 } ->
  `{ x: -981.1, y: 168.9, zoom: 1 }`.
- Viewport changed after zoom: zoom `1 -> 1.4`.
- Retained visual nonblank ratio: `0.9811 -> 0.9815`.
- Active text-like DOM island aligned within the spec threshold after
  activation.
- Text-like activation latency was recorded at `253.1ms`; it is preserved as a
  diagnostic sample, not asserted as a strict budget in the current CI lane.

Transaction and diagnostics sample:

- Held/diverged transaction count: `0`.
- Max diverged held motion age: `0ms`.
- Probe outcomes: `78` `publish-compatible`, `2` `publish-cold-placeholder`.
- Max retained frame probe duration: `44.5ms`.
- Max target descriptor count/refinement pages: `90`.
- Max uploaded bytes in one retained frame: `4,194,304`.
- Max upload/raster time: `3.3ms` upload, `0.4ms` raster.
- Max held transaction duration/age: `0ms`.
- Max true-hole count in the filtered probe: `1`, only on intentional
  cold-placeholder frames after explicit viewport/control recentering; gesture
  hold diagnostics did not record repeated stale-motion holds.

The CI long-task budget for the retained compositor helper is `55ms` to cover
isolated Chrome boundary samples in CI. The strict local 120 Hz lane still uses
the `50ms` long-task budget and `8.5ms` p95 frame target when explicitly enabled
with `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1`.

## CDP Visual Verification

Manual CDP verification used the dev server at `http://127.0.0.1:3019/settings`
with the required Chrome flags.

- Desktop probe: title `Settings`, viewport `1440x716`, one canvas, `476`
  retained rows, no html-in-canvas/CanvasDrawElement support error.
- Mobile emulation probe: viewport `390x844`, DPR `2`, one canvas, `476`
  retained rows, no html-in-canvas/CanvasDrawElement support error.
- A11y snapshots were saved to `/tmp/setta-gpuflow-compositor-desktop-snapshot.txt`
  and `/tmp/setta-gpuflow-compositor-mobile-snapshot.txt`.
- CDP screenshot capture timed out through both the MCP screenshot tool and a
  raw `Page.captureScreenshot` request, so screenshot artifacts were not
  preserved.

## Verification

Full GPU Flow-related Vitest gate:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow \
  src/components/Pages/Project/GpuProjectSurface \
  src/components/Pages/Project/GpuProjectSurface.grid.test.ts \
  src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts \
  src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts \
  src/components/Pages/Project/gpuProjectEdgeScene.test.ts \
  src/components/Pages/Project/gpuProjectInteractionGuards.test.ts \
  src/components/Pages/Project/gpuProjectPaneEvents.test.ts \
  tests/e2e/gpuFlowInteractionLatencyProbe.test.ts \
  tests/e2e/gpuFlowLargeGraphStressFixture.test.ts \
  tests/e2e/gpuFlowPerformanceProbe.test.ts \
  tests/e2e/gpuFlowVisualParityProbe.test.ts
```

Result: passed, `154` files and `1008` tests.

Full retained/GPU Flow Playwright gate:

```sh
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/gpu-flow/*.spec.ts \
  frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts \
  frontend/tests/e2e/settings/settings-retained-*.spec.ts
```

Result: passed, `44` tests.

Focused follow-up checks after the final scroll/maintenance fixes:

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/flowFrame.test.ts`:
  passed, `10` tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`:
  passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts`:
  passed, `5` tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts`:
  passed.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-transactional-performance.spec.ts`
  with JSONL recording: passed, `1` test.

Manual Chrome trace recording was intentionally omitted for this report. The
automatic Playwright/Vitest gates and CDP probes were the acceptance evidence;
the strict trace bundle can be produced separately for lab-grade 120 Hz
hardware validation.

## Residual Risk

This run does not claim 120 Hz hardware behavior because the measured idle
baseline was 60 Hz-class. The strict 120 Hz lane remains available and should be
run on a measured 120 Hz-capable browser/display path.

Text-like activation still has a recorded long-task/latency tail in this local
sample. It is visible in the JSONL and should be the next focused optimization
if the product requires native island activation to meet the same gesture
budget as pan and zoom.
