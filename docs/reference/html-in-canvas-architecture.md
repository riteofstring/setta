# HTML-in-Canvas Architecture

This document describes the project-level HTML-in-canvas architecture used by
the Setta project surface. It complements
`docs/reference/webgpu-pan-zoom-html-in-canvas.md`, which focuses on the lower
level WebGPU HTML surface renderer. This page connects that renderer to project
sections, retained parameter content, drag and drop, resizing, and parameter
input behavior.

The main entrypoint is
`frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`.
The reusable canvas runtime lives under `frontend/src/gpuFlow/`.

## High-Level Model

The project surface is a WebGPU canvas backed by several source surfaces:

- DOM section sources: real React section DOM rendered into hidden source hosts
  under the `<canvas layoutsubtree>` element, then uploaded as HTML textures and
  composed by WebGPU.
- Retained parameter content sources: lightweight 2D canvas sources drawn from a
  retained parameter scene, then uploaded and composed with the same WebGPU
  surface pipeline.
- DOM islands: temporary real DOM overlays for native controls that should not
  be emulated on canvas, such as text inputs, textareas, dropzones, password
  fields, date/time inputs, and parameter name editing.

The source DOM remains authoritative for browser-native behavior where we need
it. The visible project surface is normally the WebGPU canvas. Interaction code
projects pointer, wheel, focus, and keyboard activity back into the relevant
source surface or retained scene instead of making each section a visible DOM
node in the main layout.

The project has two important geometry layers:

- Project state and view layout describe the canonical persisted section
  structure, dimensions, positions, and ordering.
- The GPU flow scene and layout store describe the currently rendered frame and
  in-progress interaction previews. They can be patched during drag, resize, or
  scroll before the backend commit finishes.

## Module Map

The project integration is centered on these modules:

- `projectGpuSurface.tsx` wires project state, settings, selection, edge scenes,
  pan/zoom, section drag, section resize, retained parameter interactions, and
  keyboard handling into `GpuFlow`.
- `projectGpuLayoutAdapter.ts` builds a `GpuFlowScene` from project view layout,
  nested section structure, section sizes, scroll offsets, and parameter content
  surfaces.
- `projectGpuNodeRenderer.tsx` renders section scene nodes with
  `SectionContainer`.
- `projectGpuParamContentAdapter.ts` creates retained parameter content surfaces
  and native DOM islands for active parameter controls.
- `projectGpuRetainedParamInteractionAdapter.tsx` handles retained parameter
  click, drag, popup, and native-island activation behavior.
- `projectNodeResize.ts` adapts generic GPU node resizing to Setta section size
  persistence and scene previews.
- `projectGpuSelectionAdapter.ts` adapts generic node dragging and selection to
  top-level movement and nested section reorder/reparent behavior.

The reusable canvas runtime is centered on these modules:

- `GpuFlow/flowSurface.tsx` owns the runtime composition, frame scheduling,
  controller attachment, source layers, overlays, and renderer callbacks.
- `GpuSurface.tsx` creates the `<canvas layoutsubtree>` element, initializes the
  WebGPU runtime, listens to paint and resize events, and coalesces frame
  requests.
- `htmlSurfaces/sourceLayer.tsx` creates the direct child source hosts used for
  HTML texture uploads.
- `htmlSurfaces/frame.tsx` resolves visible surfaces, syncs DOM transforms,
  registers and uploads dirty textures, builds the visual scene, renders, and
  evicts unused texture records.
- `interactions/panZoom.ts`, `interactions/nodeDrag.ts`,
  `interactions/nodeResize.ts`, and `interactions/retainedContentInteraction.ts`
  implement the main pointer and wheel interaction controllers.

## Frame Pipeline

`GpuProjectSurface` builds an effective `GpuFlowScene` from the active project
view. `GpuFlow` renders one `GpuSurface` canvas and mounts source content into
source layers associated with that canvas.

For section DOM content, `HtmlSurfaceSourceLayer` creates hidden source hosts as
direct children of the canvas. React portals render the actual section content
into those hosts. The direct-child shape matters because the browser's
`layoutsubtree` paint and `drawElementImage` path can only upload content that
is part of the canvas' layout subtree.

For each frame, `renderHtmlSurfaceFrame()` does the following:

1. Computes visible section and overlay quads from the scene, viewport, clip
   rects, active interactions, and upload budget.
2. Syncs source DOM transforms for visible or interactive sources.
3. Registers texture records for visible HTML and retained canvas sources.
4. Uploads dirty textures with priority for active or interactive surfaces.
5. Builds the WebGPU visual scene, including flat and tiled surfaces plus edge,
   grid, overlay, and retained-content visuals.
6. Renders the scene with cached textures.
7. Evicts unused texture records when memory limits require it.

Retained parameter surfaces are included as overlay-like content surfaces. They
are drawn to ordinary 2D canvases first, then uploaded to WebGPU textures. This
keeps parameter rows cheap to update and hit test without rendering each row as
visible DOM.

## Pan and Zoom

Pan and zoom are viewport transforms, not DOM layout changes. The viewport store
tracks the tuple:

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

The pan/zoom controller attaches to the GPU surface and supports the project
settings exposed by `getProjectPanZoomOptions()`:

- Pointer-drag panning when pan-on-drag is enabled and selection gestures are
  not active.
- Wheel panning when pan-on-scroll is enabled.
- Wheel zooming, pinch/ctrl-wheel zooming, and double-click zooming when the
  corresponding settings allow them.
- Activation key guards for pan and zoom modes.
- Pointer-pan start cleanup, such as closing open context menus.

Zooming at a point preserves the flow coordinate under the pointer. The
controller computes the pointer's flow-space coordinate before the zoom, clamps
the new zoom to the viewport's min/max range, then adjusts `viewport.x` and
`viewport.y` so the same flow point remains under the same screen point.

Pure pan and zoom frames are designed to be cheap. They update camera uniforms
and redraw already-uploaded textures. They do not request HTML paints, force
React renders, or upload every source again. While a viewport interaction is
active, passive texture resolution work is deferred. At the end of a wheel,
pinch, or pointer-pan burst, the surface requests a texture-upload frame so any
deferred resolution or dirty source work can catch up.

The source DOM still needs correct projected interaction. Source transforms and
hit projection map browser events back into source-local coordinates, while
native interactive targets can be temporarily projected or represented by DOM
islands when the user needs real browser input behavior.

## Section Content Rendering

Section scene construction starts in `projectGpuLayoutAdapter.ts`. The adapter
reads the active view layout, project section records, measured section sizes,
scroll offsets, and nested child order. It creates `GpuSectionSceneNode` records
for top-level sections and recursively appends child section nodes.

Each section scene node includes:

- `worldRect`, the resolved flow-space position and size.
- `bodyRect`, the content body area inside the section chrome.
- `childViewportRect`, the area where child sections are laid out.
- `clipRect`, used for nested scroll and visibility clipping.
- `layoutMode`, such as free, vertical, horizontal, or kanban-style ordered
  child layout.
- `scrollOffset`, when nested content is scrollable.
- `resizePolicy`, used by the resize controller.
- `portAnchors`, used by the edge scene.

The scene layout pass in `sceneLayout.ts` resolves parent/child geometry,
ordered child placement, nested clipping, and scroll offsets. Once the scene is
resolved, `getGpuFlowSceneDomSectionNodes()` selects the section nodes whose
renderer is `dom-section` and whose rects intersect their clips. Those nodes
become HTML source surfaces.

`renderProjectGpuNode()` renders each DOM section source as:

```tsx
<SectionContainer sectionId={node.nodeId} isTopLevel={...} />
```

`SectionContainer` applies project visibility rules and forwards to
`SectionContainerCore`. The core section renderer owns the section shell,
header, toolbar/chrome, edge handles, highlighting, active state, externalized
state, minimized state, and the body component selected by `AreaSwitch`.

Under the GPU project surface, `SectionContainer` passes `renderParamRows={false}`
for parameter-owning section bodies. This is intentional. The section DOM still
renders the section chrome and body-specific UI, but parameter rows are rendered
by retained parameter content surfaces. That split keeps large parameter lists
cheap to draw, scroll, select, and drag while preserving native DOM only for the
inputs that need it.

## Retained Parameter Content Rendering

Parameter rendering starts in `projectGpuParamContentAdapter.ts`. For each
section with visible parameters, the adapter creates one or more retained
content surfaces. Pinned and unpinned parameter lists are separate surfaces so
their scroll, clipping, and z-order behavior can match the section body layout.

The adapter computes:

- Row metrics, including row height, nested gutter, label/control gap, top
  inset, right inset, and control width.
- Filtered rows from search and visibility state.
- Tree-view nesting from parent/child parameter relationships.
- Selected, hovered, focused, active, dragged, error, and edge-input state.
- Local viewport and clip rects for the parameter list inside the section body.
- Clamped retained-content scroll offsets.

The row adapter converts each parameter to a retained row descriptor and control
descriptor. `createGpuRetainedRowContentScene()` then builds a retained scene
with draw commands and hit records. Only the visible row range, plus overscan,
needs to be drawn and hit tested.

`GpuRetainedContentSurfaces` draws retained scenes to 2D canvas source elements.
Those canvases are registered as content surfaces and uploaded to WebGPU like
HTML source surfaces. The retained scene also produces hit records for rows,
labels, controls, ports, popups, scrollbars, drop markers, and drag previews.

## Section Resizing

Section resizing is owned by the GPU interaction layer, not by DOM resize
handles inside the section chrome. `SectionResizeFrame` marks the section as
GPU-owned for resize behavior, and the actual handles are represented by the
GPU resize overlay.

The resize flow is:

1. `projectNodeResize.ts` derives a resize policy from the section scene node,
   section type, min/max dimensions, current project mode, snap settings, and
   interaction guards.
2. `GpuFlow` attaches `attachGpuFlowNodeResizeController()`, which delegates to
   the generic `attachGpuNodeResizeController()`.
3. Pointer down hit testing resolves resize handle targets from flow-space hit
   rects. The active hit rect can be right, bottom, or bottom-right, depending
   on the node policy.
4. Pointer movement is converted from screen delta to flow delta by dividing by
   `viewport.zoom`.
5. The controller applies direction, min/max bounds, optional aspect ratio, and
   optional snap grid rules.
6. During resize, the GPU layout store is patched so the canvas can show the
   new size immediately.
7. The project adapter resolves a preview scene with
   `resolveProjectGpuResizePreviewScene()` so nested layout, clips, ports, and
   retained parameter surfaces stay consistent during the drag.
8. On commit, `updateNodeDimensionsFromGpuResize()` and
   `persistSectionSizeChange()` persist the new size through the normal project
   paths.
9. On cancel, the adapter restores the baseline scene and layout store state.

The resize overlay is itself a canvas source layer. It draws the visible resize
affordances and uploads them like the other overlay surfaces. The pointer hit
rects are intentionally larger than the drawn affordances so resize is usable
without increasing visual noise.

## Section Drag and Drop

Section drag uses the generic GPU node drag controller with a project adapter.
The controller handles pointer capture, drag thresholding, selected-node drag,
flow-space coordinate conversion, optional snap, auto-pan near viewport edges,
layout-store previews, and final commit or cancel.

There are two section movement modes.

Top-level sections are free-positioned. During drag, their layout records are
patched in the GPU layout store. On stop, the adapter persists the new positions
with `updateNodePositions()` and updates z-order with `setZIndices()` when
needed.

Nested sections are ordered children of a parent section. They are not committed
as raw x/y positions. During drag, `previewProjectNestedNodeDrag()` resolves a
child move plan with `resolveGpuSectionSceneChildMultiMovePlan()`. The preview
can reparent or reorder the dragged section group, patch the scene layout store,
draw drag bounds, draw a drop marker, and auto-scroll the nested viewport. On
stop, the project adapter commits the structural move through
`moveSectionsWithBackend()` with `sectionIds`, `newParentId`, `newIndex`, and
`positionsById: null`.

Nested drag target resolution is scene-aware. The drop parent is selected from
ordered child drop rects under the dragged center point, preferring deeper and
higher-priority candidates. The move planner rejects invalid targets such as
the same parent/index no-op, descendant-parent moves, and targets that cannot
accept ordered children.

Drag is disabled by project mode and interaction guards such as pan activation,
follow mode, locked sections, and incompatible selection state.

## Parameter Drag and Drop

Parameter drag and drop in the HTML-in-canvas surface uses retained-content
interaction. The relevant entrypoint is
`projectGpuRetainedParamInteractionAdapter.tsx`, with move planning in
`projectGpuParamDragAdapter.ts`.

The retained interaction controller hit tests the retained parameter scene. It
preserves native DOM island targets, tracks click-versus-drag thresholds, emits
drag start/move/frame/end/cancel callbacks, and keeps pointer activity in
flow-local retained-content coordinates.

A parameter drag can start when the project is in parameter selection mode, the
user can edit structure, and the pointer starts on a row or label hit. Ranged
controls use the same controller but branch into slider/rotary drag behavior
instead of structural parameter movement.

The parameter drag session records:

- The source section and retained surface key, such as pinned or unpinned.
- The active parameter and current selected parameter set.
- Parent relationships and visible children by parent.
- Whether the active parameter is an edge input or otherwise not movable.
- Whether a parameter filter is active, which blocks structural moves because
  visible row order no longer represents the full canonical order.

Multi-select moves are constrained to a coherent structure. If the active row is
not selected, the drag selects and moves only that row. If multiple selected
rows cannot be moved together because they span incompatible parents, the
adapter falls back to the active row and reports the issue through the project
notification path.

Drop targets are resolved inside the same section and retained surface. A drop
can land before or after a row based on the pointer position relative to the row
midpoint. It can also target an empty nested parent control when the pointer is
over a valid empty parent area. The planner rejects drops onto the dragged row,
drops into descendants of the moved set, and no-op drops.

When hidden rows exist, the adapter resolves the full insertion index from the
visible insertion point so hidden children keep their relative canonical order.
During drag, the retained scene draws a drop marker and drag preview. During
drag frames, retained-content auto-scroll can update the source surface scroll
offset and recompute the preview. On drop, the adapter commits through
`moveParamsWithBackend()`.

## Parameter Inputs

Parameter inputs are split by control behavior. The row adapter maps each
parameter to a `GpuRetainedContentControlDescriptor` with a commit policy:

- `immediate`: clicks, keyboard actions, or popup selections can commit directly
  from the retained canvas interaction path.
- `preview-commit`: drag or keyboard changes update the UI optimistically during
  interaction and commit once the interaction ends.
- `native-island`: the control needs real browser DOM input behavior, so a DOM
  island is mounted above the canvas.

Immediate controls include controls such as switches, buttons, dropdown option
selection, and some color/date sub-controls. The retained scene exposes hit
records for the relevant subparts. Project-specific adapters translate those
hits into Setta parameter value changes.

Preview-commit controls include ranged controls such as sliders and rotaries.
Pointer drag, keyboard, and wheel updates can preview values with backend
updates skipped during the active drag. The final pointer-up or cancel path
commits or restores through the same parameter value update helper.

Native-island controls are used for text-like editing, code/textarea editing,
password entry, dropzone interactions, date/time input fields, and parameter
name editing. `projectGpuParamDomIslandGeometry.ts` computes the island's
flow-space geometry and clips it to the retained content surface. The DOM island
layer positions the island in screen space with the current viewport transform
and scale. The native island renderer mounts the normal `ParamInput` or
`ParamNameInput`, marks it as retained native content, focuses it, and can replay
the original pointer activation so the browser interaction feels direct.

`ParamInput` owns the same input semantics used outside the GPU surface:

- Local pending value while editing.
- Preview state for optimistic or realtime-dependent values.
- Debounced backend updates for standard entered values.
- Realtime literal emits when the parameter configuration requires them.
- Specialized behavior for password reveal, dropzone file state, date/time
  values, and disabled/error states.

All standard value commits flow through `commitParamInputValueChange()`, which
routes to the OpenAPI project update path and applies the appropriate optimistic
project-state update. The HTML-in-canvas layer decides how the user interacts
with the control; it does not create a parallel value model.

## Hit Testing and Dirty Tracking

Section hits use the GPU layout and HTML surface hit scene. Retained parameter
hits use retained scene hit records. Native DOM island targets are preserved so
browser focus, text selection, file/dropzone behavior, and form input events can
work normally.

Dirty tracking separates transform-only frames from content changes. Paint
events from the `layoutsubtree` canvas, retained canvas draws, custom dirty
events, input/change/focus activity, selection changes, animations, transitions,
and interactive pointer activity can mark a source texture dirty. A later frame
uploads only the dirty surfaces that are visible, forced active, or otherwise
high priority.

Pure pan and zoom should remain transform-only. If a change makes panning or
zooming request HTML paints, re-render React section trees, or upload every
texture, it is a regression in the HTML-in-canvas architecture.

## Extension Rules

When extending this surface, prefer the existing owner path:

- Add section body behavior through `SectionContainer` and the section owner
  code. Let the GPU scene describe geometry, clipping, and interaction policy.
- Add section layout, resize, or drag behavior through the scene and project GPU
  adapters, then persist through the project backend route that owns the
  canonical state.
- Add parameter controls by extending the owner-defined parameter adapter,
  retained draw commands, hit records, and project commit adapter. Use a native
  DOM island only when browser-native input behavior is required.
- Keep generated or backend-owned contracts authoritative when a change touches
  cross-language project data.
- Do not add a second parameter row DOM rendering path for the GPU surface.
- Keep retained parameter drag/drop in the retained-content interaction path.
  DOM-only drag surfaces can continue to use their existing dnd-kit owners.
- Preserve direct canvas child source hosts and avoid wrapping source content in
  extra DOM that breaks `layoutsubtree` upload eligibility.
- Preserve transform-only pan/zoom behavior and defer passive texture work while
  viewport interaction is active.
