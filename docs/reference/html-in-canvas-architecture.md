# HTML-in-Canvas Architecture

This document is the complete reference for Setta's project-level
HTML-in-canvas architecture and the lower-level WebGPU HTML surface renderer.
DOM section bodies remain real React DOM sources for browser-owned content,
focus, editor behavior, and hit testing during handoff, while retained parameter
rows are rendered from project-owned retained scenes. The visible project
surface is composed by WebGPU from cached HTML textures and retained canvas
textures. Interaction projects source DOM under the browser pointer; it does not
make the source DOM the visible rendering path.

The project entrypoint is
`frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`.
The reusable canvas runtime lives under `frontend/src/gpuFlow/`.

## High-Level Model

The project surface is a WebGPU canvas composed from several owner surfaces:

- DOM section sources: real React section DOM mounted as direct children of the
  `<canvas layoutsubtree>` element. Chromium paints those children into HTML
  textures, and WebGPU composes the textures into the visible project surface.
- Retained parameter content: project-owned retained scenes for parameter rows,
  controls, popups, drag previews, hit records, and port anchors. These scenes
  are page-rasterized into WebGPU textures by the retained texture page manager.
- GPU-native retained visuals: scrollbars, row hover state, and switch
  transitions are generated as native rounded-rect visuals and layered with
  retained page textures in the WebGPU frame.
- HTML overlay sources: DOM sources for edge labels, selection visuals, resize
  affordances, and drag previews.
- Retained text-like snapshot sources: source-local DOM for inactive text-like
  retained controls. These sources are copied into retained page textures during
  retained page upload.
- DOM islands: viewport-positioned real DOM siblings of the canvas for active
  native controls that need browser input behavior, such as text/code inputs,
  textareas, password fields, date/time fields, dropzones, color input
  fallback, and parameter name editing.
- Viewport-positioned overlay roots: `GpuFlow` viewport portals for retained
  CodeMirror tooltips and validation UI, plus shared DOM portals for combobox
  lists and primitive-owned popovers that subscribe to GPU viewport
  repositioning when anchored to canvas content.

For DOM section and overlay sources, the renderer separates source hosts,
texture snapshots, and visual records:

- Source hosts are React-owned DOM `div` elements created by
  `HtmlSurfaceSourceLayer` and mounted as direct children of the
  `<canvas layoutsubtree>`.
- `CommittedHtmlSurfaceTextureSnapshot` and `HtmlSurfaceTextureTileRecord`
  describe one full-surface texture or a tiled texture layout uploaded from the
  source when content, size, style, animation cadence, or resolution changes.
- Textured `HtmlSurfaceVisual` records map committed textures into the WebGPU
  scene as flat quads, tiled flat surfaces, mesh surfaces, or shader-effect
  surfaces. Solid rounded-rect visuals are GPU-native records and do not carry
  HTML textures.

Project state, project settings, and backend mutations remain the canonical
owners for section structure, dimensions, ordering, parameter values, and edge
connections. `GpuFlowScene` and the GPU layout store describe the frame being
rendered and any in-progress interaction previews. Drag, resize, scroll, and
retained-control interactions patch those runtime surfaces first, then commit
through the project owner paths.

The hot path for viewport movement is:

1. Input updates the viewport tuple `[x, y, zoom]`.
2. `GpuSurface` schedules one animation frame.
3. `renderHtmlSurfaceFrame()` builds the visible surface set from node layout,
   the viewport, and cached texture records.
4. `HtmlSurfaceRenderer.render()` writes camera uniforms and redraws grid,
   edges, retained textures, and already-uploaded HTML surfaces.
5. Passive texture resolution upgrades and passive uploads are deferred while
   viewport interaction is active and on viewport frames that are not
   `texture-upload` frames.

Pan and zoom frames whose visible surfaces are already covered by committed
textures do not call `requestPaint()`, upload HTML source textures with
`GPUQueue.copyElementImageToTexture()`, force section React renders, or rewrite
every source transform. Viewport frames with prepared retained displays that
have true holes run first-visible retained-page repair before publishing the
retained display frame.

## Scene Model

`GpuFlowScene` is the project-to-runtime contract:

- `sections`: resolved section scene nodes with world geometry, local geometry,
  clipping, layout mode, scroll offset, resize policy, child ids, and port
  anchors.
- `contentSurfaces`: renderable section and retained-content surfaces. Section
  DOM surfaces use `renderer.kind === "dom-section"`. Retained parameter
  surfaces use `renderer.kind === "canvas-content"` and carry a retained scene.
- `domIslands`: active native DOM island descriptors with flow-space geometry,
  clipping owner, source hit record, z-index, and optional pointer activation.
- `edges`: scene edge records reserved for generic scene metadata. Project-rendered
  edge geometry, labels, reconnect anchors, hit testing, and connection-line state
  live in the separate `GpuEdgeScene` passed to `GpuFlow` through `edgeScene`.
- `revision`: the project scene revision used by frame and interaction code.

The project scene is built in `projectGpuLayoutAdapter.ts` from project state,
active view layout, section records, measured sizes, project search, scroll
offsets, type errors, parameter edit policy, and retained interaction state. The
scene layout pass in `gpuFlow/sceneLayout.ts` resolves parent/child world
geometry, ordered child placement, clipping, nested scroll offsets, and layout
modes such as `none`, `vertical`, `horizontal`, and `kanban`. The generic scene
type also supports `absolute`; the project adapter emits the modes above for
Setta sections.

`projectGpuFlowSceneFactory.ts` appends retained parameter content surfaces and
DOM islands to the layout scene. `syncProjectGpuLayoutStoreFromScene()` keeps
the GPU layout store aligned with the renderable DOM-section nodes so shared
interaction controllers operate on the same coordinates as the renderer.

## Module Map

The project integration is centered on these modules:

- `projectGpuSurface.tsx` wires project state, settings, edge scenes, grid,
  pan/zoom, selection, section drag, section resize, scene scroll, retained
  parameter interactions, retained keyboard navigation, portals, and DOM
  islands into `GpuFlow`.
- `projectGpuLayoutAdapter.ts` builds the project scene and owns scene scroll
  offsets, retained-content runtime state, scene reveal helpers, and resize
  preview scene resolution.
- `projectGpuFlowSceneFactory.ts` attaches retained parameter content surfaces
  and active DOM islands to a resolved section layout scene.
- `projectGpuNodeRenderer.tsx` renders each DOM section source with
  `SectionContainer`.
- `projectGpuParamContentAdapter.ts` creates retained parameter surfaces,
  retained row scenes, and active parameter DOM island descriptors.
- `projectGpuParamRowAdapter.ts` and the `projectGpuParam*RowDescriptor.ts`
  files map project parameter implementations to retained row and control
  descriptors.
- `projectGpuRetainedParamInteractionAdapter.tsx` maps retained hit records to
  project actions, parameter value commits, canvas popups, native DOM island
  activation, range-control drags, retained drag previews, and retained edge
  connections.
- `projectGpuParamDragAdapter.ts` resolves retained parameter structural moves.
- `projectGpuPortalAdapter.ts` declares source-local and viewport portal roots
  used by CodeMirror, retained-native tooltips, and validation UI.
- `projectNodeResize.ts` adapts GPU node resizing to Setta section size policy,
  scene previews, local state updates, and persistence.
- `projectGpuSelectionAdapter.ts` adapts GPU node drag, nested reparent/reorder
  previews, selection changes, selection drags, keyboard nudges, and final
  persistence.

The reusable runtime is centered on these modules:

- `GpuFlow/flowSurface.tsx` owns runtime composition, frame scheduling hooks,
  controller attachment, source layers, overlay sources, portals, DOM islands,
  and renderer callbacks.
- `GpuFlow/flowFrame.tsx` owns per-frame orchestration for retained content
  pages, HTML surface rendering, performance reporting, and additional frame
  requests.
- `GpuSurface.tsx` creates the `<canvas layoutsubtree>` element, initializes
  WebGPU/html-in-canvas support, listens to paint and resize events, and
  coalesces frame requests.
- `htmlSurfaces/sourceLayer.tsx` creates direct-child source hosts under the
  canvas.
- `htmlSurfaces/frame.tsx` resolves visible DOM and overlay quads, syncs source
  DOM transforms, registers and uploads dirty HTML textures, builds the visual
  scene, renders, and evicts HTML textures.
- `htmlSurfaces/textures.ts` owns HTML source texture records, resolution
  selection, tile uploads, upload priorities, dirty tracking, and texture
  eviction.
- `htmlSurfaces/renderer.ts` draws grid, edges, normal flat and tiled HTML
  surfaces, mesh surfaces, shader-effect surfaces, late flat retained/page
  overlays from cached textures, plus GPU-native retained visuals that do not
  sample HTML textures.
- `htmlSurfaces/visualScene.ts` groups HTML surface visuals into flat, tiled
  flat, late flat, mesh, effect, and solid rounded-rect buckets for rendering.
  Hit testing projects flat, tiled flat, late flat, mesh, and effect visuals.
- `htmlSurfaces/hitScene.ts` and `htmlSurfaces/interactionProjector.ts` map
  pointer and wheel events through rendered visuals back into source-local DOM
  coordinates.
- `htmlSurfaces/apiProbes.ts` keeps source-host policy checks and probe result
  summary helpers used by focused browser capability tests.
- `viewportStore.ts`, `viewportActions.ts`, and `viewportMath.ts` provide the
  zustand-backed viewport model and explicit coordinate conversion helpers.
- `retainedRuntimeFrame.ts`, `GpuRetainedContentPageFrameSurfaces.ts`,
  `retainedDisplayFrame.ts`, `GpuFlow/flowRetainedPageMaintenance.ts`,
  `GpuFlow/flowRetainedPreparationRuntimeFrame.ts`, and
  `retainedContentTexturePageManager.ts` sample retained runtime frames, derive
  retained page frame inputs, repair first-visible true holes before display
  publication, publish active retained display frames, page-rasterize retained
  scenes, cache committed retained pages, and schedule retained texture upload
  work.
- `retainedContentFrameGeneration.ts` is a test-only descriptor-generation
  facade and throws outside the test environment.
- `retainedContentScene.ts` and related retained-content modules build retained
  rows, draw commands, popups, scrollbar hit records, general hit records, port
  anchors, and control geometry.
- `GpuFlow/domIslandLayer.tsx` renders active DOM islands as viewport-positioned
  real DOM.
- `GpuFlow/flowOverlays.tsx` gathers edge label, selection, resize, and drag
  preview HTML overlay sources plus retained text-like snapshot source roots
  and retained native visual inputs. Scrollbar and row-hover native visuals are
  sampled into the retained runtime frame; switch-animation visuals are sampled
  in `GpuFlow/flowFrame.tsx`.
- `GpuFlow/retainedContentControllers.ts` attaches retained-content pointer,
  drag, scroll, keyboard, scrollbar, hover, connection, and scene-port
  controllers.
- `portals/portalManager.tsx`, `portals/floatingPosition.ts`, and
  `viewportReposition.ts` provide canvas-aware portal partitioning and floating
  overlay placement.
- `interactions/panZoom.ts`, `interactions/nodeDrag.ts`,
  `interactions/nodeResize.ts`, `interactions/selection.ts`,
  `interactions/retainedContentInteraction.ts`,
  `interactions/retainedContentScroll.ts`, and related interaction modules own
  pointer, wheel, keyboard, drag, resize, scroll, and connection controllers.

## Project Integration

`GpuProjectSurface` wires the reusable GPU flow runtime to Setta's project
runtime:

- renders each DOM section source as `SectionContainer`
- observes section element resizes and writes section dimensions through the
  project dimension update path
- mirrors GUI settings for zoom bounds, grid style, pan behavior, zoom
  behavior, selection mode, and snap grid
- builds edge scenes for data, agentic, workflow, missing, scope-violation, and
  connection edges
- keeps CodeMirror tooltips and Setta popover portals in the correct canvas,
  viewport, or app-level portal root
- renders selected-node bounds, resize handles, edge labels, retained popups,
  drag previews, and native DOM islands through the owner surface for each UI
  class
- forwards pane clicks, context menus, file drops, node drags, resize commits,
  selection commits, parameter value commits, and connection edits into
  existing project actions

The renderer keeps high-level project behavior in the project owners while
implementing viewport state and visual composition in the GPU runtime.

## Ownership Boundaries

Setta owns the project scene graph, layout, retained parameter renderer,
texture lifecycles, dirty tracking, hit records, and interaction controllers.
Support libraries have narrow jobs:

- `@floating-ui/dom` provides placement math for custom DOM overlays through
  `gpuFlow/portals/floatingPosition.ts`. The wrapper supports real references,
  virtual point/rect references, fixed positioning, offset/flip/shift/size
  middleware, and rescheduling on GPU viewport transforms.
- Radix primitives own browser behavior for DOM popovers, dialogs, dropdowns,
  sliders, and switches that remain real DOM. Retained canvas controls do not
  delegate value state or hit testing to Radix. When a Radix popup is anchored to
  canvas content, GPU integration supplies a portal target and viewport
  reposition notifications.
- Downshift owns shared combobox input, listbox, selection, and keyboard
  semantics for DOM comboboxes. Canvas-aware combobox lists use their configured
  portal container plus the shared Floating UI wrapper to refresh placement
  during pan and zoom.
- dnd-kit owns DOM-only sortable surfaces through
  `frontend/src/forks/dnd-kit/adapter`. Section drag, section resize, retained
  parameter drag/drop, and retained parameter scroll are owned by GPU
  interaction controllers.

Core project-surface behavior enters through the owner modules above: scene,
retained-content, interaction, portal, and persistence paths own their
respective classes of work.

## Browser Capability Contract

`frontend/src/gpuFlow/gpuDevice.ts` owns startup checks for core
WebGPU/html-in-canvas runtime support and `GPUQueue.copyElementImageToTexture`,
while `frontend/src/gpuFlow/gpuRenderer.ts` checks `ResizeObserver` during
DPR-aware canvas sizing setup. Texture creation and retained page upload paths
also fail loudly when `GPUTextureUsage`, `GPUQueue.copyExternalImageToTexture`,
or a 2D canvas context is unavailable. GPU flow requires these native APIs:

- `HTMLCanvasElement.layoutSubtree`
- `HTMLCanvasElement.requestPaint`
- the canvas `paint` event
- `CanvasRenderingContext2D.drawElementImage`, used as an html-in-canvas
  support probe
- `navigator.gpu`
- a WebGPU adapter and device
- a WebGPU canvas context
- `GPUTextureUsage` constants
- `GPUQueue.copyElementImageToTexture`
- `GPUQueue.copyExternalImageToTexture`
- a 2D canvas context for retained page rasterization
- `ResizeObserver`

Focused tests cover source policy, dirty tracking, renderer behavior, and
texture upload paths. There is no fallback renderer in this path.

## DOM Sources, Portals, and DOM Islands

`GpuSurface` renders one canvas with `layoutsubtree=""`. `HtmlSurfaceSourceLayer`
uses hidden anchor spans as React insertion points, creates host `div` elements,
and inserts each host beside its anchor as a direct canvas child. The direct
canvas-child shape is required for the browser to paint and upload the source
through html-in-canvas.

The simplified project runtime DOM shape is:

```tsx
<div className="setta-gpu-flow-root setta-light dark:setta-dark">
  <div className="setta-gpu-flow setta-gpu-flow__pane">
    <canvas
      className="setta-gpu-flow__canvas"
      data-gpu-flow-surface="true"
      layoutsubtree=""
    >
      <span
        data-gpu-flow-html-source-anchor="true"
        data-gpu-flow-source-id={nodeId}
        style={{ display: "none" }}
      />
      <div
        className="setta-gpu-flow__html-source setta-gpu-flow__node"
        data-gpu-flow-explicit-dirty-source="true"
        data-gpu-flow-html-source="true"
        data-gpu-flow-node="true"
        data-gpu-flow-source-id={nodeId}
      >
        <SectionContainer sectionId={nodeId} isTopLevel={true} />
      </div>
      <div
        id="setta-codemirror-tooltips"
        className="setta-gpu-flow__portal-root setta-gpu-flow__portal-root--source-local"
        data-gpu-flow-portal-root="true"
        data-gpu-flow-portal-space="source-local"
      />
      <div
        className="setta-gpu-flow__html-source setta-gpu-flow__edge-label-source"
        data-gpu-flow-edge-label-source="true"
        data-gpu-flow-explicit-dirty-source="true"
        data-gpu-flow-html-source="true"
        data-gpu-flow-source-id={edgeLabelId}
      >
        <div className="setta-gpu-flow__edge-label">{edgeLabelText}</div>
      </div>
      {/* Selection, resize, drag-preview, and retained snapshot sources
          are more direct canvas children created by HtmlSurfaceSourceLayer. */}
    </canvas>
    <div className="setta-gpu-flow__dom-island-layer">
      {/* Active retained native controls are viewport-positioned here. */}
    </div>
    <div
      id="setta-gpu-retained-codemirror-tooltips"
      className="setta-gpu-flow__portal-root setta-gpu-flow__portal-root--viewport"
      data-gpu-flow-portal-root="true"
      data-gpu-flow-portal-space="viewport"
    />
    <div
      id="setta-gpu-retained-param-validation"
      className="setta-gpu-flow__portal-root setta-gpu-flow__portal-root--viewport"
      data-gpu-flow-portal-root="true"
      data-gpu-flow-portal-space="viewport"
    />
  </div>
</div>
```

Source hosts use stable base styles:

```text
position: absolute
left: 0
top: 0
transform-origin: 0 0
pointer-events: none
contain: layout paint style
```

Visible transform synchronization applies the passive source transform
`translate(0px, 0px) scale(1)` unless the source is projected for pointer or
wheel handoff. The cached frame path rewrites only visible sources and retained
active sources; exited inactive sources are not rewritten on every frame and are
ignored by the visual scene outside the visible set.

During passive rendering, the source DOM is capture material for textures. DOM
transform synchronization keeps visible sources sized for html-in-canvas
capture and avoids broad rewrites of inactive, no-longer-visible sources.
Active or force-visible sources remain live while their handoff or retention
state is active. During pointer or wheel handoff, the interaction projector
aligns the target source-local point under the browser pointer and enables
pointer events for that source. When the interaction ends, the source returns to
passive capture state.

Pointer and wheel handoff modifies only the targeted source:

```text
transform: translate(surfaceX - localX, surfaceY - localY)
pointer-events: auto
```

The same source-layer mechanism mounts section DOM sources, HTML overlay
sources, and retained text-like snapshot sources. Section and overlay sources
are registered with `HtmlSurfaceTextureManager` and drawn as DOM textures.
Retained text-like snapshot elements are tracked by source id, and retained page
frame descriptors carry the matching snapshot ids and source keys so
`RetainedContentTexturePageManager` copies matching snapshot DOM into retained
page textures.

Page frame descriptors are sampled from runtime scroll offsets in
`GpuFlow/flowFrame.tsx` via `createGpuRetainedRuntimeFrame()`. The hidden React
snapshot source layer is mounted from the source retained runtime frame via
`GpuFlow/flowSurface.tsx` and `GpuFlow/flowOverlays.tsx`; frame preparation can
narrow that source list to descriptors needed for current first-visible repair
or refinement work. Retained page upload joins sampled descriptors with mounted
snapshot source elements by snapshot id and source key before copying text-like
DOM into retained page textures.

Portal roots are partitioned into three coordinate spaces:

- `source-local`: roots rendered inside `GpuSurface` as canvas children. These
  are for source-owned DOM that belongs to the layout subtree, such as
  CodeMirror tooltips.
- `viewport`: roots rendered as siblings of the canvas. These are for overlays
  positioned in viewport CSS pixels, including retained-native CodeMirror
  tooltips and validation UI.
- `flow-anchored`: a coordinate space for graph-positioned DOM. `GpuFlow`
  rejects non-empty flow-anchored portal groups; graph-positioned UI is
  represented as a renderer overlay or HTML surface descriptor.

All portal roots include the standard no-pan and no-drag classes so overlay
interactions do not leak into canvas gestures. Custom positioned overlays use
`autoUpdateGpuFloatingPosition()`. Primitive-owned overlays that opt into
canvas-aware placement use `subscribeToGpuViewportReposition()` so their
placement logic reruns after pan or zoom. Shared app-level portal roots such as
`setta-popover-portals` live outside `GpuFlow`; they are not declared through
`GpuFlowPortalDescriptor`.

DOM islands are rendered by `GpuFlowDomIslandLayer`, which is a sibling of the
canvas inside the GPU flow container. Each island is positioned from its
flow-space `rect` with the viewport transform and scaled by `viewport.zoom`.
Visible DOM islands have pointer events enabled and include the no-pan/no-drag
classes. Islands clipped out by retained runtime sampling are not published;
islands outside the viewport window are hidden with pointer events disabled.
They are not uploaded as textures; they are the active
browser-native surface for the edited control.

## Frame Pipeline

`GpuProjectSurface` builds an effective `GpuFlowScene` and passes it to
`GpuFlow`. `GpuFlow` stores the active node-layer state, subscribes to viewport
changes, attaches interaction controllers, and asks `GpuSurface` for frames.

`GpuSurface` coalesces frame reasons such as `animation`, `init`, `manual`,
`paint`, `resize`, `texture-upload`, and `viewport`. A viewport-store transform
change requests a `viewport` frame. A canvas paint event resolves changed source
elements to owning textures and requests a `paint` frame. Exhausted upload
budgets request another `texture-upload` frame, while active retained switch
transitions request another `animation` frame.

Each render frame follows this shape:

1. `renderGpuFlowNodeLayerFrame()` resolves the canvas size, active scene,
   renderer, HTML texture manager, and retained texture page manager.
2. `createGpuRetainedRuntimeFrame()` samples retained content from runtime
   scroll offsets, clips retained surfaces, resolves each surface texture window,
   derives text-like row snapshot descriptors for page upload, and builds
   retained page frame surfaces.
3. `RetainedContentTexturePageManager.resolveFrameViewportZoomBucket()` selects
   the stable zoom bucket. `prepareFrame()` computes desired page descriptors,
   committed-page draw regions, replacement and refinement work descriptors, and
   any true-hole count for pages that are required for first-visible coverage.
4. If the prepared retained frame has true holes,
   `GpuFlow/flowRetainedPageMaintenance.ts` repairs first-visible pages before
   display publication. The retained display frame is not published until
   deterministic retained coverage has no true holes.
5. `publishRetainedDisplayFrame()` publishes the retained page visuals, coverage
   proof, flat surface records, and active DOM islands for the frame.
6. `renderHtmlSurfaceFrame()` computes visible DOM and overlay quads from node
   layout, viewport, forced visibility, and upload margin. Scene clipping has
   already been applied to the node and content-surface inputs.
7. The frame syncs DOM transforms for visible, active, and overlay HTML
   sources, registers visible HTML textures, uploads dirty HTML textures within
   the project upload budget, and builds textured DOM and overlay visuals.
8. The visual scene combines DOM textures, overlay textures, retained page
   visuals, retained scrollbar, row-hover, switch-animation, grid, edges, and
   connection-line visuals. `HtmlSurfaceRenderer.render()` draws that scene with
   the viewport camera.
9. HTML textures are evicted according to visibility, protected active ids, and
   memory budget.
10. Retained page maintenance after publish either reuses the work already done
    for true-hole repair, defers passive refinement while
    `deferResolutionUpdates` is true and committed pages cover the frame, or
    calls `RetainedContentTexturePageManager.runPostSubmitMaintenance()` to
    enqueue missing retained pages, rasterize and upload retained page textures
    within its own budget, upload text-like row DOM snapshots into retained page
    textures when required, evict retained pages to budget, and report whether
    another frame is needed.
11. Frame performance reporting records render time, upload work, texture memory,
    retained page metrics, viewport state, and interaction diagnostics.

Pure pan and zoom frames update the runtime viewport and redraw cached
surfaces. Passive texture resolution upgrades and passive uploads are deferred
while `deferResolutionUpdates` is true: whenever viewport interaction is active
and on viewport frames that are not `texture-upload` frames. True-hole retained
page repair runs before display publication so first-visible coverage is never
published with holes. When compatible committed pages already cover the frame,
post-publish retained maintenance can defer passive refinement until idle or
`texture-upload` frames catch up deferred retained work.

## HTML Texture Lifecycle

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

Visible HTML and overlay surfaces are registered from `renderHtmlSurfaceFrame()`
each frame. The texture resolution policy in
`frontend/src/gpuFlow/textureResolution.ts` chooses a stable zoom bucket from
this list:

```ts
[0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
```

Without an existing bucket, the target is the smallest bucket at least as large
as the viewport zoom. With an existing bucket, `chooseStableZoomBucket()` applies
the local hysteresis window before changing buckets. The requested scale is
`devicePixelRatio * zoomBucket`, clamped by
`device.limits.maxTextureDimension2D`. If resolution changes while
`deferResolutionUpdates` is true, non-interactive resolution upgrades are
deferred so wheel and pan bursts stay responsive and viewport-only frames stay
camera-focused.

Dirty work is ordered by `frontend/src/gpuFlow/dirtyTracking.ts`. Priorities are
`interactive`, `visible`, and `prefetch`; interactive content is uploaded before
passive visible content. Content dirtiness wins over resolution-only dirtiness.

The project surface uses this HTML upload budget:

```ts
{
  maxBytes: DEFAULT_HTML_SURFACE_TEXTURE_UPLOAD_BUDGET_BYTES,
  maxDurationMs: 4,
  maxUploads: 2,
}
```

`HtmlSurfaceTextureManager.uploadDirtySurfaceTextures()` requires
`GPUQueue.copyElementImageToTexture`. Large surfaces are split into tiles by
`frontend/src/gpuFlow/htmlSurfaces/textureTiles.ts`, and dirty source rects are
resolved to owning tiles by
`frontend/src/gpuFlow/htmlSurfaces/textureDirtyTiles.ts`. Upload reporting
tracks uploaded bytes, skipped bytes, remaining dirty surfaces, and exhausted
budget state.

Retained parameter content has a separate texture lifecycle. The retained page
manager rasterizes retained scenes into page textures, uploads those pages on
its own budget, and evicts retained pages independently from HTML source
textures. Text-like snapshot DOM is copied into retained page textures during
retained page upload rather than being registered as standalone HTML visuals.

## WebGPU Scene Rendering

`frontend/src/gpuFlow/htmlSurfaces/renderer.ts` owns WebGPU scene rendering. A
single `HtmlSurfaceRenderer.render()` call draws each frame in this order:

1. grid
2. edges and connection lines
3. normal flat HTML surfaces
4. tiled flat HTML surfaces
5. mesh HTML surfaces
6. shader-effect HTML surfaces
7. late flat surfaces, including retained page visuals and late overlays
8. solid rounded-rect native visuals, including retained scrollbars, row hover
   state, and switch transitions

The camera uniform stores:

- viewport x
- viewport y
- viewport zoom
- canvas CSS width
- canvas CSS height

Flat, tiled, and late-flat surfaces are built in flow coordinates. The vertex
shaders convert each flow position to screen coordinates with the viewport and
then to clip space. Fragment shaders sample the uploaded full texture, tile
texture, or retained page texture. Mesh and shader-effect passes use the same
texture records with specialized vertices, indices, effect uniforms, and hit
projector contracts.

Viewport-only redraws of an unchanged visual scene write only the camera
uniform. When pan or zoom crosses a culling boundary, the active draw set
changes; the frame syncs newly entered source hosts and any retained or active
hosts that must stay live, while inactive exited hosts can keep their previous
passive DOM state because they are already dropped from visual and hit scenes.
The renderer rewrites the flat or tiled-flat vertex buffer for changed draw
geometry. Those bounded updates are separate from content updates: they do not
call `requestPaint()`, perform HTML texture uploads, or force React renders, and
transform-only paint records from synced sources are ignored for dirtying.
Frame and probe reports expose DOM transform counts, texture upload work,
retained page work, edge vertex counts, and queue write summaries so pan/zoom
verification can distinguish camera-only frames from draw-set changes.

Edges are generated as CPU-side line-list buffer data from the edge scene and
are drawn through a WebGPU line pipeline. Grid rendering uses a full
screen triangle and computes the grid pattern in the fragment shader from the
camera and grid settings.

## Visibility And Z Order

`getGpuFlowSceneDomSectionNodes()` and content-surface construction apply scene
clip filtering before frame rendering. `collectVisibleGpuNodeQuads()` then
computes a viewport-visible flow rectangle from the canvas size, viewport, and a
default 128 CSS-pixel margin. Nodes with concrete width and height are included
when their rect intersects that visible area or when their id is forced visible.

Visible quads are sorted by `zIndex` and then source order before visual
bucket construction. The renderer still draws by bucket: normal flat surfaces,
tiled flat surfaces, page/late flat overlays, and native rounded-rect visuals
have fixed relative passes, with `zIndex` and source order preserved inside
each bucket. The same visibility set drives:

- texture registration and upload eligibility
- visual scene membership and per-bucket draw order
- stable source host size, z-index, and passive pointer state
- texture memory protection during eviction

DOM section sources remain mounted even when viewport-culled. Viewport culling
affects presentation and interaction eligibility, not React mount lifecycle.
Retained content applies the same principle to page windows: missing or stale
pages are scheduled for raster/upload without remounting the section body that
owns the retained surface.

## Section Content Rendering

Section scene construction starts in `projectGpuLayoutAdapter.ts`. The adapter
reads the active view layout, section implementations, measured section sizes,
scroll offsets, nested child order, resize policy context, search state, type
errors, and edit capabilities. It creates `GpuSectionSceneNode` records for
top-level sections and recursively appends child section nodes.

Each section scene node includes:

- `worldRect`, the resolved flow-space position and size.
- `localRect`, the section rect relative to its parent.
- `bodyRect`, the content body area used by section content.
- `childViewportRect`, the area where child sections are laid out.
- `clipRect`, used for nested scroll and visibility clipping.
- `layoutMode` and `childLayout`, used for ordered child placement.
- `scrollOffset`, used by nested scene scrolling.
- `resizePolicy`, used by the resize controller.
- `portAnchors`, used by edge and connection scenes.
- `contentRenderer`, which identifies the section's renderable surface.

Once the scene is resolved, `getGpuFlowSceneDomSectionNodes()` selects
renderable in-clip `dom-section` nodes; viewport visibility is resolved later by
`collectVisibleGpuNodeQuads()`. `renderProjectGpuNode()` renders each selected
source as:

```tsx
<SectionContainer sectionId={node.nodeId} isTopLevel={...} />
```

`SectionContainer` applies project visibility rules, wraps the section in
`GpuSceneSectionContainer`, and renders `SectionContainerCore` for standard
section bodies. Parameter-owning bodies render their section chrome and
body-specific UI with `renderParamRows={false}`; retained parameter content
surfaces render the parameter rows.

## Retained Parameter Content Rendering

Retained parameter rendering starts in `projectGpuParamContentAdapter.ts`. For
each parameter-owning section, the adapter creates pinned and unpinned retained
surfaces when those lists have visible rows. Separate surfaces let pinned and
unpinned areas keep their own scroll, clipping, texture windows, and z-order.

The adapter computes:

- row metrics, row height, nested gutter, label/control gap, right inset, and
  control width;
- filtered rows from parameter filtering and project search;
- tree-view depth and visible child relationships;
- selected, hovered, focused, active, disabled, error, search, edge-input, and
  drag states;
- viewport rects, clip rects, and clamped retained-content scroll offsets;
- active canvas popups, active canvas controls, active DOM islands, password
  reveal state, and retained drag previews.

`projectGpuParamRowAdapter.ts` maps each project parameter implementation to a
retained row input. `createGpuRetainedRowContentScene()` turns those row inputs
into draw commands, hit records, popup records, scrollbar commands, row order,
visible row ranges, and control descriptors. The retained page rasterizer
filters scrollbar commands because scrollbars are drawn as overlay-owned native
visuals.

The retained renderer uses texture pages:

- `GpuRetainedContentSurfaces.tsx` clips retained surfaces and resolves a cache
  window around the visible scroll position.
- `retainedRuntimeFrame.ts` samples source surfaces, text-like snapshot sources,
  native DOM islands, native visuals, and retained page frame surfaces for the
  scene, scroll offsets, and zoom bucket.
- `GpuRetainedContentPageFrameSurfaces.ts` assigns content versions to the base
  surface and row-level content segments so page freshness checks do not
  rerasterize unrelated rows.
- `RetainedContentTexturePageManager` creates desired page descriptors, reuses
  committed pages, schedules first-visible and refinement work, rasterizes pages
  through `retainedContentPageRasterizer.ts`, uploads page textures, and evicts
  retained pages to budget.
- Text-like controls that are not actively native are rendered into
  source-local snapshot DOM by `GpuFlow/retainedTextLikeRowSnapshotSources.tsx`.
  The retained page manager requires mounted snapshot source elements, copies
  them into retained page textures during page upload, and requests another
  paint if Chromium has not produced the needed element paint record yet.

Retained scrollbars, row-hover state, and switch transitions are GPU-native
rounded-rect visuals layered with the retained pages. Static page textures cache
the non-animated row state.

## Pan and Zoom

Pan and zoom are viewport transforms, not DOM layout changes. The renderer
preserves the project-canvas coordinate contract:

- flow coordinates are project/node coordinates
- surface coordinates are CSS pixels inside the GPU flow container
- viewport state is `[x, y, zoom]`

`frontend/src/gpuFlow/viewportStore.ts` is a zustand vanilla store that holds:

- `transform`, `width`, `height`, `minZoom`, `maxZoom`, and `defaultZoom`
- input state such as pan, zoom, selection, and move activation keys
- viewport interaction flags such as `paneDragging`, `pointerPanning`,
  `wheelZooming`, `panScrolling`, `retainedContentScrolling`, `nodeDragging`,
  `nodeResizing`, and `viewportAnimating`; `viewportInteractionActive` is
  derived from those flags except `paneDragging`
- connection-line state
- user-selection and selected-node bounds
- the GPU flow DOM node for screen-relative coordinate conversion

`frontend/src/gpuFlow/viewportActions.ts` exposes the app-facing action surface:
`setViewport`, `panGpuViewport`, `zoomAtScreenPoint`, `zoomBy`, `zoomTo`,
`setCenter`, `fitView`, `screenToFlowPosition`, `flowToScreenPosition`,
`getViewport`, `getZoom`, `requestInitialFitView`, `finishInitialFitView`,
`setInitialFitViewDone`, `resetZoom`, `updateMapPosition`, and
`cancelViewportTransition`.

Viewport actions accept a bounded duration. When a `GpuFlow` runtime is
registered, `GpuFlowViewportRuntime` owns the animated transition and renders it
through viewport frames; without a runtime, `viewportActions.ts` uses its local
transition scheduler. Direct pan and wheel input cancels active transitions.

The core transform tuple is:

```text
[viewport.x, viewport.y, viewport.zoom]
```

`frontend/src/gpuFlow/viewportMath.ts` owns conversion between flow and screen
coordinates:

```text
screenX = viewport.x + flowX * viewport.zoom
screenY = viewport.y + flowY * viewport.zoom
flowX = (screenX - viewport.x) / viewport.zoom
flowY = (screenY - viewport.y) / viewport.zoom
```

The GPU renderer has explicit controllers instead of d3-zoom or XYFlow
interaction machinery. The pan/zoom controller attaches to the GPU flow
container and receives project settings from `getProjectPanZoomOptions()`:

- pointer-drag panning when pan-on-drag is enabled and selection gestures are
  inactive;
- wheel panning when pan-on-scroll is enabled;
- wheel zooming, pinch/ctrl-wheel zooming, and double-click zooming when the
  corresponding settings allow them;
- activation-key guards for pan and zoom modes;
- pointer-pan start cleanup such as closing open context menus;
- `NO_PAN_CLASS_NAME` and `NO_WHEEL_CLASS_NAME` preservation for controls that
  need native scrolling or pointer behavior.

Zooming at a point preserves the flow coordinate under the pointer. The
controller computes the pointer's flow-space coordinate, clamps the target zoom
to the viewport bounds, then adjusts `viewport.x` and `viewport.y` so the same
flow point remains under the same screen point.

## Section Resize

Section resizing is owned by the GPU interaction layer. Resize handles are
renderer overlays, and pointer hit rects are resolved from flow-space handle
geometry.

The resize flow is:

1. `projectGpuLayoutAdapter.ts` computes each section's scene resize policy from
   section type, min/max dimensions, sizing policy, aspect ratio fields, lock
   state, and resize event context.
2. `projectNodeResize.ts` adapts that policy to generic GPU node resize
   options and project guards.
3. `attachGpuFlowNodeResizeController()` delegates to the generic
   `attachGpuNodeResizeController()`.
4. Pointer movement is converted from screen delta to flow delta by dividing by
   `viewport.zoom`.
5. The controller applies direction, min/max bounds, aspect ratio, and optional
   snap grid rules.
6. During resize, the GPU layout store is patched and a resize preview scene is
   resolved so nested layout, clips, ports, and retained surfaces match the
   preview size.
7. On stop, `updateNodeDimensionsFromGpuResize()` updates local dimensions,
   `persistSectionSizeChange()` persists section size policy, and top-level
   layout routing is debounced through the normal project route.
8. On cancel, the baseline scene, layout store state, and promoted auto-size
   state are restored.

The resize overlay is an HTML surface overlay source. It is uploaded through the
same HTML texture path as other overlay sources.

## Section Drag, Selection, and Nested Reorder

Section drag uses the generic GPU node drag controller with project adapters.
The controller handles pointer capture, drag thresholding, selected-node drag,
flow-space coordinate conversion, optional snap, auto-pan near viewport edges,
layout-store previews, and final commit or cancel.

Top-level sections are free-positioned. During drag, their GPU layout records
are patched. On stop, the adapter persists positions with `updateNodePositions()`
and updates z-order with `setZIndices()` when needed.

Nested sections are ordered children of a parent section. During drag,
`previewProjectNestedNodeDrag()` resolves child move operations through the
nested scene child-move resolver. The preview supports reparenting or reordering
the dragged section group, patches the scene layout store, draws drag bounds,
draws a drop marker, and auto-scrolls the nested viewport. On stop, the project
adapter commits the structural move through
`moveSectionsWithBackend()` with `sectionIds`, `newParentId`, `newIndex`, and
`positionsById: null`.

Nested drag target resolution is scene-aware. The drop parent is selected from
ordered child drop rects under the dragged center point, preferring deeper and
higher-priority candidates. Move resolution rejects invalid targets such as same
parent/index no-ops, descendant-parent moves, and targets that cannot accept
ordered children.

Selection and selection drag use GPU selection controllers. Selection changes
flow through `handleProjectSelectionChange()`, and keyboard nudge/selection
drag persistence flows through `projectGpuSelectionAdapter.ts`.

## Parameter Interactions and Inputs

Retained parameter interaction uses retained-content hit records. The runtime
controller hit tests retained scenes, preserves active native DOM island
targets, tracks click-versus-drag thresholds, emits drag start/move/frame/end
callbacks, updates hover and scrollbar visuals, and reports pointer activity in
flow-local retained-content coordinates.

Parameter drag starts when structure editing is enabled, parameter selection
mode is active, and the pointer starts on a row or label hit. The drag session
records the source section, retained surface, active parameter, selected move
set, parent map, visible children by parent, source parent, and list key. A
filtered parameter list blocks structural moves because visible order does not
represent the full canonical order. Edge-input parameters are not movable.

Drop targets are resolved inside the same retained surface. Drops land before
or after a row based on pointer position relative to the row midpoint, or inside
an empty nested parent control. Drop resolution rejects drops onto the moved
set, drops into descendants of the moved set, invalid parents, and no-op moves.
When hidden rows exist, the full insertion index is resolved from the visible
insertion point so hidden children keep their canonical relative order. On drop,
the adapter commits through `moveParamsWithBackend()`.

Parameter controls are split by commit policy:

- `immediate`: clicks, popup selections, and small control actions commit from
  the retained canvas path. This includes switches, buttons, dropdown choices,
  color choices with known options, date-calendar choices, password reveal
  actions, and dropzone attachment delete actions.
- `preview-commit`: range controls such as sliders and rotaries preview during
  pointer, keyboard, or wheel interaction and commit when the interaction ends.
- `native-island`: text-like controls, password entry, dropzones, date/time
  fields, color input fallback, and editable parameter labels mount a real DOM
  island for browser-native editing.

`projectGpuParamDomIslandGeometry.ts` computes island geometry and clips it to
the retained surface. `projectGpuRetainedParamDomIslandRenderer.tsx` mounts the
normal `ParamInput` or `ParamNameInput`, marks it as retained native content,
focuses it, and replays the original pointer activation when present.

`ParamInput` owns the same value semantics used outside the GPU surface: pending
local value, preview state, debounced backend updates, realtime literal emits,
password reveal, dropzone file state, date/time values, disabled state, and
error state. Standard value commits flow through
`commitParamInputValueChange()` and the OpenAPI project update path. The
HTML-in-canvas layer owns interaction routing and rendering, not a parallel
parameter value model.

## Edges and Connections

Section scene nodes expose port anchors for section, parameter, agentic,
shared-chat, and workflow connections. `useProjectGpuEdgeScene()` derives the
rendered edge scene from section layout and project edge state. `GpuFlow`
renders grid, edges, connection lines, and edge labels in the WebGPU frame.

`frontend/src/components/Pages/Project/gpuProjectEdgeScene.ts` adapts project
state into `GpuEdgeScene`. The scene combines:

- data edges from `projectConfig.edges`
- agentic edges from `projectConfig.agenticEdges`
- workflow edges from `projectConfig.stateMachineEdges`
- scope-violation edges
- the active connection line

Data edges use scene-derived section and retained-content handle positions.
Agentic and workflow edges anchor to node frames.
`frontend/src/gpuFlow/edges/edgeGeometry.ts` builds straight or bezier geometry
and also powers CPU hit testing. Pointer interaction on edges is handled before
pane interaction by `frontend/src/gpuFlow/interactions/edges.ts`, which converts
the screen event to flow coordinates and tests against the edge scene with a
screen-pixel tolerance converted to flow units.

Connection ownership is split by interaction source:

- Edge click and context-menu selection use GPU edge interaction controllers.
- Edge endpoint moves use the GPU edge reconnect controller.
- Retained parameter row ports use retained-content connection controllers.
- Section scene port anchors use scene-port connection controllers.

Project adapters validate each connection through the appropriate project owner
(`isValidDataEdgeConnection`, agentic/shared-chat/state-machine validators, or
handle-specific candidate policy) and commit through the matching project
action.

## Hit Testing and Dirty Tracking

Section hits use the GPU layout, HTML surface visual scene, and source
interaction projector. Retained parameter hits use retained scene hit records.
DOM island targets are preserved so browser focus, selection, file/dropzone
behavior, and form events work normally.

Pointer and wheel targeting follows the rendered visual scene:

1. `HtmlSurfaceHitScene` maps the client point through the matching flat,
   tiled-flat, mesh, or effect visual.
2. Flat and tiled-flat surfaces use exact inverse viewport math.
3. Mesh surfaces raycast CPU triangles and interpolate UVs.
4. Shader-effect surfaces carry a projector id. Hit testing requires a
   registered projector for that id; a missing projector throws instead of
   silently falling back.
5. `HtmlSurfaceInteractionProjector` aligns the source host so the projected
   local coordinate sits under the browser pointer.
6. Browser hit testing resolves the native target after source projection, and
   the controller dispatches the narrow synthetic pointer/mouse/click handoff
   events needed to activate that target.

Dirty tracking separates transform-only frames from content changes:

- html-in-canvas paint events mark changed DOM source elements dirty;
- DOM events and custom GPU-flow dirty events mark source textures dirty for
  input, focus, selection, animation, transition, and interaction updates;
- source-rect invalidations map dirty content to owning texture tiles;
- retained-content scroll, hover, scrollbar, switch animation, and row content
  changes mark retained pages or native visuals dirty.

The controller exported from `frontend/src/gpuFlow/nodeInteractionDirty.ts` and
implemented under `frontend/src/gpuFlow/nodeInteractionDirty/` listens at
DOM event capture for events that imply a source texture is stale:

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

Dirty marks carry source-relative rect hints where the event target provides a
specific owning area. Large tiled surfaces use those hints to dirty and upload
only the affected tiles. Source-owned finite CSS transitions and animations are
tracked as bounded animation leases; they request capture frames for the owning
surface or tile through animation settlement.

HTML texture upload priorities are `interactive`, `visible`, and `prefetch`.
Content dirtiness outranks resolution-only dirtiness. Active sources and active
overlay surfaces are protected from eviction. Retained page uploads have their
own raster/upload/memory budget and request additional frames independently from
HTML source texture uploads.

Pure pan and zoom are transform-only. Panning and zooming do not request HTML
paints, rerender section trees, or upload every texture; transform-only paint
invalidations are routed away from texture dirtying.

## Verification Surface

The architecture is protected by model-level and browser-level tests:

- property and model tests under `frontend/src/gpuFlow/` cover finite viewport
  coordinate conversion, zoom-at-point invariants, fit-view bounds, retained
  visible row ranges, retained hit clipping and precedence, retained texture
  page coverage, and retained scene behavior;
- focused unit tests cover scene layout, resize previews, section drag behavior,
  retained parameter insertion/drop behavior, portal partitioning, Floating UI
  virtual references, retained row diagnostics, retained controls, retained
  page rasterization, texture work queues, and retained texture page budgeting;
- browser tests under `frontend/tests/e2e/gpu-flow/` and
  `frontend/tests/e2e/settings/` exercise canvas popup and context-menu
  placement, retained native islands, scoped axe checks, retained scroll,
  retained popups, retained drag/drop, retained CodeMirror activation, visual
  regressions, and pan/zoom/scroll performance probes.
