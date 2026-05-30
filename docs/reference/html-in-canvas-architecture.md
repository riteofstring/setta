# HTML-in-Canvas Architecture

This document describes the Setta project canvas as it exists today. It focuses
on the application-level architecture: how top-level sections become HTML
textures in a WebGPU canvas, how pan and zoom stay cheap, how section content is
rendered and resized, and how section and parameter drag-and-drop interacts with
the canvas.

For lower-level WebGPU renderer details, see
`docs/reference/webgpu-pan-zoom-html-in-canvas.md`. For the dnd-kit wrapper
itself, see `docs/reference/dnd-kit.md`.

## Core Model

The project canvas is not a pure canvas application. Section content remains
real React DOM, but the visible project surface is drawn by WebGPU from cached
HTML textures.

The main layers are:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  wires the renderer to project state, settings, section movement, resizing,
  selection, edge interaction, and pane events.
- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx` owns the reusable GPU flow
  runtime: source DOM mounting, frame scheduling, interaction controllers, edge
  labels, portals, and texture/renderer resources.
- `frontend/src/gpuFlow/GpuSurface.tsx` owns the `<canvas layoutsubtree>` and
  WebGPU/html-in-canvas lifecycle.
- `frontend/src/gpuFlow/htmlSurfaces/` owns source DOM hosts, DOM-to-texture
  uploads, texture dirtiness, visibility, hit testing, and WebGPU scene
  rendering.
- `frontend/src/components/Section/Container/` owns the section shell and
  content renderers mounted inside each source host.
- `frontend/src/forks/dnd-kit/` owns structural drag-and-drop for sections and
  params.
- `frontend/src/components/Params/` owns param rows, param DnD wiring, and
  param value/name inputs.

The important distinction is:

- Source DOM is authoritative for content, browser focus, native controls,
  text selection, CodeMirror, xterm, iframe surfaces, and accessibility.
- WebGPU is authoritative for visible composition, canvas viewport transforms,
  grid, edges, z order, and cached surface presentation.

The source DOM and the visible WebGPU scene intentionally share one coordinate
contract. Flow coordinates describe project space. Screen coordinates describe
CSS pixels inside the canvas container. The viewport tuple is `[x, y, zoom]`:

```ts
screenX = viewport.x + flowX * viewport.zoom;
screenY = viewport.y + flowY * viewport.zoom;
flowX = (screenX - viewport.x) / viewport.zoom;
flowY = (screenY - viewport.y) / viewport.zoom;
```

## DOM Shape

`GpuSurface` renders a canvas with `layoutsubtree=""`. `HtmlSurfaceSourceLayer`
then creates a direct-child source host for each source/layout node. React
renders into those hosts through portals.

The simplified runtime shape is:

```tsx
<div className="setta-gpu-flow">
  <canvas className="setta-gpu-flow__canvas" layoutsubtree="">
    <span data-gpu-flow-html-source-anchor="true" />
    <div
      className="setta-gpu-flow__html-source setta-gpu-flow__node"
      data-gpu-flow-html-source="true"
      data-gpu-flow-source-id={sectionId}
      data-gpu-flow-node="true"
      data-id={sectionId}
    >
      <SectionContainer sectionId={sectionId} isTopLevel={true} />
    </div>
    <div id="setta-codemirror-tooltips" />
    <div id="setta-popover-portals" />
    <div data-gpu-flow-edge-label-source="true">...</div>
  </canvas>
  <div className="setta-gpu-flow__selection-layer" />
</div>
```

The source host must be a direct canvas child because Chromium's
html-in-canvas APIs capture direct child elements. The hidden anchor is only a
React insertion point. The real source host is inserted beside the anchor by
`HtmlSurfaceSourceLayer`.

Passive source hosts are positioned at `left: 0`, `top: 0`, with a stable
`translate(0px, 0px) scale(1)` transform and `pointer-events: none`. They are
still real DOM and can be painted into textures, but they do not normally
receive browser events directly.

## Render Lifecycle

The top-level render flow is:

1. Project state owns section positions and measured dimensions in the existing
   node internals store.
2. `useProjectGpuLayoutAdapter()` mirrors node internals into
   `gpuFlowLayoutStore` as `GpuFlowLayoutNode` records.
3. `GpuProjectSurface` passes those layouts to `GpuFlow`.
4. `GpuFlow` renders one `HtmlSurfaceNodeLayer` source host per layout and uses
   `renderProjectGpuNode()` to render `SectionContainer` into each host.
5. `GpuSurface` initializes WebGPU and the html-in-canvas canvas, attaches a
   resize observer, handles `paint` events, and schedules frames.
6. Each frame calls `renderHtmlSurfaceFrame()`.
7. The frame collects visible node quads from the viewport, syncs source host
   sizes and passive/interacting DOM state, registers visible textures, uploads
   dirty texture work within budget, builds a visual scene, renders WebGPU, and
   evicts unprotected textures when necessary.

`renderHtmlSurfaceFrame()` returns diagnostics such as visible nodes, drawn
nodes, missing textures, uploaded nodes, remaining dirty nodes, evicted bytes,
and the current `HtmlSurfaceVisualScene`. `GpuFlow` stores that visual scene so
later pointer and resize hit testing can target the same geometry that was
actually drawn.

Top-level section source DOM remains mounted even when a node is outside the
visible viewport. Culling affects texture registration, drawing, and
interaction eligibility. It does not unmount the React section tree.

## Pan And Zoom

Pan/zoom state lives in `frontend/src/gpuFlow/viewportStore.ts`. The store holds:

- `transform`: the `[x, y, zoom]` tuple.
- `width`, `height`, `minZoom`, `maxZoom`, and `defaultZoom`.
- input key state such as pan, zoom, selection, and move activation keys.
- interaction flags such as `pointerPanning`, `wheelZooming`, `panScrolling`,
  `nodeDragging`, `nodeResizing`, and `viewportInteractionActive`.
- connection, selection rectangle, and selected-node bounds state.
- the current GPU flow DOM node for screen-relative coordinate conversion.

`frontend/src/gpuFlow/viewportActions.ts` exposes the app-facing API:
`setViewport`, `panBy`, `zoomAtScreenPoint`, `zoomBy`, `zoomTo`, `setCenter`,
`fitView`, `screenToFlowPosition`, `flowToScreenPosition`, `getViewport`,
`getZoom`, `resetZoom`, and `updateMapPosition`.

`GpuProjectSurface` mirrors GUI settings into the viewport store:

- min/max/default zoom.
- pan-on-drag, pan-on-scroll, scroll mode, and scroll speed.
- zoom-on-scroll, zoom-on-pinch, and zoom-on-double-click.
- selection mode and snap grid.

The pan/zoom controller is
`frontend/src/gpuFlow/interactions/panZoom.ts`.

### Pointer Pan

Pointer panning starts only when the configured pan gesture is allowed. The
controller rejects:

- disabled pan-on-drag.
- ctrl/meta modified pointer events.
- selection mode gestures.
- targets inside `NO_PAN_CLASS_NAME`.
- primary-button node events unless the pan activation key is pressed.

On pointer down, it sets `paneDragging` and `pointerPanning`, captures the
pointer, and tracks client deltas. Each move adds the screen delta directly to
viewport `x` and `y` via `panGpuViewport()`. If the transform changes, the
controller requests a `viewport` frame.

Pointer pan never asks React to rerender section contents and never asks the
browser to repaint source DOM. The frame just redraws the WebGPU scene with the
new camera.

### Wheel Pan And Wheel Zoom

Wheel events are handled only when scrolling is prevented by canvas settings and
the target should not preserve native scrolling. The controller preserves native
wheel behavior for `NO_WHEEL_CLASS_NAME` and, when appropriate,
`NO_PAN_CLASS_NAME`.

Wheel zoom chooses a point relative to the GPU flow element and calls
`zoomGpuViewportAt()`. The math keeps that screen point stable while changing
zoom. macOS ctrl-wheel pinch uses the pinch path. Regular wheel zoom uses a
delta-mode scale factor.

Wheel pan uses normalized `deltaX`/`deltaY`, applies the configured scroll mode
(`free`, `horizontal`, or `vertical`), and applies `panOnScrollSpeed`.

Wheel zoom bursts set `wheelZooming` for 180 ms after the last wheel event.
Wheel pan bursts set `panScrolling` for 150 ms. When the burst ends, the
controller requests a `texture-upload` frame so deferred passive uploads and
resolution upgrades can resume.

### Viewport Frames

`GpuFlow` subscribes to the viewport store. When `transform` changes:

1. `nodeLayerRef.current.viewport` is updated.
2. `GpuSurface.requestFrame("viewport")` is called.
3. `renderGpuFlowNodeLayerFrame()` calls `renderHtmlSurfaceFrame()`.
4. `HtmlSurfaceRenderer.render()` redraws the grid, edges, and HTML surfaces
   using the new camera uniform.

During viewport frames, `deferResolutionUpdates` is true. Passive texture
resolution upgrades and passive uploads are deferred while panning or zooming is
active. Active/interactive surfaces can still upload first.

The invariant is that pure pan/zoom must be transform-only from the DOM
perspective. It must not call `requestPaint()`, force React renders, rewrite
every source DOM transform, or upload unchanged textures.

### Transitions

Viewport actions support short explicit transitions for operations such as reset
zoom and map-position updates. A transition sets `viewportAnimating` and drives
frame-by-frame interpolation. Direct user interactions such as node dragging,
node resizing, pane dragging, wheel zooming, pan scrolling, or marquee
selection cancel active transitions.

`GpuProjectSurface` also cancels viewport transitions when section DnD sorting
or moving-free mode starts.

## Section Contents

Top-level sections are rendered by:

```tsx
function renderProjectGpuNode(node: GpuNodeLayout) {
  return <SectionContainer sectionId={node.nodeId} isTopLevel={true} />;
}
```

The section rendering stack is:

- `SectionContainer` resolves view-mode visibility, effective section impl,
  section type, code/terminal grouping, codegen visibility, and active state.
- `ContainerSwitch` chooses the top-level wrapper or nested-section wrapper.
- `TopLevelContainer` registers top-level sections with dnd-kit.
- `DndSlotAndDndWatcher` applies structural DnD highlighting and drag
  listeners.
- `SectionContainerCore` renders the section shell, style theme, active
  outline, scope highlights, data/agentic/chat/workflow edge handles, and click
  activation.
- `SectionContainerCoreResizable` renders chrome plus the section body.
- `AreaSwitch` selects the section body renderer from `SECTION_AREA_RENDERERS`.

`SECTION_AREA_RENDERERS` maps section types to their content components:
Callable, Dict, Image, Chart, Draw, Social, TextBlock, Prompt, MetaControl,
GlobalVariables, Code, generated Python code/metadata, Terminal, IFrame, Chat,
Browser, Plugin, TaskBoard, Spreadsheet, and state-machine nodes.

Nested sections are normal DOM inside their parent section's source DOM:

- `MaybeManyNestedSections` and `ManyNestedSections` render child lists.
- `DNDSortable` wraps nested child lists for structural sorting.
- `SortableSectionContainer` renders each nested child through
  `SectionContainer` with `isTopLevel={false}`.

Groups are section containers whose primary content is their nested section
list. Code sections may render an attached terminal as a joined code-terminal
group.

Chat sections can be externalized into project chat windows. When a non-chat
section has an externalized chat-window binding, `CanvasSectionBody` renders a
`SectionWindowPlaceholder` in the section body instead of the original body.

## Texture Dirtiness And DOM Interaction

`GpuSurface` listens for html-in-canvas `paint` events. When the browser reports
changed elements, `markHtmlSurfaceFramePaintDirty()` resolves the owning surface
or tile and marks that texture dirty.

`createGpuNodeInteractionDirtyController()` also listens for user interaction
that implies a source texture is stale, including:

- custom GPU-flow dirty events.
- `beforeinput`, `input`, and `change`.
- `scroll`.
- `focusin` and `focusout`.
- pointer interaction with interactive targets.
- document selection changes.
- CSS transition and animation lifecycle events.

Interactive targets include native form controls, contenteditable elements,
ARIA control roles, CodeMirror content, xterm surfaces, Setta comboboxes,
`data-gpu-flow-control`, and `data-gpu-flow-interactive="true"`.

When a pointer or wheel event needs native DOM behavior, the system does not
make every source node visible and interactive. Instead it projects the single
target source under the browser pointer:

1. `resolveTopmostGpuNodeHitAtClientPoint()` maps the client point through the
   current visual scene.
2. `activeNodeTargeting.ts` finds the interactive or wheel target at the
   resulting source-local coordinate.
3. `HtmlSurfaceInteractionProjector.alignSourceToClientPoint()` sets the source
   host transform to `translate(surfaceX - localX, surfaceY - localY)` and
   turns `pointer-events` on.
4. The browser dispatches native events to the real DOM target.
5. When the interaction ends, the projector restores passive transform and
   `pointer-events: none`.

This is why section controls, CodeMirror editors, dropdowns, sliders, resize
handles, and param rows can behave as real DOM while the user sees the WebGPU
canvas.

## Section Resizing

Top-level section resizing is GPU-flow owned. Nested section resizing still uses
the existing DOM `CustomResizable` path because nested sections live inside a
parent section DOM layout.

The top-level resize pieces are:

- `SectionResizeFrame` renders passive resize handles into the section DOM.
  Handles carry `data-resize-section-id` and `data-resize-direction`.
- `GpuFlow` attaches `attachGpuNodeResizeController()`.
- `resolveGpuFlowNodeResizeTarget()` maps the pointer event through the
  rendered visual scene and projected source DOM to find the resize handle.
- `projectNodeResize.ts` supplies Setta-specific resize policy and persistence.

The lifecycle is:

1. The resize controller listens for pointer down in capture phase.
2. It resolves a target handle and the current numeric node layout.
3. It asks `getProjectNodeResizePolicy()` whether resizing is allowed and which
   directions are enabled.
4. On start, it sets `nodeResizing`, captures the pointer, patches the layout
   store with phase `start`, calls project resize start hooks, and requests a
   `resize` frame.
5. On each pointer move, it schedules one resize animation frame.
6. The resize frame converts screen delta to flow delta by dividing by current
   zoom, applies direction-specific sizing, aspect ratio rules, min/max bounds,
   and optional snap grid, then patches the layout store with phase `change`.
7. On pointer up, it flushes the last frame, patches phase `commit`, calls
   project resize stop hooks, clears `nodeResizing`, and requests a
   `texture-upload` frame.
8. On cancel, blur, lost pointer capture, or Escape, it restores the start
   layout with phase `cancel`.

Project-specific resize behavior includes:

- Resize is disabled when layout editing is unavailable, the section is locked,
  the pan or zoom activation key is pressed, DnD modes are active, follow
  transitions are active, section move activation is active, marquee selection
  is active, or multi-selection is active.
- Min/max and resizable axes come from `getSectionMinMaxDims()` and
  `sectionResizePolicy`.
- Snap grid uses GUI settings when snap-to-grid is enabled.
- Aspect ratio uses section impl fields such as `aspectRatio`,
  `aspectRatioExtraHeight`, and `aspectRatioExtraWidth`.
- The GPU layout stores outer dimensions. Persistence converts to inner section
  dimensions with `toTopLevelSectionInnerDimension()` and
  `toTopLevelSectionOuterDimension()`.
- Resize start may promote an auto-size axis to a concrete size so drag math is
  stable.
- Resize stop detects double-click resize behavior, clamps changed sizes,
  persists through `persistSectionSizeChange()`, updates measured node
  dimensions with `updateNodeDimensionsFromGpuResize()`, and schedules
  `debounced_route_set_top_level_section_layout()`.

While a resize is active, the active node is retained in the visible set and its
texture priority is `interactive`.

## Section Drag And Drop

There are two different section movement systems:

- GPU node drag moves top-level sections freely on the canvas.
- dnd-kit structural drag-and-drop reorders and reparents sections.

They share the same section DOM and selection state, but they commit different
project changes.

### Free Canvas Movement

Free canvas movement is handled by
`frontend/src/gpuFlow/interactions/nodeDrag.ts` and wired in
`GpuProjectSurface` through `getProjectNodeDragOptions()`.

This is the normal pointer drag path for moving top-level sections around the
canvas. It is not the structural dnd-kit path.

The controller:

- starts from a pointer down on a GPU flow node.
- ignores disabled gestures, non-primary buttons, locked sections, and targets
  inside `NO_DRAG_CLASS_NAME`.
- waits for a small movement threshold.
- converts the initial and current pointer locations from screen coordinates to
  flow coordinates.
- expands the drag to selected nodes when the active section is selected.
- computes each dragged node's pointer distance from its origin.
- patches `gpuFlowLayoutStore` live while dragging.
- optionally snap-aligns on stop.
- auto-pans near viewport edges.
- requests `viewport` frames while positions change.

Project callbacks then integrate with project state:

- `handleProjectNodeDragStart()` raises temporary z-index in the GPU layout and
  marks `mouseDownDraggingSection`.
- `handleProjectNodeDrag()` does not persist during the drag; GPU flow owns live
  layout while the gesture is active.
- `handleProjectNodeDragStop()` writes final positions through
  `updateNodePositions()` and raises durable z-index with `setZIndices()`.

Free canvas movement keeps the section top-level. It does not reparent into a
group or reorder inside a nested list.

### Structural Section DnD

Structural section DnD is handled by `SectionDndContext` and the dnd-kit
adapter in `frontend/src/forks/dnd-kit/`.

It is enabled by explicit DnD modes:

- sorting mode reorders children within a parent.
- moving-free mode reparents sections or drops them onto the top-level canvas.

The modes are toggled by shortcut actions in
`state/actions/keyActivations/shortcutEventLoop.ts`. `GpuProjectSurface`
disables viewport gestures while either mode is active and cancels active
viewport transitions.

The key state stores are:

- `useDndState`: active/over ids, mode flags, drag selection, placeholder size,
  drag rects, behavior drop type, and pending deactivation.
- `useDndChildren`: a temporary parent-to-children tree used while dragging.

Top-level sections are registered by `TopLevelContainer` with both
`useDraggable()` and `useDroppable()`. Nested sections are registered by
`SortableSectionContainer` inside `DNDSortable`.

The lifecycle is:

1. `onDragStart()` resolves the active section, current drag selection, active
   rect, and placeholder size. In sorting or moving-free mode it replaces the
   dragged section set with a temp section id (`-TempDND`) in `useDndChildren`.
2. `useDropType` processes collisions during drag. It resolves over ids,
   `pastHalfway`, trigger distance, behavior drop type, and temp placeholder
   moves.
3. `DndSlot` and `useHighlightDroppable()` render valid/invalid drop feedback.
4. `useMoveSection` handles drag end.
5. Sorting uses `planSortingMove()` to compute a new child index.
6. Moving-free uses `planFreeMove()` to compute either a new parent/index or
   top-level `positionsById`.
7. `moveSectionsWithBackend()` applies the optimistic move and sends the
   backend update.
8. `manualDndChildrenReset()` clears the temporary tree.

Drop rules reject invalid structural moves, including frozen targets, invalid
parent targets, GlobalVariables moves, descendant drops for selected section
sets, and code-section attach constraints. Code-section drops are only valid for
the single-terminal attach case expected by the terminal/code-section behavior.

dnd-kit produces transforms in screen pixels. Because the section DOM is inside
a zoomed source texture, `adapter/zoom.ts` divides DnD transforms by the current
GPU-flow zoom before applying CSS transforms. Without this, drag overlays and
placeholder movement would be visually too large or too small at non-1x zoom.

### Selection Drag Handle

The selected-node rectangle is rendered outside the canvas as a viewport overlay
by `selectionDragLayer.tsx`. In moving-free mode, `GpuProjectSurface` exposes
that overlay element to dnd-kit through `selectionDragHandle.ts`. This allows a
multi-section selection to be structurally moved from the selection rectangle
instead of from an individual section body.

## Parameter Rendering

Params are part of section content. They are real DOM inside the section source
host, so they are captured into the section texture like any other section
content.

The render path is:

1. Param-capable section body renders a `ParamDndList`.
2. `ParamDndList` builds duplicate-name indexes and, when param DnD is enabled,
   builds a visible param tree.
3. `GetParamSwitch` applies param filtering while preserving ancestor paths
   needed to display matching nested params.
4. `ParamSwitch` renders either a temporary placeholder row or a real param row.
5. `ParamContainer` lays out the row, nested children, tooltip data, resize
   handle, error icon, and value input.
6. `ParamInput` reads and writes the param value.
7. `ParamUI` selects the concrete control implementation by `CodeObjType`.

Param rows use `NO_DRAG_CLASS_NAME` and `NO_PAN_CLASS_NAME`, plus
`data-gpu-flow-control` and `data-gpu-flow-interactive="true"`. Those markers
prevent canvas pan/node-drag from stealing input gestures and allow GPU-flow
source projection to find row-level interactive targets.

## Parameter Drag And Drop

Param drag-and-drop is separate from section DnD. It uses its own nested
`DragDropProvider` in `forks/dnd-kit/ParamDndContext.tsx`, mounted around the
params UI.

Param DnD is enabled only when:

- param selection mode is active (`useMisc().isSelectingParams`).
- structure editing is allowed by share capabilities.
- the section supports params: Callable, Dict, or GlobalVariables.
- the active param list has no filter text.
- the row is not an edge-input param filtered out of the draggable list.

Param lists are separated by `listKey`:

- `pinned`
- `unpinned`

Param DnD ids include the list key:

```ts
getParamDndItemId(paramId, listKey)
```

Temporary placeholders append `::TempParamDND`. Collision tracking filters by
`listKey`, so pinned and unpinned rows do not mix during a drag.

The param DnD state stores are:

- `useParamDndState`: active param, section id, list key, root id, dragging ids,
  parent map, visible children map, active rect, placeholder size, and pending
  reset state.
- `useParamDndChildren`: temporary parent-to-children and child-to-parent maps
  while dragging.

The lifecycle is:

1. `ParamSwitch` registers each real row with `useSortable()` and data
   `{ type: "param", sectionId, listKey, paramId, hasNested, onlyChildId }`.
2. `useParamDndSensors()` activates only for `type: "param"` sources and uses a
   small pointer distance threshold.
3. `handleParamDragStart()` validates the drag, resolves the active param id,
   builds the root id and parent map, and resolves the drag selection.
4. If the active param is not selected, it becomes the only selected param.
5. If multiple params are selected, only root selections are dragged. A
   selection spanning multiple parents collapses to the active param and shows a
   notification.
6. The visible param tree is built from shown top-level ids and required paths.
7. The dragged rows are measured, replaced by one temp placeholder, and state is
   recorded in `useParamDndState`.
8. `handleParamDragMove()` and `handleParamDragOver()` schedule one drag-over
   update per animation frame.
9. `resolveParamDragOverResolution()` filters collisions by list key, resolves
   the over param, `pastHalfway`, and horizontal trigger distance.
10. `resolveParamDragParent()` keeps a drop with the hovered param's parent by
    default. When trigger distance is crossed, it treats the hovered param as
    the new parent, which is the indent/reparent gesture.
11. `maybeMovePlaceholder()` updates `useParamDndChildren` so React displays the
    temp placeholder at the prospective location.
12. On drop, `resolveParamDragDropTarget()` finds the temp placeholder's parent
    and visible index.
13. `resolveParamDragInsertion()` maps that visible index back into the full
    child list with `resolveFullIndexForVisibleInsertion()`, so hidden params
    keep their relative order.
14. `moveParamsWithBackend()` applies the optimistic move and sends the
    OpenAPI `moveParams` request.
15. Reset is deferred until dnd-kit reports idle, avoiding a visual snap during
    the drop animation.

Safeguards block dropping into descendants of the dragged selection, no-op moves
within the same parent, moves without a valid old/new parent, and moves whose
visible insertion cannot be mapped back into the full child list.

## Parameter Inputs

Param values are rendered by `ParamInput` and `ParamUI`.

`ParamInput` resolves:

- the effective childless code object implementation.
- the current code object variant.
- the current section variant.
- tool-argument preview values, when present.
- whether the param is a password param.
- whether local preview state can be synchronized optimistically.

The displayed value comes from:

```ts
previewValue ?? baseValue
```

`useLocalPendingValue()` keeps local edits responsive while waiting for global
project state to catch up. If the pending value equals the global value, the
pending state clears.

When an input changes:

1. `ParamInput.onChange()` stringifies the value.
2. The local pending value updates immediately.
3. Non-password preview state is updated locally when a code object variant is
   available.
4. `shouldEmitRealtimeValue()` decides whether to emit a realtime section-param
   literal.
5. Unless the input passed `{ skipBackendUpdate: true }`, the backend write is
   queued.
6. Standard params use `setParamEnteredValue` with
   `dispatchOptimisticProjectStateUpdate()`.
7. Password params use the same backend endpoint but do not optimistically write
   the secret into normal param state.

Standard value writes are debounced by 50 ms. Password writes are also debounced
by 50 ms. This keeps high-frequency controls such as sliders responsive without
issuing a request for every pointer move.

Dropzone params have two modes:

- Stateful dropzones update the param value, often using
  `{ skipBackendUpdate: true }` around upload workflows that need explicit
  commit/rollback behavior.
- Stateless dropzones publish dependency events directly with literal metadata
  and binary payload events instead of writing persistent param value state.

`ParamUI` chooses the concrete input renderer:

- Text-like params use `TextInputCodeMirror`.
- Date and time params use the date/time text input stack.
- Slider params use configured slider bounds from param UI config.
- Rotary params use configured min/max/step.
- Switch params use a boolean switch.
- Color picker params use configured color choices.
- Dropdown params use configured choices.
- Password params use `PasswordInput` plus optional reveal behavior.
- Dropzone params use `DropzoneInput`.

Inputs are disabled when:

- param selection mode is active.
- the section is frozen.
- share capabilities do not allow param editing.
- deployment mode is active for code params.

Most input wrappers include `NO_DRAG_CLASS_NAME` and `NO_PAN_CLASS_NAME` so
typing, sliders, dropdowns, color pickers, and file drops are handled by the
source DOM rather than by canvas movement.

### Parameter Name Inputs

Editable param names are handled separately by `ParamNameInput`.

The name input uses `TextInputCodeMirror` and chooses between core `name` and
`displayName` depending on project display-name settings and whether the param
is a kwarg/core-name-editable param.

It validates locally before committing:

- empty-name rules depend on kwarg/dict-root context.
- Python identifier rules apply when Python codegen is enabled and the section
  is not a Dict.
- Dict params skip path checks.
- duplicate sibling names are rejected from the duplicate index.
- backend validation errors are shown when present.

Name writes are debounced by 200 ms and sent through `setCodeObjName`.
Display-name writes are debounced by 200 ms and sent through
`setCodeObjDisplayName`. Core name writes use optimistic update with rollback.

Validation bubbles are positioned inside the section's resize frame. The
position math accounts for the fact that the section can be visually scaled by
the GPU viewport while the source DOM still has its own local dimensions.

## Portals And Overlays

Some DOM surfaces cannot render correctly if they escape the canvas subtree.
`GpuProjectSurface` supplies portal descriptors from
`projectGpuPortalAdapter.ts`, and `GpuFlow` partitions them into:

- source-local portals rendered inside the canvas/source subtree.
- viewport portals rendered beside the canvas but in the same GPU flow root.

CodeMirror tooltips and Setta popovers are kept inside the canvas element so
html-in-canvas can capture and project them consistently.

Selection overlays are different. The marquee rectangle and selected-node drag
layer are rendered as siblings above the canvas and use the same viewport math
to align with the WebGPU scene.

## Performance Constraints

The architecture depends on a few hard invariants:

- Source DOM is mounted for native behavior, but visible movement is WebGPU
  camera movement.
- Pure pan/zoom must not repaint source DOM or upload unchanged textures.
- Source projection must be limited to the active interaction target.
- Texture uploads must be budgeted and prioritized.
- Non-active texture resolution upgrades should be deferred during viewport
  interaction.
- Section and param DnD transforms must be zoom-aware.
- Param and section controls must keep `NO_PAN_CLASS_NAME`/`NO_DRAG_CLASS_NAME`
  coverage when new controls are added.
- Top-level resize must convert screen deltas through the current zoom before
  applying section size policy.
- Visible-index DnD operations must map back to full owner data structures so
  filtered or hidden children keep their order.

These invariants keep large project canvases responsive while preserving the
behavior users expect from real DOM controls.
