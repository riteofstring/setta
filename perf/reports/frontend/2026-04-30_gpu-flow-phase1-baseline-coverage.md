# GPU Flow Phase 1 Baseline Coverage

Date: 2026-04-30

## Scope

This report extends
`perf/reports/frontend/2026-04-30_gpu-flow-performance-baseline-instrumentation.md`
with the remaining Phase 1 baseline scenarios.

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Browser probe:

- CDP-injected wrapper around `requestAnimationFrame`, long tasks,
  `GPUQueue.copyElementImageToTexture()`, and `GPUQueue.writeBuffer()`.
- Settings measurements used a pre-document-load probe so RAF counts include the
  existing `GpuSurface` renderer.
- Synthetic measurements mounted the production `GpuFlow` component by dynamic
  Vite import in a disposable in-page harness and wired
  `onNodeLayerFrame(result)` to the same probe.
- Synthetic pointer-drag measurements no-op patched pointer-capture methods
  because untrusted CDP-created `PointerEvent` objects cannot own browser
  pointer capture. The production node-drag controller, node state update, and
  renderer path were still exercised.

Screenshot:

- `perf/reports/frontend/gpu-flow-phase1-baseline-coverage-2026-04-30.png`

## Baseline Results

| Scenario | Frame count | Avg FPS | Worst frame ms | Long tasks | Texture uploads | Active uploads | WriteBuffer calls | WriteBuffer labels | Visible nodes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| Settings -> All Settings wheel pan | 27 | 111.40 | 25.00 | 0 | 0 | 0 | 54 | camera 27, node vertices 27 | 5 DOM |
| Settings -> All Settings toolbar zoom | 49 | 101.05 | 41.70 | 0 | 0 | 0 | 78 | camera 39, node vertices 39 | 5 DOM |
| Settings minimap drag and click | 7 | 120.01 | 16.89 | 0 | 0 | 0 | 10 | camera 5, node vertices 5 | 5 DOM |
| Synthetic direct node move | 5 | 160.00 | 10.20 | 0 | 0 | 0 | 6 | camera 3, node vertices 3 | 32 layer visible |
| Synthetic active text input type | 6 | 42.83 | 83.33 | 0 | 0 | 0 | 12 | camera 6, node vertices 6 | 16 layer visible |
| Synthetic active switch click | 2 | 60.00 | 16.67 | 0 | 0 | 0 | 4 | camera 2, node vertices 2 | 16 layer visible |
| Synthetic active pan while teleported | 30 | 51.94 | 141.70 | 0 | 4 | 0 | 60 | camera 30, node vertices 30 | 14 layer visible |
| Synthetic large graph, 1,000 nodes, wheel pan | 41 | 45.27 | 133.33 | 0 | 101 | 0 | 82 | camera 41, node vertices 41 | 80 layer visible |

## Operation-Count Notes

- Settings viewport-only pan and minimap navigation did not call
  `copyElementImageToTexture()` after warmup.
- Settings viewport-only pan, Settings zoom, and minimap navigation still
  rewrote `setta-gpu-node-quad-vertices` on every sampled viewport frame. This
  confirms the Phase 2 target with a broader baseline than the initial seed
  report.
- Active text input and switch interaction kept active-node texture uploads at
  zero while the node was teleported.
- Active pan while teleported uploaded four passive textures for newly visible
  non-active synthetic nodes and still uploaded zero active textures.
- The 1,000-node synthetic graph mounted 1,000 production `GpuFlow` nodes; the
  sampled pan drew 80 layer-visible nodes and uploaded 101 passive textures while
  moving across new graph regions.

## Phase 1 Status

Phase 1 reusable instrumentation and baseline coverage are now sufficient to
start Phase 2. The remaining measurable issue class is no longer a Phase 1
instrumentation gap: viewport-only frames continue to rewrite unchanged node
quad vertices.

