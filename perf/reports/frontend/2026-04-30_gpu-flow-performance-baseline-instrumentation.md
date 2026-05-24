# GPU Flow Performance Baseline Instrumentation

Date: 2026-04-30

## Scope

Added a reusable browser-side GPU flow performance probe for Playwright/CDP
checks:

- `frontend/tests/e2e/gpuFlowPerformanceProbe.ts`
- `frontend/tests/e2e/gpuFlowPerformanceProbe.test.ts`

The probe is isolated to the E2E/test surface and does not add production
test-only branches. It records:

- `requestAnimationFrame` frame intervals
- long tasks via `PerformanceObserver`
- `GPUQueue.copyElementImageToTexture()` calls with node id and active/passive
  status when the source element is a GPU flow node descendant
- `GPUQueue.writeBuffer()` calls with GPU buffer labels and byte counts
- optional `onNodeLayerFrame` summaries through a page-owned
  `recordNodeLayerFrame(result)` callback

## Fresh Architecture Audit

Current Phase 1 status:

- The production `GpuFlow` owner already exposes `onNodeLayerFrame`, so frame
  summaries can be captured without adding global runtime state.
- `GpuProjectSurface` does not pass an instrumentation callback by default.
  Browser baselines can still use page-injected queue/RAF/long-task wrappers,
  and targeted harnesses can wire `recordNodeLayerFrame(result)` through the
  existing prop.
- The next phase's hot-path risk is confirmed in code inspection:
  `GpuNodeQuadRenderer.render()` rebuilds and rewrites node quad vertex data on
  every render.

## Focused Browser Sample

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Settings -> All Settings
- Warmed for 1 second after initial render
- CDP-injected probe around `requestAnimationFrame`, long tasks, and WebGPU
  queue methods
- 18 wheel-pan events dispatched against `.setta-gpu-flow.react-flow__pane`
- Viewport screenshot:
  `perf/reports/frontend/gpu-flow-performance-probe-settings-pan-2026-04-30.png`

Observed metrics:

| Metric | Value |
| --- | ---: |
| Probe queue wrappers installed | yes |
| RAF callbacks sampled | 18 |
| Worst sampled frame interval | 10.58 ms |
| Long tasks | 0 |
| `copyElementImageToTexture()` calls | 0 |
| `writeBuffer()` calls | 38 |
| Camera uniform writes | 19 |
| Node quad vertex writes | 19 |
| Visible GPU nodes | 5 |
| Total mounted GPU nodes | 5 |

Interpretation:

- Texture uploads stayed off the sampled viewport-only pan path after warmup.
- Node quad vertex writes still occur on every sampled viewport frame, matching
  the Phase 2 hot-path hypothesis and giving the next implementation step a
  concrete before value.
- The sample did not yet cover direct node movement, active interaction,
  active pan/zoom, minimap navigation, or a large synthetic graph.

## Verification

```bash
pnpm -C frontend exec vitest run tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom
```

Result: 2 tests passed.
