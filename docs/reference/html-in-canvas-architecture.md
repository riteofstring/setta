# HTML-in-Canvas Project Surface Architecture

This document explains the project canvas architecture that renders Setta
sections as real HTML inside a canvas-backed WebGPU surface. It focuses on the
runtime paths contributors usually need to understand when changing pan/zoom,
section rendering, section resize, section drag/drop, param drag/drop, or param
inputs.

Related references:

- `docs/reference/webgpu-pan-zoom-html-in-canvas.md` covers the lower-level
  WebGPU renderer, texture lifecycle, and active DOM teleport model.
- `docs/reference/dnd-kit.md` covers the forked dnd-kit integration.
- `docs/reference/section-sizing-and-ux.md` covers user-facing sizing policy.

## Architecture Summary

The project page uses `GpuProjectSurface` as the Setta integration layer and
`GpuFlow` as the generic renderer:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  converts project state into `GpuNodeLayout` records, builds the edge scene,
  reads GUI settings, and renders `GpuFlow`.
- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx` owns the canvas surface,
  controller setup, node texture manager, WebGPU quad renderer, active node
  teleport controller, and frame loop.
- `frontend/src/gpuFlow/GpuSurface.tsx` creates the `<canvas layoutsubtree>`
  element, initializes WebGPU/html-in-canvas support, observes canvas size, and
  coalesces frame requests.
- `frontend/src/gpuFlow/GpuNodeLayer/nodeLayerFrame.tsx` mounts node DOM under
  the canvas, synchronizes DOM hit-test transforms, registers visible nodes for
  texture upload, and renders visible node textures.

The key architectural split is:

- DOM is authoritative for section content, focus, inputs, accessibility, and
  hit testing.
- WebGPU is authoritative for the passive visual presentation during pan/zoom.

Each top-level section is a real `SectionContainer` DOM subtree. The renderer
captures that DOM subtree into a GPU texture via
`GPUQueue.copyElementImageToTexture`, then draws a textured quad in flow
coordinates. The same viewport transform is also written back onto the real DOM
host so native pointer and focus behavior targets the same screen rectangle as
the pixels drawn by WebGPU.

## Canvas And Node DOM Shape

`GpuFlow` renders a wrapper `div`, a `GpuSurface` canvas, and sibling overlay
layers:

```tsx
<div className="setta-gpu-flow">
  <canvas className="setta-gpu-flow__canvas" layoutsubtree="">
    <GpuNodeLayer />
    <div id="setta-codemirror-tooltips" />
    <div id="setta-popover-portals" />
  </canvas>
  <div className="setta-gpu-flow__selection-layer" />
  <div className="setta-gpu-flow__active-node-teleport-layer" />
</div>
```

`GpuNodeLayer` renders hidden anchors as React children of the canvas. For each
anchor, it creates a sibling host `div`, inserts that host directly under the
canvas, and portals the section node into that host. The host is configured
with:

- `class="setta-gpu-flow__node"`
- `data-gpu-flow-node="true"`
- `data-id="<section id>"`
- `data-testid="rf__node-<section id>"`
- `position: absolute`, `left: 0`, `top: 0`, `transform-origin: 0 0`

The host must be a direct child of the canvas so the html-in-canvas paint record
can be copied into a GPU texture.

## Frame Loop And Textures

The frame loop is imperative and coalesced through
`createGpuFrameScheduler`. A frame can be requested for `init`, `manual`,
`paint`, `resize`, `texture-upload`, or `viewport`.

Each render frame:

1. Resolves visible node quads from current viewport, canvas size, node bounds,
   z order, and a margin.
2. Applies DOM transforms for visible nodes and parks previously visible culled
   nodes offscreen with `pointer-events: none`.
3. Registers visible nodes with `NodeTextureManager`, choosing a resolution
   bucket from current zoom and `devicePixelRatio`.
4. Uploads dirty node textures within the project upload budget
   (`maxUploads: 2`, `maxDurationMs: 4`).
5. Draws the grid, edges, connection lines, and uploaded node quads through
   `GpuNodeQuadRenderer`.
6. Evicts textures outside the memory budget while protecting visible and
   interactive nodes.

Viewport-only frames should be cheap: they update camera uniforms and DOM
hit-test transforms but do not require rerendering React or recapturing every
node texture. Passive texture resolution upgrades and passive uploads are
deferred while viewport interaction is active.

## Pan And Zoom

Viewport state lives in the vanilla zustand store
`frontend/src/gpuFlow/viewportStore.ts` as `[x, y, zoom]`. The coordinate
contract is:

```ts
screenX = viewport.x + flowX * viewport.zoom;
screenY = viewport.y + flowY * viewport.zoom;
flowX = (screenX - viewport.x) / viewport.zoom;
flowY = (screenY - viewport.y) / viewport.zoom;
```

`frontend/src/gpuFlow/interactions/panZoom.ts` attaches event listeners to the
`GpuFlow` container and handles:

- wheel zoom
- macOS ctrl-wheel pinch zoom
- wheel pan
- pointer pan
- double-click zoom

The controller writes viewport changes through `viewportActions` such as
`panGpuViewport`, `zoomGpuViewportAt`, and `zoomGpuViewportByFactor`, then
requests a `viewport` frame. Programmatic callers use the exported React
Flow-compatible action names from `viewportActions.ts`: `setViewport`, `panBy`,
`zoomAtScreenPoint`, `zoomBy`, `zoomTo`, `setCenter`, `fitView`,
`screenToFlowPosition`, `flowToScreenPosition`, `getViewport`, `getZoom`,
`resetZoom`, and `updateMapPosition`.

Wheel and pointer gestures set interaction flags such as `pointerPanning`,
`panScrolling`, and `wheelZooming`. These roll up into
`viewportInteractionActive`, which the renderer uses to defer passive texture
work. When the burst ends, the controller requests a `texture-upload` frame so
deferred work can catch up.

Native scrolling and controls are preserved by class gates:

- `NO_PAN_CLASS_NAME` prevents pointer pan from stealing controls or node
  interactions.
- `NO_WHEEL_CLASS_NAME` preserves native wheel behavior unless the current
  gesture is an explicit zoom or pinch.

During section dnd-kit modes (`isSorting` or `isMovingFree`), project-level
pan/zoom options are disabled and active viewport transitions are canceled.

## Section Contents

`GpuProjectSurface` renders each node with:

```tsx
<SectionContainer sectionId={node.nodeId} isTopLevel={true} />
```

`SectionContainer` is the canonical section shell. It reads view-mode
visibility, the effective section impl, Python codegen visibility, active
state, group/code flags, and attached-terminal state from project state.

The normal top-level path is:

1. `SectionContainer`
2. `ContainerSwitch`
3. `TopLevelContainer`
4. `DndSlotAndDndWatcher`
5. `SectionContainerCore`
6. `SectionContainerCoreResizable`
7. `AreaSwitch`
8. A concrete area component such as `CallableArea`, `CodeArea`, `TextBlock`,
   `TerminalArea`, `ChatArea`, `BrowserArea`, `PluginArea`, or
   `StateMachineNodeArea`

Groups take a different shell path: `ContainerGroup` renders the group outline,
group header, overflow behavior, and nested children instead of
`SectionContainerCore`. Code sections with visible embedded attached terminals
render as a joined code+terminal group: the parent code section and the attached
terminal share one outer outline and one agentic handle scope.

`AreaSwitch` dispatches by Go-owned generated `SectionTypeEnum`. This means a
new section type should normally add its renderer at the section owner boundary
rather than introducing a canvas-specific rendering path.

Section dimensions are measured from real DOM. `GpuProjectSurface` registers a
`ResizeObserver` for node hosts with `useProjectNodeResizeObserver`; resize
entries are normalized by `getNodeUpdateInformation` and committed with
`updateNodeDimensions`. The next GPU frame uses the measured node width/height
to build quads and texture records.

## Active DOM And Input Fidelity

Passive node visuals are textures, but Setta does not expect inputs, editors,
terminals, sliders, selections, or scrollbars to behave like static images.
`nodeInteractionDirty/interactionController.ts` listens in capture phase for
events that imply a node snapshot is stale:

- custom GPU-flow dirty events
- `beforeinput`, `input`, and `change`
- `scroll` and `wheel`
- `focusin` and `focusout`
- pointer interaction
- document `selectionchange`

Interactive targets are found by `activeNodeTargeting.ts`. The selector covers
native controls, contenteditable nodes, ARIA controls, CodeMirror, xterm,
resize handles, and elements marked with `data-gpu-flow-control` or
`data-gpu-flow-interactive="true"`.

When a pointer or wheel event lands on an interactive target in a passive
texture, the controller resolves the topmost node and target descriptor, moves
the same DOM node into the active teleport layer, redispatches the event to the
live target, and marks that node as interactive priority. While teleported, the
node is suppressed from WebGPU texture drawing and upload is deferred. When the
interaction settles, the node moves back under the canvas, the canvas requests a
paint, and one final texture upload returns the node to the passive path.

This active DOM path is why section internals can continue to use normal React,
CodeMirror, xterm, form controls, and browser focus behavior inside the canvas.

## Section Resizing

Section resize is owned by `CustomResizable` in
`frontend/src/components/Utils/Resizable/CustomResizable.tsx`.
`SectionContainerCoreResizable` wraps every non-group section body in
`CustomResizable`.

Resize handles are exposed on:

- right edge
- bottom edge
- bottom-right corner

The handles include `NO_DRAG_CLASS_NAME`, `NO_PAN_CLASS_NAME`, and section-click
prevention classes so resizing does not start pan, section drag, or selection.
Meta controls and attached terminal children use specialized handle sizing and
stacking classes.

Sizing limits come from `useSectionMinMaxDims` in
`frontend/src/state/hooks/sectionSizes.ts`. That hook combines:

- `settings.sectionSizingPolicy`
- section type min/max dimensions
- minimized-section height
- measured section header/search/kwargs/params heights
- callable hidden-param rules
- meta-control type-specific rules
- terminal/chart manual-only sizing
- auto-height caps

`ResizableWithScale` passes the current GPU zoom to `re-resizable` at resize
start. This is required because the section host is CSS-scaled for hit testing;
screen-space pointer deltas must be interpreted in unzoomed section pixels.

Resize lifecycle:

1. Pointer down records possible double-click state for the handle direction.
2. Resize start sets `nodeResizing` in the viewport store and
   `mouseDownDraggingSection` in misc state.
3. If the dragged axis is currently `"auto"`, resize start can promote that
   axis to the measured pixel size before manual resizing begins.
4. Resize events mark height-resize state in `useResizeEvent`, allowing
   dependent measurement hooks to avoid auto caps while resizing.
5. Resize stop computes the changed size with `getChangedSize`.
6. A double-click stop writes `"auto"` for the allowed axis instead of a manual
   number.
7. The result is clamped to min dimensions and aspect-ratio constraints.
8. `persistSectionSizeChange` applies an optimistic project-state update and
   sends `setSectionSizes`.
9. Resize flags are cleared; the measured DOM size and paint/dirty events feed
   the next texture update through the normal node-layer path.

Width changes propagate through `setSelfParentSiblingChildrenWidths`. This keeps
vertically grouped siblings aligned and keeps embedded code+terminal widths in
lockstep. If snap-to-grid is enabled, the resize grid comes from
`settings.gui.snapGrid`.

## Section Movement And Drag/Drop

There are two section movement systems in the canvas:

- GPU node drag moves top-level nodes around the pane.
- dnd-kit section drag/drop reorders or reparents sections.

### Top-Level Node Drag

`frontend/src/gpuFlow/interactions/nodeDrag.ts` handles direct movement of
top-level nodes. It starts from a pointer down on a
`.setta-gpu-flow__node` unless the target is inside `NO_DRAG_CLASS_NAME`.
The project integration configures it with:

- `canDragProjectNode`, which blocks position-locked sections
- `getActiveSectionUIIds`, so dragging a selected node can move the selected
  set
- `nodeDragThresholdPx: 1`
- snap grid and snap-to-grid settings
- auto-pan while dragging near viewport edges

The drag controller converts screen points to flow points with the current
viewport, tracks each item by its pointer-to-node distance, and updates live
node positions through `updateNodePositions`. On stop, the project surface sets
z indices for moved nodes and refreshes selection bounds.

This path does not reparent sections. It changes top-level pane positions.

### Structural Section Drag/Drop

Structural drag/drop is powered by the Setta dnd-kit adapter under
`frontend/src/forks/dnd-kit/`.

Top-level sections use `TopLevelContainer`, which wires `useDraggable` and
`useDroppable`. Nested child lists use `ManyNestedSections`, `DNDSortable`, and
`SortableSectionContainer`. `SortableSectionContainer` applies dnd-kit
transforms through `applyZoomToTransform`, because dnd-kit reports screen-space
motion while Setta section layout is zoomed.

The two structural modes are stored in `useDndState`:

- `isSorting` reorders children inside a parent.
- `isMovingFree` allows reparenting or moving sections between a parent and the
  top-level pane.

On drag start, `useDropType/dropTypeResolution.ts` resolves the active drag
selection, records section rects, computes a normalized placeholder size using
the current zoom, and replaces dragged ids with a temporary `-TempDND`
placeholder in `useDndChildren`.

During drag, collision metadata drives placement:

- `pastHalfway` determines whether the placeholder goes before or after the
  hovered item.
- `triggerDistCondition` is used for "enter/exit parent" style behavior during
  free move.
- `behaviorDropType` records invalid targets so the UI can render invalid drop
  feedback.

Drop rules are enforced before placeholder moves. Invalid cases include frozen
target variants, GlobalVariables as the active section, top-level-only section
types being moved into parents, descendant drops, and code-section attachment
rules. Code-family sections only accept the special single-terminal attachment
case.

On drag end, `useMoveSection.ts` builds a move plan:

- sorting resolves the new child index for the current parent;
- free move resolves the new parent/index or top-level `positionsById`, using
  `screenToFlowPosition` and snap settings for pane drops.

The plan commits through `moveSectionsWithBackend`. That function applies an
optimistic local state update and sends either `moveSections` or, for the
single-terminal-to-code case, `setCodeSectionAttachedTerminal`. Moving a section
to the pane creates or updates top-level node layout and z index. Moving into a
parent removes top-level node layout.

## Parameter Rendering

Parameters render inside param-capable section areas. `ParamGroupContainer`
wraps the area in `ParamDndContext` and renders:

- `EdgesStrip` for data-edge input/output ports
- pinned params
- unpinned params

Pinned and unpinned lists both go through `ParamDndList`, which can render a
plain list or a dnd-enabled tree. `GetParamSwitch` applies the current param
filter with `matchSorter`; it keeps ancestors from `requiredParamIdsToPaths` so
matching nested params remain visible with their parent path.

Each real param row is:

1. `ParamSwitch`
2. `SortableRealParamSwitchRow`
3. `ParamContainer`
4. `ParamInput`

`ParamSwitch` decides whether the row is selected, a search result, focused by
search, nested, or in error. Editable keyword/core-name params use
`ParamNameInput`; other params use `ParamTextLabel`. Nested parent params render
their child rows recursively through `ParamContainer`.

`ParamContainer` marks rows with:

- `data-param-row="true"`
- `data-gpu-flow-control="param-row:<sectionId>:<paramInfoId>"`
- `data-gpu-flow-interactive="true"`
- `NO_DRAG_CLASS_NAME`
- `NO_PAN_CLASS_NAME`

Those attributes are important for GPU-flow active node targeting. Param rows
are treated as interactive DOM, not inert texture pixels.

## Parameter Drag/Drop

Param drag/drop is separate from section drag/drop. It uses
`frontend/src/forks/dnd-kit/ParamDndContext.tsx`,
`frontend/src/components/Params/ParamDndContext.tsx`, and
`frontend/src/components/Params/ParamDndMonitor/`.

Param dragging is enabled only when:

- `useMisc().isSelectingParams` is true
- the share capabilities allow structure editing
- the section is param-capable (`Callable`, `Dict`, or `GlobalVariables`)
- the param filter is empty
- the param is not an edge-input param filtered out of the editable list

Each param sortable uses dnd data:

```ts
{
  type: "param",
  sectionId,
  listKey, // "pinned" or "unpinned"
  paramId
}
```

On drag start, `ParamDndMonitor`:

1. Resolves the active param id.
2. Builds a parent map and visible tree from project state.
3. Resolves the active pinned/unpinned list.
4. Derives dragging ids from selected params, using only root selected params.
5. Collapses multi-parent selections to the active param with a notification.
6. Measures placeholder width/height from dnd-kit droppable rects.
7. Replaces dragged params with a temporary `::TempParamDND` placeholder.
8. Stores active drag metadata in `useParamDndState`.

During drag, move/over events are batched into one animation frame. Collisions
are filtered by `listKey`, so pinned and unpinned params cannot intermix. The
resolved collision supplies `pastHalfway` and `triggerDistCondition`:

- vertical movement reorders within the current parent;
- horizontal movement past the trigger threshold reparents under the hovered
  param;
- descendant drops are rejected.

On drop, the monitor resolves the placeholder parent and temp index, then maps
the visible insertion point back to the full child index with
`resolveFullIndexForVisibleInsertion`. This preserves hidden params that are not
currently visible. The commit goes through `moveParamsWithBackend`.

If param selection mode turns off mid-drag, the monitor cancels the operation
and defers reset until dnd-kit reports idle.

## Parameter Inputs

`ParamInput` owns the value pipeline for editable param values. It reads the
current effective childless code object impl, current code object variant,
section variant id, and optional tool-argument preview value. Preview values
temporarily override the base impl value for display.

The rendered value uses `useLocalPendingValue` so typing and control changes are
immediate. `onChange` then:

1. Stringifies the next value.
2. Updates local pending state.
3. Syncs the local project-state preview for non-password params.
4. Emits realtime param dependency updates when `shouldEmitRealtimeValue`
   says the value should be streamed.
5. Queues a debounced backend update through `setParamEnteredValue`, unless the
   control passed `skipBackendUpdate`.

Standard params use an optimistic update through
`dispatchOptimisticProjectStateUpdate` before the OpenAPI call. Password params
do not expose the secret by default; reveal calls `getPasswordParamValue` and
only fills the local pending value if the backend returns a value.

Stateless dropzone params do not persist dropped file content as a normal
entered value. Instead, `ParamInput` emits realtime dependency events containing
attachment metadata and separate binary payload events keyed by content id.
Stateful dropzones upload/import/delete artifacts first, update the local value
with `skipBackendUpdate`, then call `setParamEnteredValue` directly so attachment
cleanup and rollback can be handled by the dropzone owner.

`ParamUI` chooses the concrete input renderer from `CodeObjTypeEnum`:

- text-like params use `TextInputCodeMirror`
- date/time params use `TextParamDateTimeInput`
- sliders use `SliderInput`
- rotary controls use `RotaryInput`
- switches use `SwitchInput`
- color pickers use `ColorPickerInput`
- dropdowns use `DropdownInput`
- passwords use `PasswordInput`
- dropzones use `DropzoneInput`

Inputs are disabled when params are being selected, the section is frozen, the
share session lacks param edit capability, or deployment mode blocks a code
param. Escape returns focus to the owning section.

Most input wrappers include `NO_DRAG_CLASS_NAME` and `NO_PAN_CLASS_NAME`. Text
inputs, sliders, dropdowns, color pickers, password fields, dropzones, and
CodeMirror editors are also covered by the GPU-flow interactive target
selectors. That lets active-node teleport hand events to live DOM while keeping
the passive WebGPU texture path for normal pan/zoom.

## Practical Invariants

When changing this architecture, keep these invariants intact:

- Top-level node hosts must stay direct children of the
  `<canvas layoutsubtree>` element.
- DOM hit-test transforms and WebGPU viewport transforms must use the same
  `[x, y, zoom]` contract.
- Culled nodes must be parked offscreen and must not retain pointer events.
- Pan/zoom must not rerender the section React tree on every viewport tick.
- Interactive controls inside nodes must be marked or selectable by
  active-node targeting.
- Resize and dnd transforms must account for current GPU zoom.
- Section behavior, validation, and persistence should remain owned by project
  state and backend routes; the canvas layer should adapt those contracts, not
  redefine them.
