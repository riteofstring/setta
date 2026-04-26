# HTML-in-Canvas Transform and Texture Performance Plan

## Goal

Fix poor continuous pan/zoom frame rate when many rich HTML-backed CanvasFlow nodes are visible, without fake rectangle LOD or visual degradation.

The immediate question is whether our current Canvas2D usage is leaving performance on the table. If it is not, move to the renderer shape used by the more advanced HTML-in-canvas demos: upload stable HTML into GPU textures when it changes, then pan/zoom textured quads every frame.

## Current Evidence

- Real Settings project, All Settings view, zoomed out:
  - default HTML nodes: about 75 FPS
  - diagnostic rect nodes: about 117 FPS
  - skip transform assignment: improves paint/style trace buckets but does not fix zoom FPS
  - edges, minimap, ResizeObserver, and gesture finalization are not the main continuous-frame bottleneck
- `captureElementImage()` is documented by WICG but is not exposed by current Playwright Chrome 147 in this repo.
- `WebGLRenderingContext.texElementImage2D` is exposed with `--enable-blink-features=CanvasDrawElement`.
- A second Canvas2D canvas cannot `drawElementImage()` from an element that is a child of the main canvas; Chromium throws `TypeError`. Any 2D bitmap cache therefore needs `captureElementImage()`, which is unavailable in this browser.
- Phase 1 execution result:
  - `world-transform-nodes` improved zoom FPS from roughly 73 to 81 in the Settings All Settings view.
  - It did not close the gap to `rect-nodes`, which remained around 117 FPS.
- Phase 2 execution result:
  - A same-canvas WebGL `texElementImage2D` POC was attempted and then removed from the branch because it crashed or hung Chromium before a usable Settings perf run.
  - See `perf/reports/frontend/2026-04-27_html-in-canvas-settings-all-webgl-texture-nodes-poc.md`.

## API Notes

These points come from the WICG HTML-in-Canvas explainer linked from `docs/plans/html-in-canvas-pan-zoom-plan.md`.

- `drawElementImage()` draws a direct child of the canvas and returns a transform for aligning the element's DOM hit-test/accessibility location.
- The canvas current transformation matrix is applied when drawing.
- CSS transforms on the source element are ignored for drawing, but still affect hit testing and accessibility.
- `requestPaint()` is intended for app-driven animation or camera motion.
- `PaintEvent.changedElements` identifies direct canvas children whose rendering changed.
- `texElementImage2D` and WebGPU `copyElementImageToTexture` are the intended 3D texture paths.

## Hypothesis

Our current Canvas2D path is valid but probably not the path used by the complex demos.

Current CanvasFlow does this per frame:

1. calculate each node's screen-space rect
2. call `ctx.drawElementImage(element, screenX, screenY, screenWidth, screenHeight)` for every visible node
3. assign the returned CSS transform to the DOM node wrapper

That means every viewport frame still asks Chromium to draw every visible rich HTML node through the HTML-in-canvas 2D snapshot path. A cloth or physics demo can afford complex transforms if the HTML is uploaded as a texture only when the HTML changes and then moved by the GPU every frame.

## Phase 1: Prove Or Disprove Canvas2D Transform Misuse

Add an explicit perf variant named `world-transform-nodes`.

Instead of converting nodes to screen-space rects before drawing, keep the viewport CTM active for node drawing:

```ts
ctx.save();
ctx.translate(viewport.x, viewport.y);
ctx.scale(viewport.zoom, viewport.zoom);
ctx.drawElementImage(element, node.x, node.y, node.width, node.height);
ctx.restore();
```

Keep applying the returned transform to the DOM node.

This should render identically. It tests whether Chromium's implementation handles CTM-driven transforms more efficiently than per-node destination scaling.

### Measurement

Run the same Settings All Settings harness:

```sh
SETTA_CANVASFLOW_PERF=1 \
SETTA_CANVASFLOW_PERF_TARGET=settings-all \
SETTA_CANVASFLOW_PERF_VARIANTS=default,world-transform-nodes,rect-nodes \
SETTA_CANVASFLOW_PERF_STEPS=36 \
SETTA_CANVASFLOW_PERF_START_ZOOM=0.1 \
./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts
```

Record:

- FPS and p95 input latency
- paint trace and composite trace
- `drawElementImageMs`
- transform assignment time
- total paint time
- visual screenshot comparison at the same viewport

### Decision

- If `world-transform-nodes` materially improves FPS without visual regression, make it the production Canvas2D node draw path.
- If it does not materially improve FPS, stop trying to optimize the Canvas2D per-frame HTML draw path and move to Phase 2.

## Phase 2: WebGL Texture Renderer Proof Of Concept

Build an opt-in perf variant named `webgl-texture-nodes`.

The goal is full-fidelity cached node images, not simplified placeholders.

### Architecture

Use the existing `<canvas layoutsubtree>` as the WebGL canvas for the variant.

Keep the existing direct DOM child node wrappers:

- They remain the authoritative React/HTML content.
- They remain available for hit testing, focus, text input, accessibility, popovers, and nested controls.
- Their CSS transform is computed from the graph viewport and node world rect, not from `drawElementImage()`.

Maintain a texture cache keyed by node id:

```ts
type NodeTextureEntry = {
  texture: WebGLTexture;
  cssWidth: number;
  cssHeight: number;
  version: number;
};
```

On paint:

1. Use `PaintEvent.changedElements` to invalidate changed node ids.
2. For visible nodes missing a texture or whose size changed, call `gl.texElementImage2D(..., element)` once to upload the current HTML snapshot.
3. For every visible textured node, draw a quad using the viewport transform.
4. Assign DOM transforms with our own 2D formula:
   - `translate(viewport.x + node.x * zoom, viewport.y + node.y * zoom) scale(zoom)`
5. Draw active/changing nodes through the existing Canvas2D path only if WebGL cannot safely upload them.

### Important Constraints

- Do not move node DOM outside the `layoutsubtree` canvas.
- Do not hide source nodes with `display: none`; direct children need generated boxes.
- Do not use fake rectangles as the user-facing path.
- Texture invalidation must be based on `PaintEvent.changedElements`, node size changes, node id removal, and explicit active/editing state.
- Release textures when nodes unmount or when the variant is disabled.
- Keep a hard failure in the perf variant if `texElementImage2D` is unavailable.

## Phase 3: Interaction Correctness

Before considering the texture path production-ready, verify real node interactions:

- click node
- focus text input
- type into settings inputs
- use nested controls
- open popovers/tooltips
- drag nodes
- select nodes
- connect edges
- keyboard navigation

The DOM transform formula must keep hit testing aligned with the drawn textured quad.

## Phase 4: Productionization Decision

Only promote `webgl-texture-nodes` if the Settings All Settings report shows a real continuous-frame improvement over default Canvas2D HTML drawing.

Acceptance target:

- zoomed-out Settings All Settings pan/zoom is close to the `rect-nodes` ceiling while preserving full node visuals
- no fake LOD during ordinary pan/zoom
- no regressions in interactive node behavior
- memory growth is bounded by visible/recent texture cache size

If WebGL texture upload still does not improve continuous FPS, the bottleneck is likely elsewhere in Chromium's HTML snapshot/compositing pipeline for our node content. At that point the next investigation should be node-content-specific CSS and component cost, especially shadows, filters, CodeMirror surfaces, terminals, media, and deeply nested controls.

## Verification

- Focused unit tests for:
  - changed-element invalidation
  - texture cache cleanup
  - DOM transform calculation
  - fallback/support assertions
- Playwright perf reports under `perf/reports/frontend/`.
- Raw ignored artifacts under `perf/artifacts/frontend/`.
- Chrome/CDP visual verification for Settings All Settings at zoom `0.1`.
- `./check_quality.sh` before committing.
