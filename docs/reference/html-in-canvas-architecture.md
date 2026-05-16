# HTML-in-Canvas Architecture

This document describes the Setta project-level HTML-in-canvas architecture as
implemented by the project GPU surface. It complements
`docs/reference/webgpu-pan-zoom-html-in-canvas.md`, which covers the lower-level
WebGPU HTML surface renderer.

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

Project state, project settings, and backend mutations remain the canonical
owners for section structure, dimensions, ordering, parameter values, and edge
connections. `GpuFlowScene` and the GPU layout store describe the frame being
rendered and any in-progress interaction previews. Drag, resize, scroll, and
retained-control interactions patch those runtime surfaces first, then commit
through the project owner paths.

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
- `edges`: scene edge records.
- `revision`: the project scene revision used by frame and interaction code.

The project scene is built in `projectGpuLayoutAdapter.ts` from project state,
active view layout, section records, measured sizes, project search, scroll
offsets, type errors, parameter edit policy, and retained interaction state. The
scene layout pass in `gpuFlow/sceneLayout.ts` resolves parent/child world
geometry, ordered child placement, clipping, nested scroll offsets, and layout
modes such as `none`, `vertical`, `horizontal`, and `kanban`.

`projectGpuFlowSceneFactory.ts` appends retained parameter content surfaces and
DOM islands to the layout scene. `syncProjectGpuLayoutStoreFromScene()` keeps
the GPU layout store aligned with the visible DOM-section nodes so shared
interaction controllers can operate on the same coordinates as the renderer.

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
- `projectGpuParamDragAdapter.ts` plans retained parameter structural moves.
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
  pages, HTML surface rendering, performance reporting, and follow-up frames.
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
- `retainedContentFrameGeneration.ts`,
  `GpuRetainedContentPageFrameSurfaces.ts`, and
  `retainedContentTexturePageManager.ts` generate retained page frame inputs,
  page-rasterize retained scenes, cache committed retained pages, and schedule
  retained texture upload work.
- `retainedContentScene.ts` and related retained-content modules build retained
  rows, draw commands, popups, scrollbar hit records, general hit records, port
  anchors, and control geometry.
- `GpuFlow/domIslandLayer.tsx` renders active DOM islands as viewport-positioned
  real DOM.
- `GpuFlow/flowOverlays.tsx` gathers edge label, selection, resize, and drag
  preview HTML overlay sources plus retained text-like snapshot source roots.
  Retained scrollbar, row-hover, and switch-animation native visuals are
  resolved in `GpuFlow/flowFrame.tsx`.
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

Core project-surface behavior is added through the owner modules above. New
surface behavior should use the scene, retained-content, interaction, portal,
and persistence paths that already own that class of work.

## DOM Sources, Portals, and DOM Islands

`GpuSurface` renders one canvas with `layoutsubtree=""`. `HtmlSurfaceSourceLayer`
uses hidden anchor spans as React insertion points, creates host `div` elements,
and inserts each host beside its anchor as a direct canvas child. The direct
canvas-child shape is required for the browser to paint and upload the source
through html-in-canvas.

Source hosts use stable base styles:

```text
position: absolute
left: 0
top: 0
transform-origin: 0 0
pointer-events: none
contain: layout paint style
```

During passive rendering, the source DOM is capture material for textures. DOM
transform synchronization keeps visible sources sized for html-in-canvas capture
and parks culled sources. During pointer or wheel handoff, the interaction
projector temporarily aligns the target source-local point under the browser
pointer and enables pointer events for that source. When the interaction ends,
the source returns to passive capture state.

The same source-layer mechanism mounts section DOM sources, HTML overlay
sources, and retained text-like snapshot sources. Section and overlay sources
are registered with `HtmlSurfaceTextureManager` and drawn as DOM textures.
Retained text-like snapshot sources are handed to
`RetainedContentTexturePageManager` and copied into retained page textures.

Portal roots are partitioned into three coordinate spaces:

- `source-local`: roots rendered inside `GpuSurface` as canvas children. These
  are for source-owned DOM that belongs to the layout subtree, such as
  CodeMirror tooltips.
- `viewport`: roots rendered as siblings of the canvas. These are for overlays
  positioned in viewport CSS pixels, including retained-native CodeMirror
  tooltips and validation UI.
- `flow-anchored`: a declared coordinate space for graph-positioned DOM.
  `GpuFlow` rejects non-empty flow-anchored portal groups unless the caller
  represents the UI as a renderer overlay or HTML surface descriptor.

All portal roots include the standard no-pan and no-drag classes so overlay
interactions do not leak into canvas gestures. Custom positioned overlays use
`autoUpdateGpuFloatingPosition()`. Primitive-owned overlays that opt into
canvas-aware placement use `subscribeToGpuViewportReposition()` so their
placement logic reruns after pan or zoom. Shared app-level portal roots such as
`setta-popover-portals` can live outside `GpuFlow`; they are not declared
through `GpuFlowPortalDescriptor`.

DOM islands are rendered by `GpuFlowDomIslandLayer`, which is a sibling of the
canvas inside the GPU flow container. Each island is positioned from its
flow-space `rect` with the current viewport transform and scaled by
`viewport.zoom`. Visible DOM islands have pointer events enabled and include the
no-pan/no-drag classes; hidden or clipped islands are parked with pointer events
disabled. They are not uploaded as textures; they are the active
browser-native surface for the control currently being edited.

## Frame Pipeline

`GpuProjectSurface` builds an effective `GpuFlowScene` and passes it to
`GpuFlow`. `GpuFlow` stores the active node-layer state, subscribes to viewport
changes, attaches interaction controllers, and asks `GpuSurface` for frames.

`GpuSurface` coalesces frame reasons such as `animation`, `init`, `manual`,
`paint`, `resize`, `texture-upload`, and `viewport`. A viewport-store transform
change requests a `viewport` frame. A canvas paint event resolves changed source
elements to owning textures and requests a `paint` frame. Exhausted upload
budgets request follow-up `texture-upload` frames, while active retained switch
transitions request follow-up `animation` frames.

Each render frame follows this shape:

1. `renderGpuFlowNodeLayerFrame()` resolves the canvas size, active scene,
   renderer, HTML texture manager, and retained texture page manager.
2. Retained content frame generation clips retained surfaces, resolves each
   surface texture window, derives text-like row snapshot sources, and builds
   retained page frame surfaces.
3. `RetainedContentTexturePageManager.resolveFrameViewportZoomBucket()` selects
   the stable zoom bucket. `prepareFrame()` computes desired page descriptors and
   emits flat visuals for already-committed retained pages plus refinement work
   for missing or stale pages.
4. `renderHtmlSurfaceFrame()` computes visible DOM and overlay quads from node
   layout, viewport, clips, forced visibility, and upload margin.
5. The frame syncs DOM transforms for visible, active, and retained sources,
   registers visible HTML textures, uploads dirty HTML textures within the
   project upload budget, and builds textured DOM and overlay visuals.
6. The visual scene combines DOM textures, overlay textures, retained page
   visuals, retained scrollbar, row-hover, switch-animation, grid, edges, and
   connection-line visuals. `HtmlSurfaceRenderer.render()` draws that scene with
   the current viewport camera.
7. HTML textures are evicted according to visibility, protected active ids, and
   memory budget.
8. Retained page post-submit maintenance either defers work for active viewport
   interactions with full committed coverage or calls
   `RetainedContentTexturePageManager.runPostSubmitMaintenance()` to enqueue
   missing retained pages, rasterize and upload retained page textures within
   its own budget, upload text-like row DOM snapshots into retained page textures
   when required, evict retained pages to budget, and report whether another
   frame is needed.
9. Frame performance reporting records render time, upload work, texture memory,
   retained page metrics, viewport state, and interaction diagnostics.

Pure pan and zoom frames update the camera and redraw cached surfaces. Passive
texture resolution upgrades and passive uploads are deferred during active
viewport interactions. Retained page maintenance is also deferred during those
interactions when committed page coverage already fills the visible surface; if
the frame has uncovered retained content, the page manager can still upload the
missing work. When the interaction burst ends, texture-upload frames catch up
deferred work.

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

Once the scene is resolved, `getGpuFlowSceneDomSectionNodes()` selects visible
`dom-section` nodes. `renderProjectGpuNode()` renders each selected source as:

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
- `retainedContentFrameGeneration.ts` derives source surfaces, text-like
  snapshot sources, and retained page frame surfaces.
- `GpuRetainedContentPageFrameSurfaces.ts` assigns content versions to the base
  surface and row-level content segments so page freshness can be checked
  without rerasterizing unrelated rows.
- `RetainedContentTexturePageManager` creates desired page descriptors, reuses
  committed pages, schedules first-visible and refinement work, rasterizes pages
  through `retainedContentPageRasterizer.ts`, uploads page textures, and evicts
  retained pages to budget.
- Text-like controls that are not actively native are rendered into
  source-local snapshot DOM by `GpuFlow/retainedTextLikeRowSnapshotSources.tsx`.
  The retained page manager requires current snapshot source elements, copies
  them into retained page textures during page upload, and requests another
  paint if Chromium has not produced the needed element paint record yet.

Retained scrollbars, row-hover state, and switch transitions are GPU-native
rounded-rect visuals layered with the retained pages. Static page textures cache
the non-animated row state.

## Pan and Zoom

Pan and zoom are viewport transforms, not DOM layout changes. The viewport store
tracks:

```text
[viewport.x, viewport.y, viewport.zoom]
```

Flow coordinates convert to screen coordinates with:

```text
screenX = viewport.x + flowX * viewport.zoom
screenY = viewport.y + flowY * viewport.zoom
```

Screen coordinates convert back to flow coordinates with:

```text
flowX = (screenX - viewport.x) / viewport.zoom
flowY = (screenY - viewport.y) / viewport.zoom
```

The pan/zoom controller attaches to the GPU flow container and receives project
settings from `getProjectPanZoomOptions()`:

- pointer-drag panning when pan-on-drag is enabled and selection gestures are
  inactive;
- wheel panning when pan-on-scroll is enabled;
- wheel zooming, pinch/ctrl-wheel zooming, and double-click zooming when the
  corresponding settings allow them;
- activation-key guards for pan and zoom modes;
- pointer-pan start cleanup such as closing open context menus.

Zooming at a point preserves the flow coordinate under the pointer. The
controller computes the pointer's flow-space coordinate, clamps the next zoom to
the viewport bounds, then adjusts `viewport.x` and `viewport.y` so the same flow
point remains under the same screen point.

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
`previewProjectNestedNodeDrag()` resolves a child move plan with
`resolveGpuSectionSceneChildMultiMovePlan()`. The preview can reparent or
reorder the dragged section group, patch the scene layout store, draw drag
bounds, draw a drop marker, and auto-scroll the nested viewport. On stop, the
project adapter commits the structural move through `moveSectionsWithBackend()`
with `sectionIds`, `newParentId`, `newIndex`, and `positionsById: null`.

Nested drag target resolution is scene-aware. The drop parent is selected from
ordered child drop rects under the dragged center point, preferring deeper and
higher-priority candidates. The move planner rejects invalid targets such as
same parent/index no-ops, descendant-parent moves, and targets that cannot
accept ordered children.

Selection and selection drag use GPU selection controllers. Selection changes
flow through `handleProjectSelectionChange()`, and keyboard nudge/selection
drag persistence flows through `projectGpuSelectionAdapter.ts`.

## Parameter Interactions and Inputs

Retained parameter interaction uses retained-content hit records. The runtime
controller hit tests retained scenes, preserves active native DOM island
targets, tracks click-versus-drag thresholds, emits drag start/move/frame/end
callbacks, updates hover and scrollbar visuals, and reports pointer activity in
flow-local retained-content coordinates.

Parameter drag can start when structure editing is allowed, parameter selection
mode is active, and the pointer starts on a row or label hit. The drag session
records the source section, retained surface, active parameter, selected move
set, parent map, visible children by parent, source parent, and list key. A
filtered parameter list blocks structural moves because visible order does not
represent the full canonical order. Edge-input parameters are not movable.

Drop targets are resolved inside the same retained surface. A drop can land
before or after a row based on pointer position relative to the row midpoint, or
inside an empty nested parent control. The planner rejects drops onto the moved
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
focuses it, and can replay the original pointer activation.

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

Dirty tracking separates transform-only frames from content changes:

- html-in-canvas paint events mark changed DOM source elements dirty;
- explicit dirty events mark source textures dirty for input, focus, selection,
  animation, transition, and interaction updates;
- source-rect invalidations map dirty content to owning texture tiles;
- retained-content scroll, hover, scrollbar, switch animation, and row content
  changes mark retained pages or native visuals dirty.

HTML texture upload priorities are `interactive`, `visible`, and `prefetch`.
Content dirtiness outranks resolution-only dirtiness. Active sources and active
overlay surfaces are protected from eviction. Retained page uploads have their
own raster/upload/memory budget and can schedule follow-up frames independently
from HTML source texture uploads.

Pure pan and zoom should remain transform-only. A change that makes panning or
zooming request HTML paints, rerender section trees, or upload every texture is
a performance regression.

## Verification Surface

The architecture is protected by model-level and browser-level tests:

- property and model tests under `frontend/src/gpuFlow/` cover finite viewport
  coordinate conversion, zoom-at-point invariants, fit-view bounds, retained
  visible row ranges, retained hit clipping and precedence, retained texture
  page coverage, and retained scene behavior;
- focused unit tests cover scene layout, resize previews, section drag planning,
  retained parameter insertion/drop planning, portal partitioning, Floating UI
  virtual references, retained row diagnostics, retained controls, retained
  page rasterization, texture work queues, and retained texture page budgeting;
- browser tests under `frontend/tests/e2e/gpu-flow/` and
  `frontend/tests/e2e/settings/` exercise canvas popup and context-menu
  placement, retained native islands, scoped axe checks, retained scroll,
  retained popups, retained drag/drop, retained CodeMirror activation, visual
  regressions, and pan/zoom/scroll performance probes.

When changing runtime behavior, add coverage at the owner layer. User-visible
GPU surface changes need production-path tests and browser verification with
real pointer, wheel, keyboard, focus, and text input events.

## Extension Rules

When extending this surface, use the existing owner path:

- Add section body behavior through `SectionContainer` and the section owner
  code. Let the GPU scene describe geometry, clipping, and interaction policy.
- Add section layout, resize, drag, or nested reorder behavior through the scene
  and project GPU adapters, then persist through the project backend route that
  owns canonical state.
- Add parameter controls by extending the owner-defined parameter adapter,
  retained draw commands, hit records, control descriptors, and project commit
  adapter. Use a native DOM island only when browser-native input behavior is
  required.
- Keep generated or backend-owned contracts authoritative when a change touches
  cross-language project data.
- Use known portal roots plus the shared Floating UI wrapper for canvas-aware
  custom overlays.
- Preserve direct canvas child source hosts for texture-upload sources.
- Preserve transform-only pan/zoom behavior and defer passive texture work while
  viewport interaction is active.
