# CanvasFlow WebGL-First Execution Plan

## Goal

Replace CanvasFlow's hot pan/zoom path with a WebGL-first renderer that keeps rich HTML nodes as real DOM, captures each dirty node into a WebGL texture only when its rendered contents change, and moves cached textured quads during viewport gestures.

This plan builds on:

- `docs/plans/html-in-canvas-webgl-texture-canvasflow-plan.md`
- `perf/reports/frontend/2026-04-28_html-in-canvas-webgl-texture-probe.md`
- `frontend/tests/e2e/canvasflow/html-in-canvas-webgl-texture-probe.spec.ts`
- Reference implementation shape: https://github.com/fimbox/html-in-canvas/blob/main/plugins/html-cloth.mjs
- Additional useful references from `docs/notes/chatgpt-html-in-canvas-example-projects.md`: `compiz-web`, `html-in-canvas-room`, `html-in-canvas-cracks`, and `three-html-render`

## Core Finding

Our current renderer is using the valid but expensive 2D HTML-in-Canvas path:

```text
paint event
  scan visible nodes
  draw every visible rich node with ctx.drawElementImage(...)
  assign returned DOM transform
```

That means zoomed-out pan/zoom cost scales with visible rich-node count because every viewport frame crosses the HTML snapshot draw boundary for every visible node.

The working WebGL demos use a different shape:

```text
HTML changed
  request canvas paint
  upload/capture dirty HTML source during paint

viewport changed
  request animation frame
  draw cached textures through WebGL transforms
```

The corrected standalone probe confirms this is viable in Chrome with `CanvasDrawElement`: direct upload before a cached paint record fails as expected, but upload during `paint` followed by next-frame WebGL draw succeeds and reuses textures across pan frames with zero re-uploads.

## Non-Negotiable Constraints

- Do not hide node contents, replace nodes with rectangles, or reduce visible fidelity as the primary fix.
- Do not call `getContext("2d")` on the canvas used by the WebGL renderer.
- Do not draw/read WebGL pixels in the same browser turn as the `paint` callback. Preserve a frame boundary between HTML capture/upload and WebGL consumption.
- Keep React/DOM node wrappers as direct children of `<canvas layoutsubtree>`.
- Keep source DOM interactive and accessible. WebGL changes presentation, not the authoritative UI tree.
- Fail loudly when `texElementImage2D` or required HTML-in-Canvas APIs are missing.

## Target Scheduling Model

Separate two kinds of work:

```text
requestTexturePaint(reason)
  calls canvas.requestPaint()
  used for node content, size, theme, mount, unmount, focus, hover, validation, and other visual DOM changes

requestWebglFrame(reason)
  calls requestAnimationFrame(...)
  used for viewport pan/zoom, connection preview motion, selection affordances, edge redraws, and post-upload redraws
```

`paint` handler responsibilities:

1. Read `PaintEvent.changedElements`.
2. Mark matching node texture entries dirty.
3. Upload dirty visible node wrappers with `gl.texElementImage2D(...)`, or queue upload work that executes while still respecting the cached paint record.
4. Schedule a WebGL frame for the next animation frame.

`requestAnimationFrame` responsibilities:

1. Compute visible node draw records.
2. Draw background and grid.
3. Draw edges and connection preview.
4. Draw cached node textures as quads.
5. Update source DOM transforms for hit testing.
6. Write diagnostics.

Viewport-only pan/zoom should not call `canvas.requestPaint()` and should not upload textures.

## Phase 1: Renderer Boundary

Create a renderer abstraction before touching WebGL drawing details.

Owned files:

- `frontend/src/canvasflow/CanvasFlow.tsx`
- `frontend/src/canvasflow/canvasFlowRenderer.ts`
- `frontend/src/canvasflow/canvasFlow2dRenderer.ts`
- `frontend/src/canvasflow/canvasFlowTypes.ts`

Tasks:

1. Introduce a small `CanvasFlowRenderer` interface:

   ```ts
   type CanvasFlowRenderer = {
     destroy(): void;
     handleCanvasPaint(event: Event): void;
     markNodesDirty(nodeIds: ReadonlySet<string> | "all", reason: string): void;
     resize(size: CanvasFlowSize): void;
     requestFrame(reason: string): void;
     updateInputs(inputs: CanvasFlowRenderInputs): void;
   };
   ```

2. Move the current 2D path behind `canvasFlow2dRenderer.ts` with no behavior change.
3. Select renderer mode before any context API is called.
4. Keep default mode as `2d`.
5. Add opt-in mode `webgl-texture-nodes` behind a perf/dev flag such as `window.__settaCanvasFlowRenderer = "webgl-texture-nodes"` or an env-driven test hook.
6. Split current `schedulePaint` into:
   - source invalidation / texture paint scheduling
   - viewport frame scheduling

Acceptance:

- Default CanvasFlow behavior is unchanged.
- The current pan/zoom perf test still runs against the 2D renderer.
- A test or smoke check proves the selected renderer owns context creation and the WebGL mode never asks for a 2D context.

## Phase 2: WebGL Skeleton

Build the smallest WebGL renderer that can draw the existing canvas background and textured node quads.

Owned files:

- `frontend/src/canvasflow/canvasFlowWebglRenderer.ts`
- `frontend/src/canvasflow/canvasFlowWebglShaders.ts`
- `frontend/src/canvasflow/canvasFlowDomTransform.ts`
- `frontend/src/canvasflow/canvasFlowGeometry.ts`

Tasks:

1. Create WebGL context with `preserveDrawingBuffer: false` unless the perf harness needs readback.
2. Assert `gl.texElementImage2D` exists.
3. Implement projection from CSS pixels to clip space using `CanvasFlowSize`.
4. Draw the background and grid in WebGL.
5. Draw one textured quad per visible node.
6. Reuse `getVisibleNodeDrawRecords`.
7. Compute DOM transforms directly:

   ```text
   translate(viewport.x + node.x * viewport.zoom,
             viewport.y + node.y * viewport.zoom)
   scale(viewport.zoom)
   ```

8. Assign DOM transforms only when the string changes.
9. Keep culled nodes non-interactive using the current pointer-events policy.

Acceptance:

- With a manually seeded placeholder texture, panning/zooming redraws the scene via WebGL.
- DOM wrappers remain direct canvas children and hit-test positions follow the drawn quads.
- CDP visual check shows the WebGL mode is nonblank and aligned at zoom `1`, `0.5`, and `0.1`.

## Phase 3: HTML Texture Cache

Add real texture upload and cache lifecycle.

Owned files:

- `frontend/src/canvasflow/canvasFlowHtmlTextureCache.ts`
- `frontend/src/canvasflow/canvasFlowWebglRenderer.ts`
- `frontend/src/canvasflow/canvasFlowTypes.ts`

Texture entry:

```ts
type CanvasFlowNodeTextureEntry = {
  cssHeight: number;
  cssWidth: number;
  dirty: boolean;
  estimatedBytes: number;
  lastUsedFrame: number;
  nodeId: string;
  texture: WebGLTexture;
  uploadCount: number;
};
```

Invalidation sources:

- node wrapper mount/unmount
- `PaintEvent.changedElements`
- node width or height changes
- ResizeObserver dimension updates
- dark mode/theme and section style changes
- focus, hover, selected, validation, expanded/collapsed, and editing states
- WebGL context loss/restore

Tasks:

1. Create and destroy textures deterministically.
2. Upload only dirty visible entries during the paint/upload phase.
3. Schedule the next WebGL frame after uploads.
4. Do not re-upload on viewport-only pan/zoom.
5. Track estimated texture memory as `cssWidth * cssHeight * 4`.
6. Add a conservative memory cap and evict least-recently-used non-visible entries.
7. Expose diagnostics:
   - visible nodes
   - drawn nodes
   - texture entries
   - texture uploads this frame
   - upload time
   - WebGL draw time
   - cache hits/misses
   - evictions
   - estimated texture bytes

Acceptance:

- Pan/zoom reports `textureUploadsThisFrame = 0` after initial warm-up.
- Content changes upload only changed visible nodes.
- Unmounted nodes release textures.
- Context loss drops and rebuilds the cache.

## Phase 4: Edges And Feature Parity

Move all canvas-owned visuals into WebGL mode.

Owned files:

- `frontend/src/canvasflow/canvasFlowWebglEdges.ts`
- `frontend/src/canvasflow/canvasFlowEdges.ts`
- `frontend/src/canvasflow/CanvasFlowSelection.tsx`
- `frontend/src/canvasflow/CanvasFlowInteractions.ts`

Tasks:

1. Draw data, agentic, missing, and state-machine edges in WebGL.
2. Draw connection preview in WebGL.
3. Preserve z order between edges, node quads, and selection affordances.
4. Keep selection wrappers and drag handles aligned with the live viewport.
5. Verify reconnect handles and edge hit testing still use the same world-space geometry.

Acceptance:

- WebGL mode is visually equivalent enough to run the Settings All Settings workflow.
- Connection creation, reconnection, selection, and node dragging remain functional.
- No SVG fallback is introduced for edges in WebGL mode.

## Phase 5: Interaction Verification

Use real Settings nodes, not synthetic empty nodes.

Manual/CDP checks:

- click node action buttons
- focus text inputs
- type in inputs
- toggle switches and checkboxes
- open comboboxes, popovers, and tooltips
- scroll inside a node body
- drag nodes
- box-select nodes
- create and reconnect edges
- verify keyboard focus rings at multiple zoom levels

Automated checks:

- Add focused E2E coverage for at least one button, input, checkbox, combobox/popover, and node drag in WebGL mode.
- Add pixel checks or screenshots for zoom `1`, `0.5`, and `0.1`.
- Assert diagnostic counters show stable texture reuse during viewport-only gestures.

Acceptance:

- Real Settings All Settings nodes remain usable.
- DOM hit testing and WebGL pixels stay aligned across pan and zoom.
- No interaction requires hiding source DOM or replacing it with fake controls.

## Phase 6: Performance Matrix

Extend the existing CanvasFlow perf harness to compare renderers.

Command shape:

```sh
SETTA_CANVASFLOW_PERF=1 \
SETTA_CANVASFLOW_PERF_TARGET=settings-all \
SETTA_CANVASFLOW_RENDERERS=2d,webgl-texture-nodes,rect-nodes \
SETTA_CANVASFLOW_PERF_STEPS=36 \
SETTA_CANVASFLOW_PERF_START_ZOOM=0.1 \
./scripts/run-playwright-e2e.sh tests/e2e/canvasflow/html-in-canvas-pan-zoom-perf.spec.ts
```

Metrics:

- pan FPS
- zoom FPS
- p95 frame time
- p95 input-to-frame latency
- visible nodes
- drawn nodes
- mounted nodes
- source text chars
- texture uploads per gesture
- upload time per gesture
- WebGL draw time per gesture
- cache hit rate
- evictions
- estimated texture memory
- screenshot or pixel hash

Benchmark validity requirements:

- The same real Settings All Settings contents are visible.
- Source text char counts remain meaningful.
- Screenshots are nonblank and visually comparable.
- Texture uploads are near zero during viewport-only frames after warm-up.

Acceptance:

- WebGL mode materially improves zoomed-out pan/zoom versus the 2D renderer.
- The result moves meaningfully toward the `rect-nodes` ceiling without user-facing visual degradation.
- Memory remains bounded during repeated pan/zoom and project navigation.

## Phase 7: Promotion

Only promote after the WebGL mode passes performance and interaction gates.

Promotion tasks:

1. Make WebGL mode the default only for browsers with required support.
2. Keep the 2D renderer as a deliberate fallback only if product requirements demand non-flag browser support.
3. Remove temporary perf-only diagnostics or gate them behind the existing diagnostics flag.
4. Update docs with the final architecture and known browser requirements.
5. Record final before/after reports under `perf/reports/frontend/`.

## First Implementation Slice

The first code slice should be deliberately small:

1. Add renderer abstraction and move current 2D paint into `canvasFlow2dRenderer.ts`.
2. Add opt-in WebGL renderer that draws background/grid plus placeholder node quads.
3. Add rAF scheduling for viewport-only frames.
4. Add diagnostics proving no 2D context is created in WebGL mode.
5. Verify visually with CDP before adding texture upload.

The second slice adds texture upload and cache lifecycle. That split keeps the riskiest context/scheduling refactor separate from the experimental HTML texture upload path.

