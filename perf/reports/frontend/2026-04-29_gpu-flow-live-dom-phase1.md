# GPU Flow Live Active DOM Phase 1

Date: 2026-04-29
Area: frontend GPU flow
Route: `http://127.0.0.1:3019/settings`, Settings -> All Settings
Browser: Chrome 147.0.0.0 on macOS, DPR 2
Chrome flags: `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`

## Current Code Audit

- `GpuSurface` renders a WebGPU `<canvas layoutsubtree>` and forwards paint events to `GpuFlow`.
- `NodeTextureManager.uploadRecord()` uploads each node source element with `GPUQueue.copyElementImageToTexture(...)`.
- `GpuProjectSurface` budgets node texture uploads at `maxUploads: 2` and `maxDurationMs: 4`.
- `GpuActiveNodeOverlay` is currently an inert cloned mirror of the source node, not a real interactive DOM presentation.
- `nodeInteractionDirty` currently keeps interactive nodes dirty for a 240 ms feedback window. That produces repeated whole-node texture uploads during switches, input, and selection changes.

Reference files inspected before probing:

- `html-in-canvas/plugins/html-cloth.mjs`
- `html-in-canvas-room/extension/entrypoints/content.ts`
- `three-html-render/src/interactionManager.ts`
- `three-html-render/src/raycastInteractionManager.ts`
- `three-html-render/src/threeHTMLRenderer.ts`
- `three-html-render/src/htmlTexture.ts`
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
- `hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html`

## Browser API Probe

Observed API surface:

- `window.isSecureContext`: `true`
- `navigator.gpu`: present
- adapter `maxTextureDimension2D`: `16384`
- `HTMLCanvasElement.prototype.layoutSubtree`: present
- `HTMLCanvasElement.prototype.requestPaint`: present
- `HTMLCanvasElement.prototype.getElementTransform`: present
- `GPUQueue.prototype.copyElementImageToTexture`: present

## Probe 1: Promote Canvas Child Above Canvas

Probe setup:

- Inserted a fixed-position `<canvas layoutsubtree>` probe with a red canvas background.
- Appended a direct child `div` styled as a bright green `PROMOTED` rectangle with high `z-index`.
- Configured a WebGPU context on the probe canvas.
- Checked native hit testing and captured a CDP screenshot.

Result:

- `document.elementFromPoint(...)` hit the child.
- The screenshot showed only the red canvas area; the green child did not visually composite above the canvas.
- Screenshot artifact: `perf/reports/frontend/gpu-live-dom-promotion-probe-2026-04-29.png`

Conclusion:

- Strategy A is not viable in this Chromium build. A `<canvas layoutsubtree>` child can receive native hit testing, but CSS alone does not visually promote it above the WebGPU canvas.

## Probe 2: Capture Outside-Canvas Element

Probe setup:

- Created an outside-canvas fixed `div`.
- Requested a fresh WebGPU device and tried `queue.copyElementImageToTexture(outsideDiv, 96, 40, { texture })`.
- Compared with a current app node source element inside the configured GPU flow canvas.

Result:

| Source | Result | Detail |
| --- | --- | --- |
| Outside fixed `div` | Failed | `Only immediate children of the <canvas> element can be passed to copyElementImageToTexture().` |
| `settings-section__gui` canvas child | Succeeded | 636 x 406 px upload took 3.6 ms in a one-shot call |

Conclusion:

- The live overlay outside the canvas cannot be the capture source.
- Strategy B must keep the canvas-child node DOM as the texture source and render a separate outside-canvas active DOM layer for real interaction.

## Baseline Interaction Measurement

Instrumentation:

- Patched `HTMLCanvasElement.prototype.requestPaint` and `GPUQueue.prototype.copyElementImageToTexture` in-page.
- Collected `PerformanceObserver` long tasks.
- Clicked the `settings-section__gui` `Left Side Pane Shifts Map` switch via CDP.
- Filled the `settings-section__gui` filter input with `gpu` via CDP.

Switch click:

- Time from click to first observed switch state/visual change: 9.2 ms.
- Apparent thumb transition duration from sampled computed transform: 158.4 ms.
- Whole-node texture uploads during the switch feedback window: 23 uploads of `settings-section__gui`.
- Upload dimensions during the switch: 828 x 528 px.
- Upload durations during the switch: mostly 1.2-1.6 ms, with an initial 3.5 ms sample.
- Long tasks during/near the switch sample: 68 ms and 250 ms.

Text input:

- CDP typed `gpu` into the visible node-local filter input.
- The input stayed focused and the caret ended at offset 3.
- Last-character visible value latency sample: 228.7 ms. This run included DevTools-induced long tasks of 109 ms, 91 ms, 52 ms, 82 ms, and 52 ms, so this is a noisy upper-bound sample rather than a clean keyboard latency number.
- Whole-node texture uploads during the text sample: 37 uploads of `settings-section__gui`.
- Upload dimensions shrank after filtering from 828 x 528 px to 828 x 147 px.

Combined interaction counters:

- `requestPaint`: 74 calls.
- `copyElementImageToTexture`: 60 calls.
- Active overlay: still an inert mirror path; no real interactive live DOM layer.

Slider:

- No `input[type="range"]` was available in the reset Settings -> All Settings fixture.

## Whole-Node Capture Cost

Measured with seven direct `queue.copyElementImageToTexture(...)` calls per visible Settings node after clearing the filter.

| Node | CSS size | Upload size | Text length | Median | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `settings-section__gui` | 317.9 x 202.7 | 636 x 406 | 698 | 2.2 ms | 2.1 ms | 4.5 ms |
| `settings-section__backend` | 317.9 x 202.7 | 636 x 406 | 356 | 1.8 ms | 1.7 ms | 2.9 ms |
| `settings-section__sectionSizingPolicy` | 317.9 x 202.7 | 636 x 406 | 2883 | 2.2 ms | 2.0 ms | 2.7 ms |
| `settings-section__shortcuts` | 317.9 x 202.7 | 636 x 406 | 1882 | 1.8 ms | 1.4 ms | 2.7 ms |

Fixture availability:

- CodeMirror GPU node: not present in the reset Settings fixture.
- Terminal GPU node: not present in the reset Settings fixture.
- Chat GPU node: not present as a GPU node in the reset Settings fixture; the visible chat window is outside the GPU node layer.

## Decision

Use Strategy B.

The next implementation step should add a separate outside-canvas active DOM layer while preserving the canvas-child source node for final texture capture. The active layer must own real browser pointer and keyboard interaction, and the GPU node quad should be suppressed only after the active DOM layer has mounted. Final settle upload must still copy from the canvas-child source element because outside-canvas capture is rejected by the browser.
