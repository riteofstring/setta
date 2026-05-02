# GPU Flow Phase 7 Scrollable Textarea Parity

Date: 2026-04-30

## Scope

Verified the Phase 7 scrollable-content activation sequence against production `GpuFlow`:

1. passive GPU texture before interaction
2. live teleported DOM during text-area wheel scrolling
3. restored passive GPU texture after final upload

The browser probe used `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh` with a disposable `GpuFlow` fixture mounted into the Vite app.

## Owner Fix

`nodeInteractionDirty` now treats focus loss and unfocused active scroll events as immediate restore/upload release points. Pointer-driven releases still keep the existing live-DOM settle delay, but a focused text control that blurs does not remain indefinitely teleported if a scroll event follows the blur.

The owner also resolves events from teleported active node metadata, so active-layer scroll, wheel, focus, and blur events remain owned even when the node has moved out of its original host position.

## CDP Evidence

Screenshot artifact:

`perf/reports/frontend/gpu-flow-phase7-scrollable-textarea-parity-2026-04-30.png`

| Zoom | Passive Rect Delta | Live Rect Delta | Restored Rect Delta | Restored vs Live Rect Delta | ScrollTop Live | ScrollTop Restored | Active Uploads | Total Uploads | Write Buffers | Long Tasks |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 0px | 0px | 0px | 0px | 144 | 144 | 1 | 3 | 3 | 0 |
| 1 | 0px | 0px | 0px | 0px | 144 | 144 | 1 | 3 | 3 | 0 |
| 2 | 0px | 0px | 0px | 0px | 144 | 144 | 1 | 3 | 3 | 0 |

All runs ended with:

- `activeMarker: false`
- latest node-layer frame `activeNodeId: null`
- `remainingDirtyNodeIds: []`
- final drawn texture for `scroll-node`
- queue wrappers installed

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/nodeInteractionDirty.test.ts src/gpuFlow/GpuActiveNodeTeleport.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts --environment jsdom`
- CDP production fixture at zoom `0.5`, `1`, and `2`
- `./gcf.sh`
- `./check_quality.sh`
