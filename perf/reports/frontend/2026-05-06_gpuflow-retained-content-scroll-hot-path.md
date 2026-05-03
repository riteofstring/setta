# GpuFlow Retained Content Scroll Hot Path

Date: 2026-05-06

## Baseline

- Latest recording:
  `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260506-131022`
- Route: `/settings`
- Viewport noted by plan: `1200x672`
- Console/page errors containing
  `retained content scroll x must be a finite non-negative number`: `4`
- Plan-observed wheel events over retained canvas content: `400`
- Plan-observed scroll-window renderer work: `gpu-flow-frame` averaged about
  `0.34ms`, while frame cadence averaged about `47fps`
- Baseline ownership issue: wheel scroll offsets entered React state through
  `layoutAdapter.setContentScrollOffsets`, making `contentScrollOffsets` a
  `getProjectGpuFlowScene` dependency and allowing wheel input to rebuild the
  retained scene/source canvases.

## Change Under Test

- Retained wheel updates are rAF-coalesced before notifying scroll owners.
- The project GPU layout adapter keeps latest retained-content offsets in a
  ref for hot scroll readers, while durable semantic reveals still commit a
  React update.
- Each wheel flush updates the renderer-owned `GpuFlowScene` for the affected
  retained surface and redraws that source canvas imperatively.
- The texture manager marks only the affected retained surface dirty after the
  redraw.

## Focused Verification

The focused Vitest coverage verifies the after-shape of the hot path:

- two wheel events before an animation frame produce one scroll owner flush and
  one `requestFrame("viewport")`
- the second wheel uses the pending hot offset, so deltas compose before React
  state is involved
- retained scene recreation preserves the owner row metadata and changes only
  the affected surface in the `GpuFlowScene`
- imperative retained source redraw updates the source canvas without a React
  remount path

Command:

```sh
pnpm -C frontend exec vitest run src/gpuFlow/retainedContentScene.test.ts src/gpuFlow/retainedContentScroll.test.ts src/gpuFlow/interactions/retainedContentScroll.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/components/Pages/Project/GpuProjectSurface/projectGpuSearchReveal.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.test.ts
```

Result: `6 passed`, `74 tests passed`.

## Remaining Measurement

This slice has focused automated evidence only. Phase 2 remains open until a
fresh Settings Chrome repro records no sustained retained-content scroll below
`55fps` and confirms texture uploads during wheel scroll are limited to the
affected retained surfaces.
