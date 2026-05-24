# HTML GPU Surfaces Completion Verification

Date: 2026-05-02

## Scope

Final verification sweep for
`docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md`.

The browser run used:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

## Code Verification

Focused Vitest passed:

```bash
pnpm -C frontend exec vitest run tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts tests/e2e/gpuFlowInteractionLatencyProbe.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts src/gpuFlow/htmlSurfaces/apiProbes.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/hitScene.test.ts src/gpuFlow/htmlSurfaces/interactionProjector.test.ts src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/htmlSurfaces/sourceLayer.test.tsx src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/htmlSurfaces/warpedMeshFixture.test.ts src/gpuFlow/gpuPipelines.test.ts src/gpuFlow/GpuFlow.test.tsx --environment jsdom
```

Result: 14 files passed, 97 tests passed.

Scoped ESLint passed for the changed GPU verification and HTML surface files.
Full frontend typecheck was attempted; it still fails on broad pre-existing
non-GPU-flow errors. A filtered rerun found no remaining typecheck errors under
the changed GPU flow, HTML surface, or GPU pipeline files.

The large-graph stress fixture now imports the HTML surface owner directly:
`renderHtmlSurfaceFrame`, `HtmlSurfaceTextureManager`, and
`RenderHtmlSurfacesInput`. The active performance probe no longer recognizes
the deleted `.setta-gpu-flow__node--teleported` marker.

## Browser API Probes

CDP-ran `runHtmlSurfaceApiProbes()` in the live app:

| Metric                      | Value |
| --------------------------- | ----: |
| Required probe failures     |     0 |
| Required unsupported probes |     0 |
| Passing probes              |    13 |

Required browser behaviors verified:

- `copyElementImageToTexture`, `drawElementImage`, `requestPaint`, `onpaint`,
  `getElementTransform`, and `navigator.gpu` are present.
- Direct canvas-child upload succeeds and nested upload fails loudly.
- CSS transforms are ignored for capture and affect hit testing.
- Transform-only source movement fires paint in this Chromium build, so Setta's
  direct-source transform paint routing remains required.
- Source-subrect upload is callable.
- `paint.changedElements` identifies the dirty source owner.

## CDP Visual Check

Production project route: `http://127.0.0.1:3019/driving_dog`.

Live DOM counts after startup:

| Selector                         | Count |
| -------------------------------- | ----: |
| `canvas[layoutsubtree]`          |     1 |
| `[data-gpu-flow-surface="true"]` |     1 |
| `.setta-gpu-flow__html-source`   |     2 |
| `[data-gpu-flow-node="true"]`    |     2 |
| Teleport/settling selectors      |     0 |

Viewport screenshot:
`perf/reports/frontend/html-gpu-completion-production-2026-05-02.png`.

Screenshot pixel sanity over the canvas region reported `1,487` unique colors
and `4,222,400` non-white pixels, confirming the captured viewport was not
blank.

Chrome console after the sweep had no `error` or `warn` messages.

The complex warped mesh fixture was verified in the prior checked-in report:
`perf/reports/frontend/2026-05-02_html-gpu-warped-mesh-fixture.md`.
That run confirmed WebGPU mesh drawing (`vertexCount: 240`), mesh UV/local hit
projection, button toggle, slider drag, text input focus/fill, and texture
refresh through the warped GPU surface without a visible DOM overlay.

## Pan/Zoom Performance

The CDP performance sample used warmed production state and direct viewport
store updates to isolate the pure pan/zoom hot path from node-local wheel
handoff. Counters wrapped `GPUQueue.copyElementImageToTexture`,
`HTMLCanvasElement.requestPaint`, `GPUQueue.writeBuffer`, source style
mutations, and RAF frame intervals.

| Scenario   |         Steps | Texture uploads | `requestPaint` | Source style mutations | GPU writes               | Avg frame | P95 frame | Worst frame |
| ---------- | ------------: | --------------: | -------------: | ---------------------: | ------------------------ | --------: | --------: | ----------: |
| Store pan  | 24 transforms |               0 |              0 |                      0 | 23 camera uniform writes |   8.30 ms |   9.50 ms |    10.20 ms |
| Store zoom | 16 transforms |               0 |              0 |                      0 | 16 camera uniform writes |   8.29 ms |   8.50 ms |     9.90 ms |

Trace artifact:
`perf/artifacts/frontend/html-gpu-completion-panzoom-trace-2026-05-02.json.gz`.

The traced pan/zoom sequence also recorded zero texture uploads and zero
`requestPaint` calls; the only WebGPU queue writes were
`setta-html-surface-camera-uniform` writes. DevTools trace summary reported
`CLS: 0.00`.

Compared with the baseline report
`perf/reports/frontend/2026-04-30_gpu-flow-performance-baseline-instrumentation.md`,
the replacement keeps texture uploads at zero on the viewport path and removes
the old per-frame node quad vertex buffer writes from the sampled hot path.
