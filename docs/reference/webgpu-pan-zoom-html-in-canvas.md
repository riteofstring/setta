# WebGPU HTML Surface Project Canvas Architecture

This document explains the current Setta project-canvas renderer. Section nodes
remain real browser DOM for content, focus, hit testing, and accessibility, but
the visible project surface is composed by WebGPU from cached HTML textures.
Interaction projects the source DOM under the browser pointer; it does not make
the source DOM the visible rendering path.

The main implementation lives in `frontend/src/gpuFlow/` and is integrated into
the project page by `frontend/src/components/Pages/Project/GpuProjectSurface.tsx`.

## High-Level Model

Each rendered section node is represented as an HTML GPU surface:

- `HtmlSurfaceSource`: the React-owned DOM host mounted as a direct child of the
  `<canvas layoutsubtree>`.
- `HtmlSurfaceTexture`: one full-surface texture or a tiled texture layout
  uploaded from the source when content, size, style, animation cadence, or
  resolution changes.
- `HtmlSurfaceVisual`: draw metadata that maps the texture into the WebGPU
  scene as a flat quad, tiled flat surface, mesh surface, or shader-effect
  surface.

The source DOM is authoritative for node content and native browser behavior.
The WebGPU scene is authoritative for visible composition, including passive and
active nodes.

The hot path for viewport movement is:

1. Input updates the viewport tuple `[x, y, zoom]`.
2. `GpuSurface` schedules one animation frame.
3. `renderHtmlSurfaceFrame()` builds the visible surface set from node layout,
   the viewport, and cached texture records.
4. `HtmlSurfaceRenderer.render()` writes camera uniforms and redraws grid,
   edges, and already-uploaded surfaces.
5. Passive texture resolution upgrades and passive uploads are deferred while
   the viewport interaction is active.

Pure panning and zooming must not call `requestPaint()`, call
`GPUQueue.copyElementImageToTexture()`, force React renders, or rewrite every
source transform.

## Runtime Shape

`GpuProjectSurface` reads project state, builds `GpuNodeLayout` records from
measured node internals, builds a GPU edge scene, resolves grid and pan/zoom
settings, and renders `GpuFlow`.

`GpuFlow` owns the project-canvas runtime:

- `GpuSurface` creates and sizes the `layoutsubtree` WebGPU canvas, listens for
  `paint` events, and coalesces frame requests.
- `HtmlSurfaceNodeLayer` adapts project node layouts into
  `HtmlSurfaceSourceLayer` source hosts.
- `HtmlSurfaceTextureManager` owns full and tiled surface texture records,
  upload prioritization, byte accounting, and memory eviction.
- `HtmlSurfaceVisualScene` groups surfaces into flat, tiled flat, mesh, and
  effect buckets.
- `HtmlSurfaceRenderer` draws grid, edges, flat surfaces, tiled surfaces, mesh
  surfaces, and shader-effect surfaces from cached textures.
- `HtmlSurfaceHitScene` and `HtmlSurfaceInteractionProjector` map pointer and
  wheel events back into source-local coordinates for native interaction.

The DOM shape is:

```tsx
<div className="setta-gpu-flow-root setta-light dark:setta-dark">
  <GpuFlow className="setta-gpu-flow__pane">
    <canvas className="setta-gpu-flow__canvas" layoutsubtree="">
      <span data-gpu-flow-html-source-anchor="true" />
      <div
        className="setta-gpu-flow__html-source setta-gpu-flow__node"
        data-gpu-flow-html-source="true"
        data-gpu-flow-source-id={nodeId}
      >
        <SectionContainer sectionId={nodeId} isTopLevel={true} />
      </div>
      <div id="setta-codemirror-tooltips" />
      <div id="setta-popover-portals" />
    </canvas>
    <div className="setta-gpu-flow__selection-layer" />
    <GpuEdgeLabelLayer />
    <GpuEdgeReconnectAnchorLayer />
  </GpuFlow>
</div>
```

`HtmlSurfaceSourceLayer` uses hidden anchors only as React insertion points. The
actual source hosts are inserted beside those anchors and remain direct canvas
children so Chromium can paint and upload them as HTML texture sources.

## Browser Capability Contract

`frontend/src/gpuFlow/gpuDevice.ts` owns runtime support checks. GPU flow fails
loudly if the development browser does not expose the required native APIs:

- `HTMLCanvasElement.layoutSubtree`
- `HTMLCanvasElement.requestPaint`
- the canvas `paint` event
- `CanvasRenderingContext2D.drawElementImage`, used as an html-in-canvas
  support probe
- `navigator.gpu`
- a WebGPU canvas context
- `GPUQueue.copyElementImageToTexture`
- `ResizeObserver`

`frontend/src/gpuFlow/htmlSurfaces/apiProbes.ts` covers more detailed
html-in-canvas behavior such as direct-child requirements, changed-element
granularity, transform handling, source-subrect upload support, and animation
capture behavior. There is no fallback renderer in this path.

## Coordinate System

The renderer preserves the project-canvas viewport contract:

- flow coordinates are project/node coordinates
- surface coordinates are CSS pixels inside the GPU flow container
- viewport state is `[x, y, zoom]`

`frontend/src/gpuFlow/viewportMath.ts` owns the conversion:

```ts
screenX = viewport.x + flowX * viewport.zoom;
screenY = viewport.y + flowY * viewport.zoom;
flowX = (screenX - viewport.x) / viewport.zoom;
flowY = (screenY - viewport.y) / viewport.zoom;
```

The WebGPU camera uniform receives the same viewport tuple. Source DOM hosts
use stable capture geometry:

```ts
position: absolute;
left: 0;
top: 0;
transform: translate(0px, 0px) scale(1);
transform-origin: 0 0;
pointer-events: none;
contain: layout paint style;
```

During pointer or wheel handoff, the interaction projector aligns only the
targeted source so the hit source-local coordinate sits under the browser
pointer:

```ts
transform: translate(surfaceX - localX, surfaceY - localY);
pointer-events: auto;
```

When the interaction ends, the source returns to the stable passive transform.

## Viewport Store And Actions

`frontend/src/gpuFlow/viewportStore.ts` is a zustand vanilla store that replaces
the old React Flow viewport contract. It holds:

- `transform`, `width`, `height`, `minZoom`, `maxZoom`, and `defaultZoom`
- input state such as pan, zoom, selection, and move activation keys
- viewport interaction flags such as `pointerPanning`, `wheelZooming`,
  `panScrolling`, `nodeDragging`, and derived `viewportInteractionActive`
- connection-line state
- user-selection and selected-node bounds
- the current GPU flow DOM node for screen-relative coordinate conversion

`frontend/src/gpuFlow/viewportActions.ts` exposes the app-facing action surface:
`setViewport`, `panBy`, `zoomAtScreenPoint`, `zoomBy`, `zoomTo`, `setCenter`,
`fitView`, `screenToFlowPosition`, `flowToScreenPosition`, `getViewport`,
`getZoom`, `resetZoom`, and `updateMapPosition`.

Transitions with non-zero `duration` intentionally throw. Animated viewport
transitions need explicit frame-driven behavior rather than an implicit hidden
transition layer.

## Frame Scheduling

`GpuSurface` creates the WebGPU runtime, configures the canvas context, attaches
the resize observer, listens for html-in-canvas `paint` events, and owns a
coalescing `requestAnimationFrame` scheduler.

Frame reasons are tracked as:

- `init`
- `manual`
- `paint`
- `resize`
- `texture-upload`
- `viewport`

Multiple reasons can coalesce into one frame. A viewport-store transform change
requests a `viewport` frame. A paint event resolves changed source elements to
owning surfaces or tiles and requests a `paint` frame. Remaining dirty texture
work requests follow-up `texture-upload` frames until the upload budget is no
longer exhausted.

## Texture Lifecycle

`frontend/src/gpuFlow/htmlSurfaces/textures.ts` owns DOM-to-GPU texture
records. Each surface record includes:

- surface id
- CSS size
- texture pixel size
- requested and actual resolution scale
- zoom bucket
- full or tiled texture layout
- tile records with source rect, UV range, dirty flags, upload frame, and byte
  size
- max-texture clamp status
- dirty content and dirty resolution flags
- upload priority
- WebGPU texture, texture view, and sampler resources

Visible surfaces are registered from `renderHtmlSurfaceFrame()` each frame. The
texture resolution policy in `frontend/src/gpuFlow/textureResolution.ts` chooses
the smallest zoom bucket at least as large as the current zoom:

```ts
[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]
```

The requested scale is `devicePixelRatio * zoomBucket`, clamped by
`device.limits.maxTextureDimension2D`. If resolution changes during an active
viewport interaction, non-interactive resolution upgrades are deferred so wheel
and pan bursts stay responsive.

Dirty work is ordered by `frontend/src/gpuFlow/dirtyTracking.ts`. Priorities are
`interactive`, `visible`, and `prefetch`; interactive content is uploaded before
passive visible content. Content dirtiness wins over resolution-only dirtiness.

The project surface currently passes this upload budget:

```ts
{ maxUploads: 2, maxDurationMs: 4 }
```

`HtmlSurfaceTextureManager.uploadDirtySurfaceTextures()` requires
`GPUQueue.copyElementImageToTexture`. Large surfaces are split into tiles by
`frontend/src/gpuFlow/htmlSurfaces/textureTiles.ts`, and dirty source rects are
resolved to owning tiles by
`frontend/src/gpuFlow/htmlSurfaces/textureDirtyTiles.ts`. Upload reporting
tracks uploaded bytes, skipped bytes, remaining dirty surfaces, and exhausted
budget state.

## WebGPU Scene Rendering

`frontend/src/gpuFlow/htmlSurfaces/renderer.ts` owns the current renderer. A
single `HtmlSurfaceRenderer.render()` call draws the current frame in this
order:

1. grid
2. edges and connection lines
3. flat HTML surfaces
4. tiled flat HTML surfaces
5. mesh HTML surfaces
6. shader-effect HTML surfaces

The camera uniform stores:

- viewport x
- viewport y
- viewport zoom
- canvas CSS width
- canvas CSS height

Flat and tiled surfaces are built in flow coordinates. The vertex shaders
convert each flow position to screen coordinates with the viewport and then to
clip space. Fragment shaders sample the uploaded full texture or tile texture.
Mesh and shader-effect passes use the same texture records with specialized
vertices, indices, effect uniforms, and hit projector contracts.

Viewport-only redraws of an unchanged visual scene write only the camera
uniform. When pan/zoom crosses a culling boundary, the active draw set can
change; the renderer may then rewrite the flat or tiled-flat vertex buffer for
the changed draw geometry. That bounded geometry write is separate from the
HTML-surface invariants: it must not request paint, upload textures, rewrite
source DOM transforms, or force React renders, and pan/zoom reports must keep
the vertex-write calls and bytes visible as their own counters.

Edges are generated as CPU-side line-list buffer data from the current edge
scene and are drawn through a WebGPU line pipeline. Grid rendering uses a full
screen triangle and computes the grid pattern in the fragment shader from the
camera and grid settings.

## Visibility And Z Order

`collectVisibleGpuNodeQuads()` computes a visible flow rectangle from the canvas
size, viewport, and a default 128 CSS-pixel margin. Nodes with concrete width
and height are included when their rect intersects that visible area or when
their id is forced visible.

Visible surfaces are sorted by `zIndex` and then source order. The same
visibility set drives:

- texture registration and upload eligibility
- visual scene draw order
- stable source host size, z-index, and passive pointer state
- texture memory protection during eviction

Top-level node DOM remains mounted even when culled. Culling affects
presentation and interaction eligibility, not React mount lifecycle.

## Project Edge Scene

`frontend/src/components/Pages/Project/gpuProjectEdgeScene.ts` adapts project
state into `GpuEdgeScene`.

The scene combines:

- data edges from `projectConfig.edges`
- agentic edges from `projectConfig.agenticEdges`
- workflow edges from `projectConfig.stateMachineEdges`
- scope-violation edges
- the active connection line

Data edges use measured handle positions. Agentic and workflow edges can anchor
to node frames. `frontend/src/gpuFlow/edges/edgeGeometry.ts` builds straight or
bezier geometry and also powers CPU hit testing. Pointer interaction on edges is
handled before pane interaction by `frontend/src/gpuFlow/interactions/edges.ts`,
which converts the screen event to flow coordinates and tests against the edge
scene with a screen-pixel tolerance converted to flow units.

## Input Controllers

The GPU renderer has explicit controllers instead of d3-zoom or XYFlow
interaction machinery.

`frontend/src/gpuFlow/interactions/panZoom.ts` handles:

- wheel zoom
- pinch zoom on macOS-style ctrl-wheel events
- wheel pan
- pointer pan
- double-click zoom
- `NO_PAN_CLASS_NAME` and `NO_WHEEL_CLASS_NAME` preservation for controls that
  need native scrolling or pointer behavior

Viewport gestures set `viewportInteractionActive` while they are in progress.
That flag is used to defer passive texture uploads and resolution upgrades.

`frontend/src/gpuFlow/interactions/nodeDrag.ts` handles node dragging. It uses
screen-to-flow conversion, selected-node expansion, optional snap-to-grid, and
edge-of-viewport auto-pan. The project integration commits drag changes through
the normal node position and z-index actions.

`frontend/src/gpuFlow/interactions/selection.ts` handles marquee selection. It
stores the user-selection rectangle in screen coordinates, converts it to a flow
rect for node hit testing, and writes selected-node bounds back to the viewport
store.

## DOM Interaction And Dirty Tracking

The DOM source tree remains the interaction source. To keep textures current,
`frontend/src/gpuFlow/nodeInteractionDirty.ts` listens at capture phase for
events that imply a surface texture is stale:

- custom GPU-flow dirty events
- `beforeinput`, `input`, and `change`
- `scroll`
- `focusin` and `focusout`
- pointer interaction on interactive targets
- document `selectionchange`
- CSS transition and animation lifecycle events

Interactive targets include native form controls, contenteditable elements,
ARIA text/slider/spinbutton roles, CodeMirror content, xterm surfaces, and
shared combobox controls.

Pointer and wheel targeting follows the rendered visual scene:

1. `HtmlSurfaceHitScene` maps the client point through the current flat,
   tiled-flat, mesh, or effect visual.
2. Flat and tiled-flat surfaces use exact inverse viewport math.
3. Mesh surfaces raycast CPU triangles and interpolate UVs.
4. Shader-effect surfaces must provide an explicit projector id; an effect
   without a projector is not interactive.
5. `HtmlSurfaceInteractionProjector` aligns the source host so the projected
   local coordinate sits under the browser pointer.
6. Browser hit testing resolves the native target, with narrow synthetic
   handoff only when pre-alignment cannot deliver the original event.

Dirty marks carry source-relative rect hints where the event target provides a
specific owning area. Large tiled surfaces use those hints to dirty and upload
only the affected tiles. Source-owned finite CSS transitions and animations are
tracked as bounded animation leases; they request capture frames for the owning
surface or tile until the animation has settled.

## Current Project Integration

`GpuProjectSurface` wires the generic GPU flow renderer to Setta's project
runtime:

- renders each node as `SectionContainer`
- observes node element resizes and writes node dimensions through
  `updateNodeDimensions`
- mirrors GUI settings for zoom bounds, grid style, pan behavior, zoom
  behavior, selection mode, and snap grid
- builds edge scenes for data, agentic, workflow, missing, and connection edges
- keeps CodeMirror tooltips and Setta popover portals inside the canvas element
- renders the selected-nodes rectangle as a sibling overlay using the same
  viewport transform
- forwards pane clicks, context menus, file drops, node drags, and selection
  commits into existing project actions

The renderer intentionally keeps old high-level project behaviors while
replacing the viewport implementation underneath them.

## Performance Evidence

HTML GPU surface performance reports live under `perf/reports/frontend/`.
Current completion evidence includes:

- `2026-05-02_html-gpu-dense-panzoom-cdp.md`
- `2026-05-02_html-gpu-controls-cdp.md`
- `2026-05-02_html-gpu-animation-paint-aligned-after.md`
- `2026-05-02_html-gpu-warped-mesh-fixture.md`
- `2026-05-02_html-gpu-settings-zoom-tiling-artifact-after.md`
- `2026-05-02_html-gpu-settings-switch-targeted-after.md`

Historical reports from earlier renderer phases may describe superseded
implementations. Use this reference and the active plan in
`docs/plans/html-in-canvas-interactive-gpu-surfaces-plan.md` for the current
architecture.
