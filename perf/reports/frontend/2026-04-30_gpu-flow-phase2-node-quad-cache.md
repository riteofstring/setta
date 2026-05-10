# GPU Flow Phase 2 Node Quad Cache

Date: 2026-04-30

## Scope

Phase 2 renderer-owner change in `GpuNodeQuadRenderer`:

- cache the last uploaded node quad geometry and vertex payload
- skip `setta-gpu-node-quad-vertices` uploads when only the viewport changes
- keep camera uniform writes for changed viewports
- skip duplicate camera uniform writes when the encoded camera is unchanged

Command used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Browser probe:

- CDP-injected wrappers around `GPUQueue.writeBuffer()` and
  `GPUQueue.copyElementImageToTexture()`
- CDP-injected RAF waits to let Settings -> All Settings warm existing textures
  before resetting counters
- Settings GPU canvas viewport: 1400 x 700 CSS px

Screenshot:

- `perf/reports/frontend/gpu-flow-phase2-node-quad-cache-2026-04-30.png`

## Before And After

Baseline from
`perf/reports/frontend/2026-04-30_gpu-flow-phase1-baseline-coverage.md`:

| Scenario | Texture uploads | WriteBuffer labels |
| --- | ---: | --- |
| Settings -> All Settings wheel pan | 0 | camera 27, node vertices 27 |
| Settings -> All Settings toolbar zoom | 0 | camera 39, node vertices 39 |
| Settings minimap drag and click | 0 | camera 5, node vertices 5 |

After this change:

| Scenario | Long tasks | Texture uploads | WriteBuffer labels | Node vertex writes |
| --- | ---: | ---: | --- | ---: |
| Settings warmed single wheel pan | 0 | 0 | camera 1 | 0 |
| Settings warmed small wheel zoom | 0 | 0 | camera 1 | 0 |
| Settings toolbar zoom-in, 3 clicks | 0 | 0 | camera 3, node vertices 1 | 1 |

The toolbar zoom sample still produced one node vertex upload because the drawn
quad set changed during the gesture. The pure viewport-only pan and zoom samples
kept the node quad vertex buffer stable after warmup.

## Focused Verification

```bash
pnpm -C frontend exec vitest run src/gpuFlow/gpuPipelines.test.ts --environment jsdom
```

The focused tests cover:

- viewport-only redraws rewrite the camera uniform but not node vertices
- node geometry changes rewrite node vertices once
- identical camera uniforms do not rewrite the camera buffer
