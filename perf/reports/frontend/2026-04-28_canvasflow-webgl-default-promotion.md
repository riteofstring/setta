# CanvasFlow WebGL Default Promotion Check

Date: 2026-04-28
Area: frontend
Branch/Commit: go-rewrite-canvasflow-webgl-first-loop working tree
Related PR: n/a

## Goal

Record the evidence for making `webgl-texture-nodes` the default CanvasFlow
renderer when the browser exposes the required HTML-in-Canvas WebGL APIs.

## Method

- Code path: default renderer selection now checks
  `HTMLCanvasElement.prototype.requestPaint` and
  `WebGLRenderingContext.prototype.texElementImage2D` before selecting WebGL.
- Explicit `window.__settaCanvasFlowRenderer = "2d"` still forces the 2D
  renderer for tests and fallback debugging.
- CDP runtime: `CHROME_EXTRA_ARGS=--enable-blink-features=CanvasDrawElement ./ai.sh`.
- Screen: Settings, All Settings, real CanvasFlow nodes.

## Evidence

- CDP reported `rendererMode=webgl-texture-nodes`,
  `webglContextCreated=true`, and `drawElementImageMs=0.00`.
- Support probe reported `requestPaint=function`,
  `WebGLRenderingContext.prototype.texElementImage2D=function`, and
  `canvas.getContext("webgl").texElementImage2D=function`.
- Direct CanvasFlow node wrappers remained direct canvas children.
- A viewport wheel frame advanced WebGL frames with no texture-upload increase:
  `webglTextureUploadsTotal` stayed at `9`.
- Screenshot artifact:
  `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/codex-canvasflow-webgl-first.20260427-224323.r0fMBl/state/canvasflow-webgl-default-cdp.png`.

## Verification

- `pnpm -C frontend exec vitest run src/canvasflow/canvasFlowEdges.test.ts src/canvasflow/canvasFlowWebglEdges.test.ts src/canvasflow/canvasFlowRenderer.test.ts src/canvasflow/canvasFlowHtmlTextureCache.test.ts src/canvasflow/canvasFlowDomTransform.test.ts src/canvasflow/canvasFlowGeometry.test.ts src/forks/xyflow/core/components/Handle/utils.test.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-webgl-settings-interactions.spec.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-data-edges.spec.ts`

## Remaining Gaps

- Real pointer edge creation through data-edge handles is still blocked in the
  current Dict-section fixture because the handle center is covered by the
  section body; the spec continues to seed the initial edge before verifying
  canvas-owned selection and reconnect gestures.
- Box-select coverage remains incomplete. Attempts to arm the selection key and
  drag a background selection rectangle did not select the target sections in
  the current fixture.
