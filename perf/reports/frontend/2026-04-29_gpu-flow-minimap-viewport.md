# GPU Flow Minimap Viewport Updates

Date: 2026-04-29
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow-2 @ f0097a4d8 baseline

## Goal

Reduce Settings project All Settings zoom jitter after the WebGPU node texture path stopped mutating project state during wheel gestures.

## Scenario

- Entry point: `http://127.0.0.1:3022/settings`
- Data set: Settings project, All Settings view mode, 46 GPU flow nodes
- Browser + OS: local Chromium via `chrome-devtools-mcp` on macOS
- Build mode: Vite dev server via `./ai.sh`
- Steps:
  - Set GPU viewport transform to `[260, 110, 0.35]`.
  - Wait for texture uploads to settle.
  - Dispatch 80 synthetic wheel events on `.setta-gpu-flow.react-flow__pane`: first 40 zoom in, next 40 zoom out, 8 ms apart.
  - Wait 250 ms and record `requestAnimationFrame` frame deltas, long tasks, texture uploads, `requestPaint`, project-state changes, viewport changes, and minimap DOM mutations.

## Before (baseline)

- Measurement method: CDP `evaluate_script` benchmark on the current committed state before this refactor.
- Minimap on:
  - FPS: `94.9`
  - Average frame: `10.56 ms`
  - p50 frame: `8.3 ms`
  - p95 frame: `16.8 ms`
  - Max frame: `50.9 ms`
  - Long tasks: `0`
  - Texture uploads / requestPaints: `12 / 14` during first settled run
  - Project state changes: `0`
  - Viewport changes: `73`
  - Minimap DOM mutations: `92` total, `71` mask mutations
- Minimap off:
  - FPS: `110.8`
  - Average frame: `8.97 ms`
  - p50 frame: `8.3 ms`
  - p95 frame: `9.3 ms`
  - Max frame: `50.0 ms`
  - Long tasks: `0`
  - Texture uploads / requestPaints: `0 / 0`
  - Project state changes: `0`
  - Viewport changes: `73`

## After

- Change: minimap viewport `viewBox` and mask path updates are applied imperatively through a rAF-coalesced viewport-store subscription. React still owns minimap nodes and styles, but not per-wheel viewport updates.
- Minimap on:
  - FPS: `109.7`
  - Average frame: `9.11 ms`
  - p50 frame: `8.3 ms`
  - p95 frame: `9.2 ms`
  - Max frame: `50.0 ms`
  - Long tasks: `0`
  - Texture uploads / requestPaints: `0 / 0`
  - Project state changes: `0`
  - Viewport changes: `73`
  - Minimap DOM mutations: `92` total, `71` mask mutations
- Minimap off:
  - FPS: `109.3`
  - Average frame: `9.17 ms`
  - p50 frame: `8.3 ms`
  - p95 frame: `8.9 ms`
  - Max frame: `58.4 ms`
  - Long tasks: `0`
  - Texture uploads / requestPaints: `0 / 0`
  - Project state changes: `0`
  - Viewport changes: `73`

## Conclusion

- Minimap-on performance now matches minimap-off performance for the tested wheel gesture.
- The minimap still mutates SVG attributes per visual viewport frame, but those updates no longer force React renders.
- Remaining work toward a true 120 FPS ceiling should focus on the non-minimap frame spike source and production-build benchmarking.

## Raw Artifacts (local-only)

- CDP benchmark values were collected inline through `chrome-devtools-mcp`; no large trace artifact was saved for this pass.

## Automated Perf Tests

- Vitest: `frontend/src/gpuFlow/GpuMiniMap.test.tsx` verifies that viewport-store transform changes update minimap SVG viewport chrome after rAF without rerendering the minimap React component.
