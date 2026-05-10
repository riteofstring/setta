# HTML GPU Stable Source Placement

Date: 2026-05-01

## Baseline Reference

- Current-branch baseline evidence remains
  `perf/reports/frontend/2026-04-30_gpu-flow-performance-baseline-instrumentation.md`
  and the related 2026-04-30 GPU flow reports.
- This slice targets the next replacement step: viewport movement must stop
  rewriting per-node source transforms while retaining cached GPU texture
  rendering.

## Implementation Evidence

- `GpuNodeLayer` source sync now writes stable capture geometry:
  `translate(0px, 0px) scale(1)`, node width/height, and passive
  `pointer-events: none`.
- Flat hit targeting projects the single target source to the pointer-local
  coordinate before resolving native descendants.
- Pointer interaction move projection is O(1): the active source is the only DOM
  source whose transform is updated for a pointer event.

## Focused Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuNodeLayer.test.tsx src/gpuFlow/activeNodeTargeting.test.ts src/gpuFlow/htmlSurfaces/interactionProjector.test.ts src/gpuFlow/htmlSurfaces/sourceLayer.test.tsx src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/GpuFlow.test.tsx src/gpuFlow/GpuFlow.activeNodePaint.test.ts src/gpuFlow/nodeInteractionDirty.test.ts src/gpuFlow/GpuActiveNodeTeleport.test.ts src/gpuFlow/GpuActiveNodeSnapshot.test.ts src/gpuFlow/interactions/panZoom.test.ts --environment jsdom`
  passed: 97 tests.
- Focused frame assertion: a second viewport-only frame kept
  `domTransformUpdatedNodeIds: []`, `domTransformParkedNodeIds: []`, and
  `GPUQueue.copyElementImageToTexture` at 1 total call from the initial upload.

## CDP Evidence

Command:

```sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Loaded the default project view in Chrome DevTools Protocol.
- Audited layout-subtree source hosts.
- Instrumented `GPUQueue.prototype.copyElementImageToTexture` and source host
  style mutations, then clicked the zoom-in control once.

Observed:

- `sourceCount: 2`
- `directSourceCount: 2`
- Both sources were direct `CANVAS` children with `layoutsubtree` enabled.
- Source transforms before and after zoom:
  `translate(0px, 0px) scale(1)`.
- Source pointer events before and after zoom: `none`.
- Zoom frame upload calls: `0`
- Zoom frame source style mutations: `0`
- Zoom frame non-stable transform mutations: `0`

Screenshot:

- `perf/reports/frontend/2026-05-01_html-gpu-stable-source-placement-cdp.png`

## Blocked Verification

- `pnpm -C frontend typecheck` remains blocked by broad pre-existing frontend
  type errors outside this slice, beginning with
  `src/components/AppHeader/FollowAIToggleButton.tsx` and continuing through
  unrelated chat/utils tests and generated type consumers.
