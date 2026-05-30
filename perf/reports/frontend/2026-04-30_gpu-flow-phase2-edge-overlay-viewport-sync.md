# GPU Flow Phase 2 Edge Overlay Viewport Sync

Date: 2026-04-30

## Target

Remove high-frequency React state work from edge label and edge reconnect
overlay viewport movement. Before this change, `GpuFlow` stored
`edgeLabelViewport` in React state and called `setEdgeLabelViewport()` for every
viewport transform update, causing both overlay layers to receive a new viewport
prop during pan, zoom, minimap navigation, and viewport animation.

After this change, edge label and reconnect layers subscribe to the GPU viewport
store directly and coalesce wrapper `style.transform` updates through
`requestAnimationFrame`. React still owns label and anchor content when the edge
scene changes, but viewport-only movement no longer rerenders or remounts that
content.

## Focused Verification

Command:

```bash
pnpm -C frontend exec vitest run src/gpuFlow/GpuEdgeLabels.test.tsx src/gpuFlow/GpuEdgeReconnectAnchors.test.tsx src/gpuFlow/GpuFlow.test.tsx --environment jsdom
```

Result:

- 3 files passed, 11 tests passed.
- Edge label viewport-store update: React render count stayed at `1`, the label
  DOM node identity stayed stable, and the layer transform changed from
  `translate(0px, 0px) scale(1)` to `translate(25px, -15px) scale(1.5)` after
  the local frame flush.
- Edge reconnect viewport-store update: React render count stayed at `1`, the
  reconnect anchor DOM node identity stayed stable, and the layer transform
  changed from `translate(0px, 0px) scale(1)` to
  `translate(-30px, 45px) scale(0.75)` after the local frame flush.

## Browser Sample

Command:

```bash
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Scenario:

- Settings -> All Settings.
- Warmed the GPU flow surface, injected browser-only wrappers around
  `GPUQueue.prototype.copyExternalImageToTexture`/`copyElementImageToTexture`,
  `GPUQueue.prototype.writeBuffer`, long tasks, animation frames, and edge
  overlay DOM mutations.
- Dispatched one wheel pan and one ctrl-wheel zoom over the GPU canvas.

Results:

- `copyElementImageToTexture`/`copyExternalImageToTexture`: `0`.
- `writeBuffer`: `2`.
- Write buffer labels: `setta-gpu-node-quad-camera-uniform: 2`.
- Long tasks: `0`; worst long task: `0 ms`.
- Average sampled frame interval: `8.7 ms`.
- Edge label layer present in this Settings sample: `false`.
- Edge reconnect layer present in this Settings sample: `false`.
- Overlay child-list mutations: `0`; overlay style-attribute mutations: `0`.

Artifact:

- `perf/reports/frontend/gpu-flow-phase2-edge-overlay-2026-04-30-settings.png`

## Notes

The live Settings project did not expose edge label or reconnect overlay DOM in
this sample, so browser evidence covers the viewport-only GPU hot path and
absence of texture uploads. Overlay-specific DOM stability is covered by the
focused owner tests against the production overlay components and viewport
store.
