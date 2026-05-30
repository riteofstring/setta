# HTML Surface Transform Paint Routing

Date: 2026-05-01

## Scope

The initial HTML surface API probe showed that the local flagged Chromium build
fires one `paint` event after transform-only movement of a layout-subtree source
element. The new route-around treats that browser behavior as documented and
keeps it out of texture dirtying by suppressing only expected direct-source
paints after explicit transform-only writes.

Content paints still dirty the owning surface: descendant changes and enclosing
single-source changed subtrees continue to resolve to the surface id.

## Evidence

- Unit: `pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/htmlSurfaces/apiProbes.test.ts src/gpuFlow/GpuNodeLayer.test.tsx --environment jsdom` passed.
- Lint: `pnpm -C frontend exec eslint src/gpuFlow/htmlSurfaces/paintInvalidation.ts src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/htmlSurfaces/apiProbes.ts src/gpuFlow/htmlSurfaces/apiProbes.test.ts src/gpuFlow/GpuNodeLayer/nodeLayerFrame.tsx src/gpuFlow/GpuNodeLayer/nodeDomTransforms.tsx` passed.
- CDP: `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`, then `runHtmlSurfaceApiProbes()` through Vite returned `passCount: 13`, no required failures, and `transform-only-paint-invalidation` as a documented pass with `paintCount: 1`.

This check did not measure viewport upload/write counts; it verifies the source
paint classification needed before the source-layer replacement.
