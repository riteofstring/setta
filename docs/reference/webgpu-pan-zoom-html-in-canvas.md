# WebGPU Pan/Zoom HTML-in-Canvas Architecture

This document explains the current Setta project-canvas renderer. The renderer
keeps section nodes as real browser DOM for native interaction, but moves the
high-frequency visual viewport to WebGPU so pan and zoom do not repaint a large
transformed DOM/SVG tree.

The main implementation lives in `frontend/src/gpuFlow/` and is integrated into
the project page by `frontend/src/components/Pages/Project/GpuProjectSurface.tsx`.

## High-Level Model

The renderer has two synchronized presentations of the same section nodes:

- a real DOM node tree, mounted as direct children of a
  `<canvas layoutsubtree>` so browser hit testing, focus, inputs, and
  accessibility can still target real `SectionContainer` elements
- a WebGPU scene that draws cached textures of those DOM nodes, plus the grid,
  edges, connection line, and passive node visuals

The DOM tree is authoritative for section content and interaction. The WebGPU
scene is authoritative for visual pan/zoom composition.

The hot path for viewport movement is:

1. Input updates the viewport tuple `[x, y, zoom]`.
2. `GpuSurface` schedules one animation frame.
3. `GpuNodeLayer` updates visible node hit-test transforms.
4. `GpuNodeQuadRenderer` writes the camera uniform and redraws grid, edges, and
   already-uploaded node textures.
5. Passive texture resolution and passive uploads are deferred while the
   viewport interaction is active.

Panning and zooming should not require recapturing node HTML or rerendering the
React node tree.

## Runtime Shape

`GpuProjectSurface` is the app integration layer. It reads project state,
builds `GpuNodeLayout` records from `useNodeInternals`, builds a GPU edge scene,
resolves grid and pan/zoom settings, and renders `GpuFlow`.

The DOM shape is:

```tsx
<div className="react-flow setta-light dark:setta-dark">
  <GpuFlow className="setta-gpu-flow react-flow__pane">
    <canvas className="setta-gpu-flow__canvas" layoutsubtree="">
      <GpuNodeLayer>
        <div className="setta-gpu-flow__node react-flow__node">
          <SectionContainer sectionId={node.nodeId} isTopLevel={true} />
        </div>
      </GpuNodeLayer>
      <div id="setta-codemirror-tooltips" />
      <div id="setta-popover-portals" />
    </canvas>
    <div className="setta-gpu-flow__selection-layer" />
    <div className="setta-gpu-flow__active-node-teleport-layer" />
  </GpuFlow>
</div>
```

The `react-flow` class names and `rf__node-*` test ids are still emitted where
other UI code expects them, but the renderer is Setta-owned GPU flow code rather
than the XYFlow viewport renderer.

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

There is no fallback renderer in this path. The WebGPU/html-in-canvas APIs are
part of the architecture, not optional acceleration.

## Coordinate System

The renderer preserves the previous project-canvas viewport contract:

- flow coordinates are project/node coordinates
- screen coordinates are CSS pixels inside the GPU flow container
- viewport state is `[x, y, zoom]`

`frontend/src/gpuFlow/viewportMath.ts` owns the conversion:

```ts
screenX = viewport.x + flowX * viewport.zoom;
screenY = viewport.y + flowY * viewport.zoom;
flowX = (screenX - viewport.x) / viewport.zoom;
flowY = (screenY - viewport.y) / viewport.zoom;
```

The same transform feeds both the WebGPU camera uniform and the DOM hit-test
layer. Visible DOM nodes get:

```ts
transform: translate(screenX, screenY) scale(zoom);
transform-origin: 0 0;
```

Culled nodes remain mounted but are parked offscreen with
`pointer-events: none`. This prevents an old DOM hit-test rectangle from staying
active after a node leaves the visible area.

## Viewport Store And Actions

`frontend/src/gpuFlow/viewportStore.ts` is a zustand vanilla store that replaces
the old shared React Flow viewport store contract. It holds:

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
requests a `viewport` frame. A paint event marks changed node DOM as dirty and
requests a `paint` frame. Remaining dirty texture work requests follow-up
`texture-upload` frames until the upload budget is no longer exhausted.

## Node Texture Lifecycle

`frontend/src/gpuFlow/nodeTextures.ts` owns DOM-to-GPU texture records. Each
visible node can have a `NodeTextureRecord` with:

- node id
- CSS size
- texture pixel size
- requested and actual resolution scale
- zoom bucket
- max-texture clamp status
- dirty content and dirty resolution flags
- upload priority
- WebGPU texture, texture view, and sampler

Visible nodes are registered from `GpuNodeLayer` each frame. The texture
resolution policy in `frontend/src/gpuFlow/textureResolution.ts` chooses the
smallest zoom bucket at least as large as the current zoom:

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

`NodeTextureManager.uploadRecord()` requires
`GPUQueue.copyElementImageToTexture`. It copies the current DOM element snapshot
into the node texture and records the frame number. The sampler uses linear
filtering and clamp-to-edge addressing.

## WebGPU Scene Rendering

`frontend/src/gpuFlow/gpuPipelines.ts` owns the render pipelines. A single
`GpuNodeQuadRenderer.render()` call draws the current frame in this order:

1. grid
2. edges and connection lines
3. node texture quads

The camera uniform stores:

- viewport x
- viewport y
- viewport zoom
- canvas CSS width
- canvas CSS height

Node quads are built in flow coordinates. The node vertex shader converts each
flow position to screen coordinates with the viewport and then to clip space.
The fragment shader samples that node's uploaded texture.

Edges are generated as CPU-side line-list buffer data from the current edge
scene and are drawn through a WebGPU line pipeline. Grid rendering uses a full
screen triangle and computes the grid pattern in the fragment shader from the
camera and grid settings.

## Visibility And Z Order

`GpuNodeLayer.collectVisibleGpuNodeQuads()` computes a visible flow rectangle
from the canvas size, viewport, and a default 128 CSS-pixel margin. Nodes with
concrete width and height are included when their rect intersects that visible
area or when their id is forced visible.

Visible quads are sorted by `zIndex` and then source order. The same visibility
set drives:

- texture registration and upload eligibility
- WebGPU quad draw order
- DOM transform updates for native hit testing
- offscreen parking for culled DOM nodes

Top-level node DOM remains mounted even when culled. Culling currently affects
presentation and interaction, not React mount lifecycle.

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

The DOM node tree remains the interaction source. To keep textures current,
`frontend/src/gpuFlow/nodeInteractionDirty.ts` listens at capture phase for
events that imply a node snapshot is stale:

- custom GPU-flow dirty events
- `beforeinput`, `input`, and `change`
- `scroll`
- `focusin` and `focusout`
- pointer interaction on interactive targets
- document `selectionchange`

Interactive targets include native form controls, contenteditable elements,
ARIA text/slider/spinbutton roles, CodeMirror content, and xterm surfaces.

When an interactive target is used, the node is promoted to interactive
priority, marked dirty, and tracked as the active node. While active feedback is
ongoing, the controller can request additional texture-upload frames. When the
interaction settles, the node priority returns to visible after the final upload.

The current architecture has an active-node teleport layer as part of the
in-progress live DOM work described below. While a node is teleported out of the
canvas layout subtree, uploads for that node are deferred; after it is restored,
the canvas requests a paint before the final texture upload.

## Current Project Integration

`GpuProjectSurface` wires the generic GPU flow renderer to Setta's project
runtime:

- renders each node as `SectionContainer`
- observes node element resizes and writes node dimensions through
  `updateNodeDimensions`
- mirrors GUI settings for zoom bounds, grid style, pan behavior, zoom behavior,
  selection mode, and snap grid
- builds edge scenes for data, agentic, workflow, missing, and connection edges
- keeps CodeMirror tooltips and Setta popover portals inside the canvas element
- renders the selected-nodes rectangle as a sibling overlay using the same
  viewport transform
- forwards pane clicks, context menus, file drops, node drags, and selection
  commits into existing project actions

The renderer intentionally keeps old high-level project behaviors while
replacing the viewport implementation underneath them.

## Active Node DOM Teleport Work

This document describes the current WebGPU pan/zoom and html-in-canvas baseline.
The active interaction plan is
`docs/plans/gpu-flow-live-active-node-dom-plan.md`.

That plan addresses the main remaining interaction problem: textures are
snapshots, so repeatedly uploading a whole node texture is not the right way to
make switches, text inputs, CodeMirror, terminals, sliders, and CSS transitions
feel native during active manipulation.

The selected architecture is same-instance active DOM teleport: temporarily
move the existing React-owned node DOM into the active teleport layer while the
user interacts, defer uploads while it is outside the canvas layout subtree,
restore it under the canvas, request one paint, upload the final snapshot, and
return the node to the passive WebGPU texture path. Do not introduce duplicate
active node rendering unless a component owner requires a dedicated active
presentation path for a documented teleport failure.
