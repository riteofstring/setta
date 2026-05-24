# GpuFlow Source-Local Port Geometry

Date: 2026-05-03

Scope: Phase 3 scene-ownership port geometry slice.

## Baseline

- Prior scene-ownership baseline:
  `perf/reports/frontend/2026-05-03_gpuflow-scene-ownership-phase1-baseline.md`.
- Before this slice, edge handles were registered in
  `state/actions/edgeHandles.ts`; registration, reconnect start, and scheduled
  section updates recomputed handle centers with `getBoundingClientRect()` and
  converted screen coordinates to flow coordinates.

## After

- `state/actions/edgeHandles.ts` and `state/edgeHandleKeys.ts` were removed.
- `GpuFlow` port descriptors now store source-local rects, and edge endpoints
  are derived from `GpuFlowLayoutStore` node positions plus those descriptors.
- Live node move/resize no longer needs screen-DOM handle measurement for
  endpoint correctness; only explicit source-local port rect refreshes read
  source DOM offsets.

Focused verification:

- `pnpm -C frontend exec vitest run src/gpuFlow/ports/portGeometry.test.ts src/gpuFlow/Handle/utils.test.ts src/gpuFlow/Handle/handler.test.ts src/gpuFlow/GpuEdgeReconnectAnchors.test.tsx src/gpuFlow/edges/edgeSources.test.ts src/components/Pages/Project/gpuProjectEdgeScene.test.ts src/state/actions/edges.test.ts src/state/actions/nodeInternals.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/Handle/index.test.tsx src/components/Section/Container/MinimizedDataEdgeHandles.test.tsx src/components/Section/SectionParts/Search.test.tsx`
- CDP visual check confirmed a WebGPU `GpuFlow` pane, canvas, two source nodes,
  and GPU handle elements with the WebGPU/html-in-canvas flags.
