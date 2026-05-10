# GpuFlow Selection Drag Ownership

Date: 2026-05-03

Scope: Phase 4 scene-ownership selection/group movement slice.

## Baseline

- Prior scene-ownership baseline:
  `perf/reports/frontend/2026-05-03_gpuflow-scene-ownership-phase1-baseline.md`.
- Before this slice, `GpuProjectNodesSelectionOverlay` rendered selected-node
  bounds as a project DOM sibling and wrote live group drag and keyboard nudge
  positions into `useNodeInternals` during interaction frames.

## After

- `GpuFlow` owns the selected-node bounds hit target, group drag, keyboard
  nudge, auto-pan, temporary z-index, and live layout-store movement.
- Project code now supplies Setta permissions, DnD handle registration,
  context-menu callbacks, and final durable position/z-index commits only.
- Selection bounds are recomputed from `GpuFlowLayoutStore` selected-node
  queries as layout changes, rather than from project node internals during the
  live interaction frame.

Focused verification:

- `pnpm -C frontend exec vitest run src/gpuFlow/interactions/selectionDrag.test.ts src/components/Pages/Project/GpuProjectSurface/nodeSelectionOverlay.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/interactions/nodeDrag.test.ts`
- ESLint on touched selection-drag, GpuFlow surface, and project adapter files.
- CDP with WebGPU/html-in-canvas flags and the existing ResizeObserver shim
  confirmed the project rendered a `GpuFlow` pane, WebGPU canvas, and three
  source nodes after creating a temporary project. A scripted marquee-selection
  gesture through CDP timed out before producing a selected-bounds rect; the
  temporary project was deleted.
