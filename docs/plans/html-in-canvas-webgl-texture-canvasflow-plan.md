# CanvasFlow WebGL HTML Texture Renderer Plan

## Goal

Make zoomed-out CanvasFlow pan/zoom smooth when many rich HTML-backed nodes are visible, without hiding content, replacing nodes with fake rectangles, or reducing interaction quality.

The proposed renderer should follow the high-performance HTML-in-Canvas shape used by WebGL demos: upload stable HTML into GPU textures when the HTML changes, then pan/zoom textured quads every frame.

## Primary Reference

- [fimbox/html-in-canvas `plugins/html-cloth.mjs`](https://github.com/fimbox/html-in-canvas/blob/main/plugins/html-cloth.mjs)

Useful observations from the cloth demo:

- It starts from a WebGL/PlayCanvas canvas, not a 2D canvas.
- It adds `layoutsubtree` to that same graphics canvas.
- It appends an HTML source element as a direct child of the canvas.
- It uploads the HTML source element with `gl.texElementImage2D(...)` inside a canvas `paint` event requested by `canvas.requestPaint()`.
- It animates textured GPU geometry in the normal graphics render loop after upload; it does not redraw the HTML through `ctx.drawElementImage()` for every visual transform.
- It maps pointer input manually because the cloth is a deformed 3D mesh. CanvasFlow's flat 2D node quads should be able to keep normal DOM hit testing by applying the correct CSS transform to each source node.

The important lesson is not the cloth physics. The important lesson is the renderer boundary: HTML-in-Canvas provides the source pixels, while WebGL handles high-frequency transforms.

## Current Mismatch

Current CanvasFlow uses the simpler 2D live snapshot path:

1. `CanvasFlow` calls `canvas.getContext("2d")`.
2. Every canvas `paint` scans visible nodes.
3. Every visible node is drawn with `ctx.drawElementImage(element, ...)`.
4. The returned transform is assigned to the DOM source node for hit testing.

That means a zoomed-out pan/zoom frame still asks Chromium to draw many rich HTML subtrees through the 2D HTML snapshot path.

The cloth demo avoids that shape. It uploads HTML into a WebGL texture and lets GPU geometry transforms carry the high-frequency motion. Our previous in-app WebGL POC likely failed because it tried to graft WebGL texture work onto a canvas path that had already committed to a 2D context.

## Non-Goals

- Do not implement fake low-detail node placeholders as the user-facing fix.
- Do not hide node contents to improve benchmark numbers.
- Do not keep both 2D and WebGL contexts on the same canvas. The renderer must choose one context family before initialization.
- Do not add a compatibility renderer for browsers without `CanvasDrawElement`; this branch can fail loudly.
- Do not rewrite `SectionContainer` bodies unless a specific component is proven incompatible with texture upload.

## Target Architecture

Add a WebGL-first CanvasFlow renderer path:

```text
CanvasFlow root
  <canvas layoutsubtree>
    direct DOM child: node wrapper A
    direct DOM child: node wrapper B
    direct DOM child: node wrapper C

paint/render:
  upload dirty visible node wrappers with gl.texElementImage2D()
  draw background/grid in WebGL
  draw edges in WebGL
  draw visible node textures as quads in WebGL
  apply computed CSS transforms to node wrappers for hit testing
```

The HTML node wrappers remain the authoritative React content and the source for accessibility, focus, text input, popovers, and nested controls. The WebGL renderer only changes how their pixels are presented during canvas rendering.

Suggested module split:

```text
frontend/src/canvasflow/
  canvasFlowRenderer.ts
  canvasFlow2dRenderer.ts
  canvasFlowWebglRenderer.ts
  canvasFlowWebglShaders.ts
  canvasFlowHtmlTextureCache.ts
  canvasFlowDomTransform.ts
  canvasFlowWebglEdges.ts
```

`CanvasFlow` should select the renderer before calling any context API. The WebGL path must never call `getContext("2d")` on the layoutsubtree canvas.

## Texture Cache Model

Maintain one texture entry per node at first. Do not build an atlas until texture binds are proven to dominate.

```ts
type CanvasFlowNodeTextureEntry = {
  cssHeight: number;
  cssWidth: number;
  dirty: boolean;
  lastUsedFrame: number;
  nodeId: string;
  texture: WebGLTexture;
  uploadCount: number;
};
```

Invalidate entries when:

- `PaintEvent.changedElements` includes the node wrapper.
- node width or height changes.
- the node wrapper mounts or unmounts.
- theme, selection, hover, focus, editing, or validation state changes its rendered output.
- the WebGL context is lost or restored.

On each render:

1. Query visible node draw records.
2. Ensure each visible node has a texture entry.
3. Upload only entries that are missing or dirty with `gl.texElementImage2D(...)`.
4. Draw all visible textured nodes as quads sorted by existing z order.
5. Mark entries used by frame number.
6. Evict textures outside the mounted/visible window or over a memory budget.

Memory accounting should be explicit:

```text
estimated bytes = cssWidth * cssHeight * 4
```

Use a conservative cap first, then measure real GPU memory behavior.

## Paint And Scheduling

Follow the demo shape: `paint` establishes the HTML snapshot boundary, and the WebGL render loop consumes the resulting texture on a later animation frame.

For CanvasFlow:

- viewport pan/zoom calls `canvas.requestPaint()`
- node/content changes call `canvas.requestPaint()`
- the `paint` handler uploads dirty HTML textures or marks texture sources ready for upload
- WebGL drawing happens from the normal requestAnimationFrame/render loop after the `paint` callback has returned
- pure viewport frames should not call `texElementImage2D()` unless a visible node is dirty

This keeps the expensive HTML snapshot boundary tied to HTML changes rather than camera motion.

The standalone probe found that direct `texElementImage2D()` before an initial cached paint record fails with `No cached paint record`, which matches the WICG model. It also found that upload during `paint` followed by immediate same-turn draw/readback can hang in Chrome. The implementation must preserve an explicit frame boundary between HTML capture/upload and WebGL consumption.

## DOM Transform And Hit Testing

The 2D path currently uses the transform returned by `drawElementImage()`. The WebGL path must compute it directly:

```text
screenX = viewport.x + node.x * viewport.zoom
screenY = viewport.y + node.y * viewport.zoom
transform = translate(screenX, screenY) scale(viewport.zoom)
```

Rules:

- set `transform-origin: 0 0`
- assign transforms only when the string changes
- keep source node wrappers as direct canvas children with generated boxes
- keep `display` and `visibility` valid for HTML-in-Canvas capture
- only disable pointer events for nodes outside the interactive visible window

Unlike the cloth demo, CanvasFlow should not need manual pointer raycast dispatch for normal flat nodes. Manual dispatch becomes relevant only if we later introduce deformed or 3D node surfaces.

## WebGL Drawing Scope

Because a canvas cannot use both 2D and WebGL contexts, the WebGL renderer owns all canvas drawing:

- background fill
- grid
- edges
- connection preview
- node texture quads
- selection affordances that currently live in the canvas

Initial implementation may gate complex edges behind the perf variant, but the production decision requires feature parity with the existing CanvasFlow 2D renderer.

Implementation notes:

- Use CSS-pixel coordinates with a projection matrix derived from `CanvasFlowSize`.
- Preserve existing node z ordering.
- Start with one quad draw per visible node for clarity.
- Add batching or texture atlases only after the per-node texture path works and profiling shows bind/draw overhead.
- Draw edges as WebGL polylines or tessellated strips; avoid reintroducing SVG.

## Phase 1: Standalone API Probe

Build a small Playwright-driven probe outside the full app.

Cases:

1. one direct canvas child, static text
2. ten direct canvas children, static cards
3. one `SectionContainer`-shaped static card
4. one real Settings node body if it can be mounted in isolation

For each case:

- create the canvas as WebGL first
- set `layoutsubtree`
- append direct HTML child elements
- upload with `texElementImage2D()` in `paint`
- render textured quads
- pan/zoom quads for several frames without re-uploading unchanged HTML
- assert nonblank pixels and visible source text counts
- record whether Chromium crashes, hangs, or emits console errors

This phase must prove the API is stable before putting the renderer back into the full Settings page.

## Phase 2: WebGL Renderer Skeleton In CanvasFlow

Add an opt-in renderer mode named `webgl-texture-nodes`.

Tasks:

- refactor CanvasFlow initialization so the renderer chooses the context first
- keep the current 2D renderer as the default until WebGL has evidence
- add a WebGL support assertion for `texElementImage2D`
- implement background/grid drawing
- implement textured node quad drawing
- compute and assign DOM transforms without `drawElementImage()`
- expose diagnostics:
  - visible nodes
  - drawn nodes
  - texture uploads
  - texture cache hits
  - texture evictions
  - upload time
  - WebGL draw time

The first app target is Settings project, All Settings view, because it is the current real rich-node repro.

## Phase 3: Dirty Tracking And Cache Correctness

Wire real invalidation:

- map `PaintEvent.changedElements` to node ids
- invalidate on ResizeObserver dimension changes
- invalidate on mount/unmount
- invalidate on theme changes
- invalidate focused or actively edited nodes on each content paint until stable
- release textures for unmounted nodes
- handle WebGL context loss by dropping the cache and re-uploading visible nodes

Add focused tests for cache lifecycle logic independent of browser WebGL.

## Phase 4: Interaction Correctness

Verify with real CanvasFlow nodes:

- click buttons
- focus text inputs
- type into settings inputs
- toggle switches and checkboxes
- open accordions
- use comboboxes/popovers/tooltips
- drag nodes
- select nodes
- connect edges
- use keyboard navigation

The source DOM must remain interactive and aligned with the textured quad at multiple zoom levels.

## Phase 5: Performance Matrix

Extend the existing opt-in Playwright perf harness.

Run:

```sh
SETTA_CANVASFLOW_PERF=1 \
SETTA_CANVASFLOW_PERF_TARGET=settings-all \
SETTA_CANVASFLOW_PERF_VARIANTS=default,world-transform-nodes,webgl-texture-nodes,rect-nodes \
SETTA_CANVASFLOW_PERF_STEPS=36 \
SETTA_CANVASFLOW_PERF_START_ZOOM=0.1 \
./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts
```

Record:

- pan FPS
- zoom FPS
- p95 input latency
- upload count per gesture
- upload time per gesture
- WebGL draw time per gesture
- texture cache hit rate
- JS heap and estimated texture memory
- source visual stats, including visible text chars
- screenshot or pixel check at the same viewport

The benchmark is valid only if source visual stats show the same meaningful node content is still present.

## Acceptance Criteria

Promote the WebGL texture renderer only if:

- Settings All Settings zoomed-out pan/zoom materially improves over the 2D `drawElementImage()` path.
- The result is meaningfully closer to the `rect-nodes` ceiling while preserving full visible node content.
- Pure viewport pan/zoom mostly reuses textures instead of uploading every visible node every frame.
- Real node interactions remain aligned and usable.
- Memory growth is bounded and textures are released.
- Chromium does not crash or hang in the full app path.

If WebGL texture upload is stable but FPS is still poor, profile WebGL draw overhead, texture binds, texture count, and memory pressure before changing node UI.

If WebGL texture upload crashes or hangs even in the standalone progressive probe, stop app integration and document the smallest failing case for Chromium/API investigation.

## Verification

- Standalone Playwright API probe for WebGL HTML texture upload.
- Focused unit tests for texture cache invalidation, eviction, and DOM transform math.
- Existing CanvasFlow interaction E2E coverage.
- Settings All Settings perf report under `perf/reports/frontend/`.
- Raw perf artifacts under `perf/artifacts/frontend/`.
- CDP visual verification at zoom `0.1`.
- `./check_quality.sh` before committing.
