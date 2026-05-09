# GpuFlow Scene Ownership Phase 1 Baseline

Date: 2026-05-03
Area: frontend
Branch/Commit: `go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan @ e435b3449`

## Goal

Capture the current dense pan/zoom and selected/group movement baselines before
moving live scene ownership into `GpuFlow`.

## Scenario

- Entry point: `/settings` in the local Vite app.
- Browser: Chrome for Testing 149 through the repo CDP helper.
- Command:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Code paths audited:
  - `frontend/src/gpuFlow/htmlSurfaces/*`
  - `frontend/src/components/Pages/Project/GpuProjectSurface/nodeSelectionOverlay.tsx`
  - `frontend/src/components/Pages/Project/gpuProjectSelectionMovement.ts`
  - `frontend/src/state/actions/nodeInternals.ts`

## Before (baseline)

### Dense Pan/Zoom

The current dense pan/zoom baseline is the checked-in production `GpuFlow`
large-graph fixture from
`perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-cdp.md`.

Fixture shape:

| Metric | Value |
| --- | ---: |
| Nodes | 1,000 |
| Edges | 1,427 |
| Active gesture duration | 707.7 ms |
| RAF intervals over 16.7 ms / 33.3 ms | 0 / 0 |
| Long tasks | 0 |
| Active-window texture uploads | 0 |
| Active-window `requestPaint()` calls | 0 |
| Source mutations / transform writes | 0 / 0 |
| Store updates / transform / flag updates | 86 / 81 / 5 |
| WebGPU writes | 98 |
| Camera uniform writes | 81 calls / 2,592 bytes |
| Flat vertex writes | 17 calls / 94,944 bytes |

This remains the relevant before value for Phase 2 layout-store and later
viewport-sensitive ownership moves: warmed pan/zoom does not recapture HTML
textures or rewrite source DOM during active gestures.

### Selected/Group Movement

Fresh CDP run on `/settings` used warmed dynamic imports and a disposable
Setta project-state fixture with three top-level sections. It exercised the
current project-owned movement path directly:

- `moveProjectSelectionDragItems()`
- `updateNodePositions()`
- `updateProjectSelectionBoundsAfterMovedNodes()`
- `updateSelectedNodePositionsFromKeyboard()`

The full React pointer overlay remains covered by focused tests listed below.
The CDP metric sample avoided untrusted pointer-capture/auto-pan quirks and
measured the owner functions that currently run on each live movement step.

| Sample | Runs | Elapsed ms | OpenAPI/fetch calls | `useNodeInternals.setState()` | Viewport store `setState()` | Result |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Selection group live step | 5 | `0.4, 0.2, 0.2, 0.2, 0.2` | 0 | 1 per run | 0 | 2 nodes moved by `{x:20,y:20}`; selection bounds shifted to `{x:30,y:40,w:150,h:130}` |
| Keyboard nudge with one locked selected node | 1 | `0.4` | 0 | 1 | 0 | unlocked node moved by `{x:5,y:0}`; bounds refreshed to `{x:15,y:20,w:145,h:130}` |

Current ownership observations:

- Live selected/group movement still mutates the project `useNodeInternals`
  map, not a renderer-owned layout store.
- Selection bounds are shifted or recomputed in `gpuFlowViewportStore`, but the
  driving hit target and pointer lifecycle are still project DOM overlay code.
- Live movement does not call OpenAPI. Durable layout persistence is scheduled
  only by the stop path through `setZIndices(..., true)` and the existing
  debounced top-level layout commit.
- Auto-pan is still owned by `GpuProjectNodesSelectionOverlay` and requests a
  recurring GPU animation frame while dragging near the viewport edge.

## After

Append the same dense pan/zoom and selected/group movement measurements after
the relevant ownership move. The expected comparison points are:

- layout-store move: live node movement should update `GpuFlow` layout records,
  not rebuild renderer geometry from `useNodeInternals` during the frame.
- selection-drag move: selected/group movement, keyboard nudge, and auto-pan
  should share the generic `GpuFlow` layout-change pipeline.

## Conclusion

Phase 1 has enough performance baseline coverage to start the first
performance-relevant runtime ownership move. Dense pan/zoom has production
large-graph browser counters, and selected/group movement now has current CDP
operation counters plus focused pointer/auto-pan behavior tests.

## Raw Artifacts (local-only)

- Existing dense pan/zoom artifacts are listed in
  `perf/reports/frontend/2026-05-02_html-gpu-dense-panzoom-cdp.md`.
- This selection/group movement pass used CDP `evaluate_script` counters only;
  no large local trace artifact was created.

## Automated Perf Tests

- `pnpm -C frontend exec vitest run tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts --environment jsdom`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface/nodeSelectionOverlay.test.ts`
