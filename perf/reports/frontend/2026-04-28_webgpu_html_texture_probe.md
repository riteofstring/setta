# WebGPU HTML Texture Probe

Date: 2026-04-28
Area: frontend
Branch/Commit: go-rewrite-canvas-replace-xyflow-2 @ c6ce8c9a4
Related PR: optional

## Goal

Validate the local Chromium html-in-canvas and WebGPU API surface required by `docs/plans/webgpu-html-texture-pan-zoom-plan.md` before implementing the GPU flow renderer.

Code paths touched by this report:

- None. This is an API probe and decision record for the future `frontend/src/gpuFlow/*` renderer.

## Scenario

- Entry point: `http://127.0.0.1:8765/`, served by `python3 -m http.server`.
- Browser: Chrome 147.0.0.0 on macOS, Apple M1 Pro, DPR 2.
- Chrome flags: `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`.
- Measurement method: Chrome DevTools Protocol `evaluate_script` probes against native browser APIs. The page was a localhost secure context.
- References consulted:
  - `example_html_in_canvas_repos/html-in-canvas-official/README.md`
  - `example_html_in_canvas_repos/html-in-canvas-cracks/src/main.js`
  - `example_html_in_canvas_repos/html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - `example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`

## Probe Results

Secure context and browser:

- `window.isSecureContext`: `true`
- User agent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36`

html-in-canvas APIs:

- `HTMLCanvasElement.prototype.layoutSubtree`: present
- `HTMLCanvasElement.prototype.requestPaint`: present
- `HTMLCanvasElement.prototype.getElementTransform`: present
- `HTMLCanvasElement.prototype.captureElementImage`: absent
- `CanvasRenderingContext2D.prototype.drawElementImage`: present
- `canvas.onpaint`: fires after `requestPaint()`

Transform and hit-testing behavior:

- A direct canvas child with `transform: translate(80px, 30px)` was drawn through `ctx.drawElementImage(child, 0, 0, 64, 40)`.
- Pixel sample at the untransformed draw location: `[255, 40, 40, 255]`.
- Pixel sample at the CSS-transformed location: `[0, 0, 0, 0]`.
- `elementFromPoint()` at the transformed location hit the child.
- `elementFromPoint()` at the original location hit the canvas.
- Conclusion: CSS transforms affect native hit testing but are ignored by html-in-canvas capture, matching the plan's coordinate model.

Input and focus events inside canvas children:

- Programmatic range/text interaction produced `input=2`, `beforeinput=1`, `change=1`, `focusin=1`.
- The probe requested paint on each dirty event. Same-frame requests coalesced into one subsequent paint event, which is expected browser behavior.
- The renderer should still schedule at most one upload per interactive node per frame from dirty tracking.

WebGPU:

- `navigator.gpu`: present
- Adapter: Apple M1 Pro via `metal-3`
- Adapter `maxTextureDimension2D`: `16384`
- Default requested device `maxTextureDimension2D`: `8192`
- `GPUQueue.prototype.copyElementImageToTexture`: present
- `GPUQueue.prototype.copyExternalImageToTexture`: present
- Queue methods observed: `copyElementImageToTexture`, `copyExternalImageToTexture`, `onSubmittedWorkDone`, `submit`, `writeBuffer`, `writeTexture`

WebGPU element upload:

- Calling `queue.copyElementImageToTexture()` on a child of a `layoutsubtree` canvas that had no rendering context failed with:
  - `copyElementImageToTexture(): containing canvas does not have a rendering context.`
- After creating and configuring a WebGPU context on the containing canvas:
  - `const context = sourceCanvas.getContext("webgpu")`
  - `context.configure({ device, format: "bgra8unorm", alphaMode: "premultiplied" })`
- This call succeeded:
  - `queue.copyElementImageToTexture(child, 64, 40, { texture })`
- Texture readback sample after `copyTextureToBuffer`: `[255, 40, 40, 255]`
- Conclusion: the WebGPU renderer can use native element-to-texture upload, but the source `layoutsubtree` canvas must also be the configured WebGPU canvas or otherwise have a rendering context.

WebGL2:

- `WebGL2RenderingContext.prototype.texElementImage2D`: present
- Upload from a canvas child succeeded with `gl.getError() === 0`.
- Framebuffer status after attaching the uploaded texture: `FRAMEBUFFER_COMPLETE` (`36053`).
- Readback sample: `[255, 40, 40, 255]`.
- Conclusion: WebGL2 upload is available, but it is not needed as a renderer fallback because the required WebGPU upload path is also available.

## Implementation Consequences

- Proceed with the WebGPU renderer rather than pausing for a WebGL2 decision point.
- The support gate must fail loudly if `navigator.gpu`, `canvas.requestPaint`, `canvas.onpaint`, `ctx.drawElementImage`/html-in-canvas support, or `device.queue.copyElementImageToTexture` is absent.
- The GPU flow canvas should be created with `layoutsubtree` and configured with a WebGPU context before node texture upload.
- The first renderer device request should consider `requiredLimits.maxTextureDimension2D = adapter.limits.maxTextureDimension2D` when available, because the local adapter supports `16384` but the default device exposed `8192`.
- Do not plan around `captureElementImage`; it was absent in the local browser.
- Dirty input handling should expect browser paint requests to coalesce within a frame and should keep its own per-frame upload budget.

## Raw Artifacts

- No large local artifacts were saved. Probe outputs are captured in this report.

## Automated Perf Tests

- None added in this probe-only step.
