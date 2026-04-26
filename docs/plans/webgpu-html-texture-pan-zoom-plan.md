# WebGPU HTML Texture Pan/Zoom Plan

## Goal

Replace XYFlow pan/zoom with a GPU texture renderer that keeps Setta nodes as real interactive HTML while making viewport movement as close as possible to a pure GPU transform.

This is the highest-performance target architecture:

- Keep each node's real `SectionContainer` DOM.
- Use `<canvas layoutsubtree>` so node DOM participates in native layout, hit testing, focus, inputs, and accessibility.
- Capture each visible node into a GPU texture only when that node is dirty or needs a higher-resolution texture.
- During pan and zoom, render cached node textures as GPU quads with a camera matrix.
- Draw grid, edges, selection, connection state, and node textures in one GPU scene.

No compatibility, legacy support, dual renderer, or migration layer is required. If the required native html-in-canvas and WebGPU APIs are unavailable in the development browser, fail loudly.

## Why This Instead Of Canvas 2D

The Canvas 2D plan removes the transformed DOM viewport, but it may still call `drawElementImage` for visible nodes during viewport redraws. That is likely good enough to prove the direction, but it is not the highest-performance ceiling.

The WebGPU texture model moves the expensive work off the pan/zoom hot path:

- HTML capture/upload happens only when a node changes or texture resolution must improve.
- Pan and zoom only update camera uniforms and redraw textured quads.
- Edges and grid are drawn by GPU primitives instead of SVG or Canvas 2D paths.
- Culling and batching can keep the frame cost proportional to visible geometry.

The expected hot path for viewport movement is:

1. Input event updates `[x, y, zoom]`.
2. Write one camera uniform.
3. Issue draw calls for visible node quads, edge geometry, grid, and overlays.
4. Do not recapture HTML.
5. Do not force React renders.
6. Do not repaint a transformed DOM tree.

## API Assumptions

Required:

- `HTMLCanvasElement.requestPaint`
- `HTMLCanvasElement.onpaint`
- `<canvas layoutsubtree>`
- `GPUQueue.copyElementImageToTexture` or the current Chromium equivalent for copying a canvas child element into a WebGPU texture
- `navigator.gpu`

The first task is an API probe because these APIs are experimental. The probe must verify the exact WebGPU upload call available in the local Chromium build. If WebGPU html-in-canvas upload is not exposed but WebGL2 `texElementImage2D` is exposed, pause and decide whether to implement the same architecture on WebGL2 first. Do not silently ship a runtime fallback.

## Relevant Example References

Use these local examples as implementation references:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/README.md`
  - Source-of-truth explainer for `layoutsubtree`, `paint`, `requestPaint`, `drawElementImage`, `texElementImage2D`, and the proposed `GPUQueue.copyElementImageToTexture` API.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-cracks/src/main.js`
  - Most relevant WebGPU-style reference. It treats live HTML as a texture source, keeps the source canvas authoritative, handles high-resolution texture limits, and renders the result through GPU scene geometry.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`
  - Most relevant WebGL2 texture upload reference. It checks `texElementImage2D`, waits for paint readiness, uploads HTML elements into textures, and renders shader-driven transitions.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-demo/demos/water-drop/index.html`
  - Compact reference for `texElementImage2D`, interactive HTML controls, recapturing during transitions, and shader rendering over live HTML textures.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlTexture.ts`
  - Reference for texture lifecycle around html-in-canvas `paint` events and dirty texture updates.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/threeHTMLRenderer.ts`
  - Reference for assigning HTML-derived textures to scene objects and requesting repaint every frame when needed for animations.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/interactionManager.ts`
  - Reference for aligning real DOM hit testing with GPU-rendered surfaces by writing CSS matrix transforms.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/raycastInteractionManager.ts`
  - Reference for event-driven interaction mapping when the rendered surface and the real DOM element are not trivially aligned.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas/plugins/html-cloth.mjs`
  - Reference for request-paint/upload sequencing, live video invalidation, texture refreshes, and manual forwarding for demanding interactive surfaces.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-room/extension/entrypoints/content.ts`
  - Reference for transforming a real DOM wrapper to match a GPU-rendered screen while keeping the page interactive.

## Renderer Shape

Create a new Setta-owned renderer under:

- `frontend/src/gpuFlow/GpuFlow.tsx`
- `frontend/src/gpuFlow/GpuSurface.tsx`
- `frontend/src/gpuFlow/GpuNodeLayer.tsx`
- `frontend/src/gpuFlow/gpuDevice.ts`
- `frontend/src/gpuFlow/gpuRenderer.ts`
- `frontend/src/gpuFlow/gpuPipelines.ts`
- `frontend/src/gpuFlow/nodeTextures.ts`
- `frontend/src/gpuFlow/textureResolution.ts`
- `frontend/src/gpuFlow/dirtyTracking.ts`
- `frontend/src/gpuFlow/viewportStore.ts`
- `frontend/src/gpuFlow/viewportMath.ts`
- `frontend/src/gpuFlow/viewportActions.ts`
- `frontend/src/gpuFlow/interactions/panZoom.ts`
- `frontend/src/gpuFlow/interactions/nodeDrag.ts`
- `frontend/src/gpuFlow/interactions/selection.ts`
- `frontend/src/gpuFlow/edges/edgeGeometry.ts`
- `frontend/src/gpuFlow/edges/edgeGpuBuffers.ts`
- `frontend/src/gpuFlow/GpuControls.tsx`
- `frontend/src/gpuFlow/GpuMiniMap.tsx`
- `frontend/src/gpuFlow/htmlInCanvasTypes.ts`

The DOM root is still a canvas with direct node children:

```tsx
<div className="setta-gpu-flow" data-tab-scope="canvas">
  <canvas
    ref={canvasRef}
    className="setta-gpu-flow__canvas"
    layoutsubtree=""
  >
    {mountedNodeIds.map((nodeId) => (
      <GpuNodeChild key={nodeId} nodeId={nodeId} />
    ))}
  </canvas>
  <GpuOverlayPortals />
</div>
```

Each `GpuNodeChild` renders existing HTML:

```tsx
<div
  className="setta-gpu-flow__node"
  data-id={nodeId}
  data-testid={`rf__node-${nodeId}`}
  ref={nodeRef}
>
  <NodeIdContext.Provider value={nodeId}>
    <SectionContainer sectionId={nodeId} isTopLevel={true} />
  </NodeIdContext.Provider>
</div>
```

The DOM child is the interaction and capture source. The GPU quad is the visual representation.

## Coordinate Model

Keep the Setta viewport contract:

- flow coordinates are project/node coordinates
- screen coordinates are CSS pixels in the canvas wrapper
- viewport transform is `[x, y, zoom]`

Node quad layout:

- quad position in flow units: `node.position.x`, `node.position.y`
- quad size in flow/CSS units: measured node width and height
- camera uniform maps flow coordinates to clip space
- texture UVs sample the node texture

The DOM hit-test element must be synchronized to the same screen-space transform:

```ts
const screenX = viewport.x + node.position.x * viewport.zoom;
const screenY = viewport.y + node.position.y * viewport.zoom;
element.style.transformOrigin = "0 0";
element.style.transform = `translate(${screenX}px, ${screenY}px) scale(${viewport.zoom})`;
```

For nodes that are not drawn or are outside the interactive margin:

- set `pointer-events: none`
- park the DOM transform offscreen
- keep the node mounted initially unless DOM mount cost separately profiles as a problem

Important: CSS transforms on canvas children should affect hit testing but should not affect html-in-canvas capture. The API probe must verify this in the target browser.

## Texture Lifecycle

Each visible or recently visible node has a `NodeTextureRecord`:

```ts
type NodeTextureRecord = {
  nodeId: string;
  texture: GPUTexture;
  textureView: GPUTextureView;
  sampler: GPUSampler;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  resolutionScale: number;
  dirtyContent: boolean;
  dirtyResolution: boolean;
  lastUploadFrame: number;
  priority: "interactive" | "visible" | "prefetch";
};
```

Texture upload happens when:

- node content changes
- node dimensions change
- node first becomes visible
- zoom crosses a resolution threshold
- focused/interactive node requests a live update
- theme/style changes affect the node

Texture upload does not happen merely because the viewport pans.

## Avoiding Blurry Nodes

Blurriness is controlled by texture resolution policy.

Do not capture each node once at CSS-pixel size and scale it forever. Capture at a resolution appropriate for current screen scale:

```ts
targetTextureScale = devicePixelRatio * qualityZoomScale(currentZoom);
pixelWidth = ceil(nodeCssWidth * targetTextureScale);
pixelHeight = ceil(nodeCssHeight * targetTextureScale);
```

Use zoom buckets to avoid recapturing on every wheel tick:

- `0.5`
- `0.75`
- `1`
- `1.25`
- `1.5`
- `2`
- `3`
- `4` only if GPU limits and memory budget allow it

Resolution policy:

- choose the smallest bucket that is at least the current zoom
- allow temporary use of a lower bucket during active fast zoom
- upgrade visible nodes after the wheel/pinch burst settles
- upgrade active/focused nodes immediately
- downgrade or dispose textures for far-away nodes after an idle timeout

Filtering:

- use `linear` min/mag filtering for smooth fractional pan and zoom
- do not generate mipmaps for dynamic HTML textures
- use `clamp-to-edge`
- make texture pixels match screen pixels when settled; crispness comes from sufficient upload resolution

Max texture handling:

- query `device.limits.maxTextureDimension2D`
- if `pixelWidth` or `pixelHeight` would exceed the limit, clamp resolution scale and record the clamp
- for giant nodes that must stay crisp, split the node into tiles only after profiling proves clamping is visible and unacceptable

Settled-view guarantee:

- after zoom stops, every visible node should reach an adequate texture bucket within the upload budget
- active/focused nodes get priority over passive visible nodes

## Avoiding Laggy Interactive Updates

The real DOM remains interactive, so the browser updates controls immediately. The GPU texture must catch up at frame latency.

Dirty tracking sources:

- `paint` events from the html-in-canvas canvas
- `input` and `change` events inside node children
- `pointermove` during active control drags
- CodeMirror update hooks where available
- terminal output hooks where available
- ResizeObserver for node dimensions
- MutationObserver only as a dirty-scheduling helper for node child subtrees

High-priority live interaction mode:

1. On `pointerdown` inside an input, slider, contenteditable, CodeMirror editor, terminal, or other interactive surface, mark the owning node `priority: "interactive"`.
2. On each `input`, `beforeinput`, `selectionchange`, `scroll`, or relevant pointer move, set `dirtyContent = true`.
3. Call `canvas.requestPaint()`.
4. On the next `paint` event or next animation frame, upload that node before the scene draw.
5. Keep uploading that node at most once per frame while the interaction continues.
6. On `pointerup`, `blur`, or interaction end, return it to normal visible priority after one final upload.

Slider requirement:

- a range input drag must schedule a node texture upload every frame while its value changes
- the interactive node bypasses normal debounce
- if multiple nodes are dirty, the interactive node uploads first
- if upload cost exceeds the frame budget, keep the DOM element visible above the GPU quad for that one active node until the texture catches up, then hide it again

That last overlay escape hatch is not a compatibility path. It is a performance valve for active controls only. It preserves immediate visual feedback for the node being manipulated without putting the whole viewport back on a transformed DOM path.

Text input and caret:

- focus/caret changes mark the node interactive
- caret blink may dirty the node periodically while focused
- text selection changes inside the node schedule uploads
- if the browser's html-in-canvas paint event already tracks caret/selection, rely on it; otherwise add focused-element dirty timers only for the focused node

Scroll inside a node:

- scroll events on node internals mark only that node dirty
- upload the node on the next frame
- do not update unrelated node textures

## Frame Budget

Keep separate budgets for:

- viewport draw
- texture uploads
- buffer rebuilds

Viewport draw should happen every frame during pan/zoom and should not wait for passive texture uploads.

Suggested initial budgets:

- interactive node uploads: up to 1 per frame, always first
- visible passive uploads: up to 2 per frame or 4 ms, whichever comes first
- resolution upgrades during active zoom: defer unless active/focused
- resolution upgrades after zoom settles: budgeted over subsequent frames

If a dirty node misses the current upload budget:

- draw its previous texture for this frame
- keep it in the dirty queue
- if it is interactive and cannot be uploaded in time, temporarily show the real DOM child over its quad for immediate feedback

## GPU Rendering Pipeline

Initial pipelines:

- node textured quad pipeline
- edge line/bezier pipeline
- grid pipeline
- selection/overlay rectangle pipeline
- picking/debug pipeline if needed

Node rendering:

- use instanced quads where possible
- one instance per visible node
- per-instance data includes flow rect, texture atlas/page index if atlasing is used, z index, opacity/debug flags
- bind texture per node initially for simplicity
- move to texture arrays or atlases only after profiling says bind churn matters

Edges:

- build GPU buffers from flow-space edge geometry
- update edge buffers only when edge endpoints or edge state changes
- do not rebuild edge buffers on pan/zoom
- camera uniform transforms edge vertices during draw

Grid:

- draw procedurally in shader from camera transform and grid settings
- avoid generating a large grid mesh

Selection and connection overlays:

- draw in screen space or flow space depending on behavior
- keep geometry small and rebuilt only when interaction state changes

## Culling

CPU-side culling is mandatory.

For every frame:

- compute visible flow rect from viewport
- expand by a small margin for smooth entry
- include active/focused/dragged/connecting nodes even outside the normal margin
- build the visible node instance list
- park culled node DOM hit-test elements

Texture retention:

- visible nodes keep textures
- recently visible nodes keep textures for a short idle window
- far-away nodes release GPU textures
- active/focused/running nodes can opt into longer retention if losing texture would harm interaction

## Input And Hit Testing

Native HTML handles most node interactions because real DOM nodes are aligned over their GPU quads.

Canvas/background interactions:

- pan on background pointer drag
- wheel/pinch zoom on canvas
- selection rectangle on background
- context menu on background
- file drop on background

Node interactions:

- real DOM receives clicks, focus, input, hover, scroll
- node drag starts from the DOM node shell when the target is not marked `NO_DRAG_CLASS_NAME`
- handles remain real DOM for edge connection start/end

Edge interactions:

- edges are GPU-rendered, so SVG hit targets disappear
- maintain CPU edge geometry for hit testing
- on pointer move/down over the canvas background, test edges in flow coordinates
- context menu and selection use edge ids from the hit test result

## Edge Handles

Keep current handle components in section DOM.

Handle positions should stay flow-coordinate authoritative:

- measure handle DOM rect
- convert screen center to flow coordinates through `screenToFlowPosition`
- store in `useEdgeHandleRegistry.positions`
- rebuild edge GPU buffers only when these positions change

Do not recompute handle positions during pan/zoom. Pan/zoom changes screen positions, not flow positions.

When a node is parked because it is culled:

- do not use its parked DOM rect for handle updates
- keep its last known flow handle positions
- refresh positions when the node becomes visible or its content dimensions change

## Viewport Store And Actions

Replace `useReactFlow` with a Setta-owned GPU flow store.

Keep:

- transform `[x, y, zoom]`
- width/height
- domNode/canvas wrapper
- viewportInteractionActive
- paneDragging
- selection state
- connection state
- fit view state
- keyboard activation state

Remove:

- `d3Zoom`
- `d3Selection`
- `d3ZoomHandler`
- d3 transitions

Actions:

- `setViewport`
- `panBy`
- `zoomAtScreenPoint`
- `zoomBy`
- `zoomTo`
- `setCenter`
- `fitView`
- `screenToFlowPosition`
- `flowToScreenPosition`
- `getZoom`
- `resetZoom`
- `updateMapPosition`

Existing callers should move to these actions rather than reaching into renderer internals.

## Implementation Sequence

### 1. WebGPU HTML Upload Probe

Build a temporary probe page/component and delete it after validation.

Verify:

- WebGPU initializes on the target browser.
- A canvas child element can be copied into a `GPUTexture`.
- CSS transforms on the child affect hit testing but not capture content.
- The copied texture is crisp at DPR-aware sizes.
- React events fire through canvas child DOM.
- Slider drag schedules uploads every frame and visibly updates at frame latency.
- Text input, caret, selection, and nested scroll update correctly.
- Max texture limits are available and realistic.

Record the findings in the implementation PR or an append-only perf/probe note.

### 2. Build GPU Device And Support Gate

Implement:

- WebGPU adapter/device setup
- canvas context configuration
- support gate with explicit error messages
- resize handling with `device-pixel-content-box`
- frame scheduler

No node rendering yet.

### 3. Build Texture Upload Manager

Implement `nodeTextures.ts`, `textureResolution.ts`, and `dirtyTracking.ts`.

Support:

- create texture for a node
- upload node element to texture
- destroy texture
- mark dirty
- prioritize dirty queue
- choose resolution bucket
- enforce texture limits

Unit-test policy math without WebGPU.

### 4. Render Node Quads

Render visible node textures as quads with camera transform.

At this stage:

- no edges yet
- no node drag yet
- pan/zoom should be GPU-only over cached textures
- culling and DOM transform synchronization must work

### 5. Add Real-Time Interaction Dirty Path

Wire event listeners for:

- `input`
- `beforeinput`
- `change`
- `scroll`
- `selectionchange`
- `pointerdown`
- `pointermove`
- `pointerup`
- `focusin`
- `focusout`

Implement interactive priority and the active-node DOM overlay performance valve.

Verify sliders, text inputs, CodeMirror, terminals, and scrollable section internals.

### 6. Port Pan/Zoom, Selection, Drag

Replace d3 pan/zoom and d3 drag with explicit pointer/wheel controllers.

Keep existing settings where they still make sense:

- pan on drag
- pan on scroll
- zoom on scroll
- zoom on pinch
- zoom activation key
- selection key
- snap to grid
- auto-pan on node drag

### 7. Port Edges To GPU

Build edge geometry and buffers:

- straight edges
- bezier edges
- agentic edges
- chat shared edges
- state machine edges
- selected and active states
- connection line

Add CPU hit testing for edge selection and context menus.

### 8. Replace Controls And MiniMap

Move controls and minimap to GPU-flow actions.

The minimap can be DOM/SVG/canvas because it is outside the hot viewport path.

### 9. Migrate Callers And Delete XYFlow

Move imports away from:

- `forks/xyflow/core/store`
- `forks/xyflow/core/hooks/useViewportHelper`
- `forks/xyflow/core/utils/graph`
- `forks/xyflow/core/types`
- `forks/xyflow/minimap`
- `forks/xyflow/controls`

Delete `frontend/src/forks/xyflow` once no runtime imports remain.

Remove unused d3 dependencies after cleanup confirms they are no longer used.

## Verification

### Unit Tests

Add focused tests for:

- viewport math
- zoom-around-point
- fit view
- culling
- resolution bucket selection
- texture budget scheduling
- dirty priority queue
- edge geometry
- edge hit testing
- pan/zoom reducers
- node drag reducers

### Browser Tests And CDP Checks

Use Chrome DevTools Protocol for visual and performance checks.

Visual checks:

- initial render is nonblank
- nodes are crisp at zoom 0.5, 1, 2, and 3
- panning does not blur settled nodes
- zoom settles to high-resolution textures
- slider drag updates in real time
- text input, caret, and selection update in real time
- CodeMirror remains usable
- terminal output and scroll remain usable
- node drag and resize work
- edge handles and edge connection work
- selection rectangle works
- context menus open at correct coordinates
- popovers/tooltips anchor correctly
- minimap and controls work

Performance checks:

- profile large-canvas pan with no dirty nodes
- profile wheel zoom with no dirty nodes
- profile slider drag in one node while the canvas contains many visible nodes
- profile terminal streaming in one node while panning is idle
- profile CodeMirror typing in one node
- record GPU memory before and after large zoom sweeps
- verify pan/zoom frames do not spend time in DOM paint/composite for the node tree
- verify texture uploads are limited to dirty nodes

Success targets:

- pan/zoom hot path has no node HTML capture
- passive pan/zoom is camera uniform update plus GPU draw
- interactive control updates are visible within one frame or use the active-node overlay valve
- settled zoom views are crisp at the current DPR and zoom bucket
- no recurring long tasks during pan/zoom on the profiling project

## Risks

### WebGPU HTML Upload Availability

The official proposal lists `GPUQueue.copyElementImageToTexture`, but local Chromium support must be verified. If unavailable, the same architecture can be implemented with WebGL2 `texElementImage2D`, but that should be an explicit decision after the probe.

### Texture Memory

High-resolution node textures can consume large GPU memory. Culling, retention windows, resolution buckets, and max texture limits are required from the first version.

### Huge Nodes

Very large nodes may exceed texture limits at high zoom. Start with clamped resolution. Add tiling only if profiling and visual checks prove it is required.

### Interactive Upload Cost

A complex node may be expensive to upload every frame while a slider or editor is active. The active-node DOM overlay valve protects immediate feedback for the active node while keeping the rest of the viewport GPU-rendered.

### DOM Hit Testing Alignment

The real DOM transform must match the GPU quad transform exactly. Any mismatch will break clicks, hover, handles, and text selection. This needs automated geometry tests plus CDP checks.

### Edge Hit Testing

Moving edges from SVG to GPU removes DOM hit targets. CPU path geometry must be reliable enough for selection, context menus, and reconnection.

## Success Criteria

- No XYFlow runtime code remains.
- Pan/zoom does not transform or repaint the node DOM tree.
- Visible nodes render from cached GPU textures.
- Node texture uploads happen only for dirty content or resolution changes.
- Settled nodes are crisp at their current zoom and DPR.
- Sliders, text inputs, CodeMirror, terminals, scrolling, buttons, and handles remain real interactive HTML.
- Dragging an active slider updates at frame latency without making the whole viewport DOM-painted.
- Grid, edges, selection, and connection state render through GPU paths.
- Profiling shows pan/zoom dominated by GPU draw work, not DOM paint/composite.
