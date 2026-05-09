# GPU Flow Pan, Resize, Move, and DnD Plan

## Goal

Restore and harden the canvas manipulation behaviors that xyflow previously
covered, while keeping the WebGPU/html-in-canvas renderer from
`docs/plans/webgpu-html-texture-pan-zoom-plan.md` and the active DOM teleport
model from `docs/plans/gpu-flow-live-active-node-dom-plan.md`.

The target behavior is:

- optional two-finger trackpad scroll panning in addition to click-to-drag
  panning
- top-level node resizing
- direct node movement on the canvas
- dnd-kit still works in both sortable mode and moving-free mode

Do not reintroduce xyflow or d3-zoom as runtime dependencies. Use the old
xyflow implementation on the `go-rewrite` branch as a read-only behavioral
reference and translate only the logic that still applies.

## Current Implementation Surfaces

The work should extend the existing GPU flow surfaces:

- `frontend/src/gpuFlow/GpuFlow.tsx`
  - attaches pan/zoom, selection, edge, node-drag, active-node teleport, and
    texture upload controllers
- `frontend/src/gpuFlow/interactions/panZoom.ts`
  - owns wheel zoom, pinch zoom, scroll pan, pointer pan, double-click zoom, and
    viewport interaction flags
- `frontend/src/gpuFlow/interactions/nodeDrag.ts`
  - owns direct canvas node movement, selection-aware movement, snap-to-grid,
    and auto-pan during drag
- `frontend/src/gpuFlow/GpuNodeLayer.tsx`
  - maps flow-space node layout to screen-space DOM hit-test transforms and GPU
    texture quads
- `frontend/src/gpuFlow/GpuActiveNodeTeleport.ts`
  - owns same-instance active DOM teleport for live node interaction
- `frontend/src/components/Pages/Project/GpuProjectSurface.tsx`
  - wires project settings, node layouts, pan/zoom options, node drag callbacks,
    selection overlays, file drops, and edge interaction into `GpuFlow`
- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - owns section resize handles, min/max constraints, auto-size promotion, and
    persisted section size updates
- `frontend/src/components/Utils/Resizable/ResizableWithScale.tsx`
  - already reads GPU zoom through `gpuFlow/viewportActions`
- `frontend/src/forks/dnd-kit/`
  - owns section and param dnd-kit adapters, sensors, collisions, sorting, and
    moving-free commit logic

The existing code already contains candidate pieces for all four requested
behaviors. Treat the implementation as completion, conflict resolution, and
verification rather than a greenfield rewrite.

## `go-rewrite` Branch References

Use these exact read-only references when behavior is unclear:

- `git show go-rewrite:frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - `resolvePanOnScrollDelta`, `createPanOnScrollWheelHandler`,
    `createDefaultWheelHandler`, `shouldAllowZoomFilterEvent`, and the viewport
    interaction flags are the main references for wheel ownership.
  - Important behavior to preserve: when `panOnScroll` is enabled, plain wheel
    gestures pan even if `zoomOnScroll` is also enabled; pinch zoom and explicit
    zoom activation still zoom.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
  - the `SCROLL_INIT` shim and `cancelOutScrolling()` show the previous attempt
    to let native browser scrolling produce bidirectional pan deltas.
  - Use this only as a fallback reference if direct wheel handling fails for a
    target browser. Do not add a giant hidden scroll area unless profiling and
    browser testing prove it is required.
- `git show go-rewrite:frontend/src/forks/xyflow/core/hooks/useDrag.ts`
  - reference for pointer-to-flow conversion, drag thresholds, selected-node
    dragging, snap-to-grid on drag end, auto-pan while dragging, temp z-index
    raising, and final layout persistence.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - reference for node wrapper structure, `nopan`/`nodrag` behavior, resize
    observation, and disabling direct node drag while the pan activation key is
    held.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
  - reference for node id iteration, readiness visibility, and resize observer
    ownership.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/Pane.tsx`
  - reference for background click/context/drop ownership and selection rect
    lifecycle.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/NodesSelection.tsx`
  - reference for selection box movement and keyboard movement if the current
    GPU selection overlay behavior diverges.
- `git show go-rewrite:frontend/src/forks/xyflow/core/utils/index.ts`
  - reference for `getWheelDelta`, `calcAutoPan`, and event position helpers.

Keep any copied behavior local to GPU flow controllers or the dnd-kit adapter.
Do not add compatibility shims, a dual xyflow/GPU renderer, or handwritten type
mirrors.

## HTML-In-Canvas Example References

Use these local examples in
`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`:

- `html-in-canvas-official/README.md`
  - source-of-truth explainer for `layoutsubtree`, `paint`, `requestPaint`,
    `drawElementImage`, `texElementImage2D`, and WebGPU copy semantics.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - compact WebGPU copy reference for a real interactive DOM control rendered
    through html-in-canvas.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/events.ts`
  - reference for explicit event handling around an interactive html-in-canvas
    control.
- `html-in-canvas-cracks/src/main.js`
  - most relevant WebGPU scene reference for treating HTML as a texture source
    while rendering through GPU geometry.
- `compiz-web/src/transitions/TransitionEngine.ts`
  - useful WebGL texture upload reference for checking paint readiness and
    uploading HTML element content to a GPU texture.
- `three-html-render/src/htmlTexture.ts`
  - texture lifecycle reference around paint events and dirty texture updates.
- `three-html-render/src/interactionManager.ts`
  - reference for keeping real DOM hit testing aligned with a rendered surface
    through CSS transforms.
- `three-html-render/src/raycastInteractionManager.ts`
  - reference for event-driven pointer handoff when the displayed surface and
    the live DOM element are not trivially the same plane.
- `html-in-canvas/plugins/html-cloth.mjs`
  - reference for `_wireInteractions`, `_handlePointer`, `_refreshTexture`, and
    explicit upload/interaction sequencing.
- `html-in-canvas-room/extension/entrypoints/content.ts`
  - reference for transform-aligned native interaction, wheel handling, and
    texture upload sequencing while a live page remains interactive.
- `hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html`
  - small first-click/control reference for interactive DOM rendered through
    html-in-canvas.
- `hot-tips/html-in-canvas/demos/wicg/text-input.html`
  - small reference for text input behavior and native focus expectations.

The examples are most useful for event handoff, DOM alignment, paint/upload
ordering, and deciding when live DOM must be visible instead of relying on
texture refreshes.

## Interaction Ownership Matrix

Define one explicit ownership matrix and make controllers follow it:

| User action | Normal mode | Sorting mode | Moving-free mode | Resize active |
| --- | --- | --- | --- | --- |
| Plain two-finger wheel | pan if `panOnScroll`; else zoom if `zoomOnScroll` | blocked from viewport | blocked from viewport | blocked from viewport |
| Ctrl/pinch wheel on macOS | pinch zoom if `zoomOnPinch` | blocked unless no dnd gesture is active | blocked unless no dnd gesture is active | blocked |
| Zoom activation key + wheel | zoom | blocked from dnd targets | blocked from dnd targets | blocked |
| Pointer down on background | pointer pan or selection rect | no viewport pan | no viewport pan | no viewport pan |
| Pointer down on node body | direct node move | dnd-kit owns eligible sort drags | dnd-kit owns free-move drags | no node move |
| Pointer down on resize handle | resize owns gesture | resize disabled or dnd blocked | resize disabled or dnd blocked | resize owns gesture |
| Pointer down on `nodrag`/interactive control | control owns gesture | control or dnd handle owns gesture | control or dnd handle owns gesture | control owns gesture |

Implementation notes:

- Add any missing interaction flag to `frontend/src/gpuFlow/viewportStore.ts`
  rather than inferring from scattered component state. A `nodeResizing` flag is
  likely needed so texture upload deferral and viewport gesture blocking can be
  explicit.
- Use `viewportInteractionActive` to defer passive texture uploads during pan,
  zoom, node move, and resize bursts.
- Keep `useMisc.mouseDownDraggingSection` for existing app behavior, but do not
  make it the only source of truth for GPU flow interaction state.
- In `GpuProjectSurface`, pass a `nodeDrag.disabled` function that also checks
  dnd mode state. Direct GPU node movement should not race dnd-kit when
  `isSorting` or `isMovingFree` is active.
- Resize handles and interactive controls must retain `nodrag`/`nopan` coverage
  so pan, direct node movement, and dnd-kit sensors do not steal their first
  pointer event.

## Phase 1: Optional Scroll Panning

Use `frontend/src/gpuFlow/interactions/panZoom.ts` as the owner.

Required behavior:

- When `settings.gui.panOnScroll` is true, a normal two-finger wheel gesture
  over the canvas pans the viewport.
- Click-to-drag panning remains controlled by `settings.gui.panOnDrag`.
- Pinch zoom on macOS-style `ctrlKey` wheel still zooms when `zoomOnPinch` is
  true.
- The zoom activation key still forces wheel zoom.
- `nowheel` targets preserve native scroll unless the zoom activation key or
  pinch zoom explicitly owns the gesture.
- `nopan` targets preserve control interaction and native scrolling where
  applicable.
- `PanOnScrollModeEnum.free`, `vertical`, and `horizontal` match the old branch.
- Non-macOS Shift+wheel horizontal mapping matches the old branch.

Important correction to verify:

- The old `ZoomPane.tsx` gives `panOnScroll` priority over plain
  `zoomOnScroll`. The GPU implementation must do the same. Plain wheel should
  not zoom merely because `zoomOnScroll` is true when `panOnScroll` is enabled.

Coordinate detail:

- The GPU viewport stores translation in screen CSS pixels. Unlike the old
  d3-zoom `translateBy()` path, wheel pan deltas should not be divided by zoom
  before calling `panGpuViewport`.

Implementation steps:

1. Update `shouldHandleGpuWheelEvent()` tests first to encode the old xyflow
   priority rules.
2. Update `GpuPanZoomController.onWheel()` so:
   - pinch zoom wins
   - explicit zoom activation wins
   - plain wheel pans when `panOnScroll` is true
   - plain wheel zooms only when `panOnScroll` is false and `zoomOnScroll` is
     true
3. Keep `panScrolling` and `wheelZooming` burst timers separate and request a
   final `texture-upload` frame when the burst settles.
4. Verify wheel events over scrollable node content. If content has `nowheel`,
   native content scrolling should win unless the user is explicitly zooming.
5. Only investigate the old `SCROLL_INIT` native-scroll shim if direct wheel
   events cannot deliver acceptable two-finger panning in the target Chromium.

Tests:

- Extend `frontend/src/gpuFlow/interactions/panZoom.test.ts` for:
  - pan-on-scroll winning over zoom-on-scroll for plain wheel
  - pinch zoom still winning over pan-on-scroll
  - zoom activation key still winning over pan-on-scroll
  - `nowheel` and `nopan` target preservation
  - horizontal, vertical, free, and Shift+wheel delta modes

## Phase 2: Direct Node Movement

Use `frontend/src/gpuFlow/interactions/nodeDrag.ts` and
`GpuProjectSurface.tsx` as the owners.

Required behavior:

- In normal mode, dragging a top-level node moves it in flow coordinates.
- Multi-selected root nodes move together.
- Movement uses current viewport zoom and pan through `screenToFlowPosition`.
- Snap-to-grid applies on drag end when enabled.
- Auto-pan works near canvas edges.
- Position changes update edges and selection bounds while dragging.
- Final layout is persisted once at gesture end, not through per-pointer backend
  requests.
- Position-and-size-locked sections cannot move.
- Pointer down on `nodrag`, resize handles, text inputs, sliders, CodeMirror,
  terminals, and other controls does not start a node move.
- Direct node movement is disabled while dnd-kit sorting or moving-free mode is
  active.

Implementation steps:

1. Audit current `GpuNodeDragController` against old
   `go-rewrite:frontend/src/forks/xyflow/core/hooks/useDrag.ts`.
2. In `GpuProjectSurface`, include dnd mode in the `nodeDrag.disabled` function:
   direct drag should be disabled when `isSorting` or `isMovingFree` is true.
3. Ensure drag start raises temp z-index and sets `nodeDragging`.
4. Ensure drag move calls `updateNodePositions()` and updates selection bounds.
5. Ensure drag stop:
   - applies snap-to-grid if enabled
   - clears `nodeDragging`
   - clears `mouseDownDraggingSection`
   - calls `setZIndices([...ids], true)` or another existing layout persistence
     path exactly once
   - refreshes selection bounds
6. Ensure drag cancel restores interaction flags and selection bounds without
   silently reverting unrelated user changes.
7. Keep GPU texture uploads off the hot path. Moving a node changes quad
   position, not node content.

Tests:

- Extend `frontend/src/gpuFlow/interactions/nodeDrag.test.ts` for:
  - selected-node group drag
  - snap-to-grid only on stop
  - disabled state when a supplied dnd-mode predicate returns true
  - `nodrag` and resize-handle targets
  - auto-pan delta and drag position update ordering
- Add or extend `GpuProjectSurface` tests if wiring regressions are not covered
  by controller tests.

## Phase 3: Node Resizability

Use the existing `CustomResizable` implementation as the canonical resize
surface. Do not write a parallel resize system.

Required behavior:

- Existing right, bottom, and bottom-right handles work on top-level nodes.
- Resizing respects section min/max constraints, aspect ratio, auto-only/manual
  size modes, snap grid, and position-and-size lock.
- Resize deltas are correct at any GPU zoom level.
- Resize handles do not trigger pan, node movement, dnd-kit drag, or section
  click activation.
- While resizing, visual feedback is live and native-feeling.
- Final size persists through the existing `setSectionSizes` path.
- GPU node dimensions, edge handle positions, texture records, and selection
  bounds update after the resize.

Live DOM policy:

- Treat resizing as an active node interaction.
- On hover or pointerdown of `.section-resize-handle`, activate the same-instance
  DOM teleport for that node before the user expects visual feedback.
- Suppress the passive GPU quad while the live teleported node is visible.
- Defer active-node texture uploads while resizing.
- On resize stop:
  1. restore the node DOM under the canvas layout subtree
  2. mark the node texture dirty for content and resolution
  3. request paint
  4. upload the final texture
  5. only then hide the live DOM path

Implementation steps:

1. Add resize-handle recognition to `gpuFlow/activeNodeTargeting.ts` so resize
   starts use the active DOM path, not stale passive textures.
2. Add a `nodeResizing` viewport interaction flag if current flags are
   insufficient.
3. Wire `CustomResizable` resize start/stop to the GPU interaction flag. Prefer
   a narrow callback or shared action over reading DOM classes from unrelated
   code.
4. Verify `ResizableWithScale` continues to use `getZoom()` from GPU flow and
   not stale xyflow state.
5. Ensure resize handle wrappers include `nodrag` and `nopan`. If any handle
   path lacks `nodrag`, add it at the handle source.
6. During resize, let `ResizeObserver` update node dimensions through
   `updateNodeDimensions()`. Avoid adding per-frame React state or generator
   mirrors.
7. On resize stop, use existing `persistSectionSizeChange()` behavior from
   `CustomResizable`. Do not add a second backend write path.
8. Update texture dirty handling if dimension changes do not already force a
   texture record resize and upload after settle.

Tests:

- Extend `frontend/src/components/Utils/Resizable/CustomResizable` or related
  tests for:
  - `nodrag`/`nopan` handle coverage
  - resize start/stop interaction flag lifecycle
  - zoom-aware `scale` behavior
  - double-click auto-size behavior still working
- Add GPU flow tests for:
  - resize target activation through `activeNodeTargeting`
  - upload deferral while resizing
  - final texture upload after restore

## Phase 4: dnd-kit Sortable and Moving-Free Modes

dnd-kit remains the owner for structural drag-and-drop. GPU direct node movement
is only the normal-mode canvas movement behavior.

Required behavior:

- Sorting mode still reorders children inside sortable containers.
- Moving-free mode still reparents sections or moves selected top-level sections
  onto the canvas.
- dnd-kit sensors activate only in the intended modes.
- Direct GPU node drag, pointer pan, selection rectangle, and resize do not
  steal dnd-kit's first pointer event while dnd modes are active.
- dnd-kit collision rectangles are correct at zoom levels other than `1`.
- Moving-free drop positions are computed in flow coordinates using the GPU
  viewport.
- Multi-section free-move overlays keep stable dimensions and positions.
- Param dnd remains isolated from section dnd.

Implementation steps:

1. Audit `frontend/src/forks/dnd-kit/useDNDSensors.ts` with the ownership
   matrix. Keep activation mode-gated and `nodrag` aware.
2. Audit `frontend/src/forks/dnd-kit/adapter/zoom.ts`. It should keep applying
   GPU zoom, not a removed ReactFlow store.
3. Audit `frontend/src/forks/dnd-kit/useMoveSection.ts`.
   `screenToDndFlowPosition()` already uses GPU viewport conversion; keep that
   as the only conversion path.
4. Ensure `GpuProjectSurface` disables GPU node drag while dnd modes are active.
5. Ensure viewport wheel and pointer pan do not run while a dnd-kit drag is
   active. If mode flags are not enough, expose a narrow dnd active state to the
   GPU interaction options.
6. Define the dnd live DOM policy:
   - For sorting inside a top-level node, keep the containing top-level node on
     the live DOM path for the duration of the sort so placeholders, hover
     states, and nested layout changes are visible.
   - For moving-free mode, keep the dragged selection represented by
     `DummyDragOverlay`; keep source node quads dimmed or suppressed according
     to existing dnd state.
   - For drop-target hover state that must be visible, either teleport the
     current top-level target or explicitly mark/upload the target texture on a
     bounded cadence. Prefer teleport for native feedback.
7. Do not expand active DOM teleport to arbitrary multi-node live DOM unless a
   concrete dnd scenario requires it. Start with one active top-level source or
   target plus the existing drag overlay.
8. Preserve existing dnd state and collision tests. Add GPU-specific coverage
   only where the xyflow replacement changed coordinate or event ownership.

Tests:

- Extend existing dnd-kit tests for:
  - section sorting at zoom `0.5`, `1`, and `2`
  - moving-free drop-to-canvas positions at zoom `0.5`, `1`, and `2`
  - direct GPU node drag disabled during sorting and moving-free modes
  - selection drag handle activation in moving-free mode
  - `nodrag` controls inside sections not activating dnd-kit
- Keep param dnd tests green and add one regression case proving nested param
  drag is not captured by section dnd.

## Phase 5: Edge Parity

This phase restores the graph wiring behavior that xyflow used to provide.
Edge parity means creation, rendering, selection, handle hit testing, and
coordinate correctness, not only drawing line segments.

Reference surfaces:

- `git show go-rewrite:frontend/src/forks/xyflow/core/components/ConnectionLine.tsx`
  - reference for live connection preview rendering.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Edges/BaseEdge.tsx`
  - reference for base path rendering and selected/interaction styling.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Edges/StraightEdge.tsx`
  - reference for straight path behavior.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Edges/BezierEdge.tsx`
  - reference for curved path behavior if any GPU edge family needs it.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Edges/EdgeAnchor.tsx`
  - reference for edge anchor affordances.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Handle/handler.ts`
  - reference for connection lifecycle, valid/invalid target resolution, and
    pointer ownership.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Handle/index.tsx`
  - reference for handle DOM attributes, classes, and hit targets.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/Handle/utils.ts`
  - reference for handle lookup and connection validation helpers.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - reference for data/arg edge rendering.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - reference for agentic edge rendering and interaction.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`
  - reference for state machine edge rendering and interaction.
- Current GPU owners:
  - `frontend/src/gpuFlow/Handle/index.tsx`
  - `frontend/src/gpuFlow/Handle/handler.ts`
  - `frontend/src/gpuFlow/Handle/utils.ts`
  - `frontend/src/gpuFlow/interactions/edges.ts`
  - `frontend/src/gpuFlow/edges/edgeGeometry.ts`
  - `frontend/src/gpuFlow/edges/edgeSources.ts`
  - `frontend/src/gpuFlow/edges/edgeGpuBuffers.ts`
  - `frontend/src/components/Pages/Project/gpuProjectEdgeScene.ts`
  - section-owned edge handle components under
    `frontend/src/components/Section/Container/`

Required behavior:

- Data/arg edges, agentic edges, chat shared edges, and state machine edges
  render with the expected source/target endpoints, style, z-order, selected
  state, and hidden/filter state.
- Edge handles remain aligned to section chrome after pan, zoom, direct node
  move, resize, active DOM teleport, section minimize/expand, and dnd-kit
  operations.
- Handle hit targets are large enough and stay in the same screen position as
  the rendered visual affordance.
- Starting a connection from a handle shows a live preview line or equivalent
  feedback in the correct coordinates.
- Valid and invalid targets produce deterministic feedback and use the same
  typed validation rules as the old xyflow path.
- Dropping on a valid handle creates the expected backend-owned edge or link.
- Pointer cancel, escape, background click, and invalid drop cancel the
  connection cleanly.
- Edge click and context menu selection work without being stolen by pane pan,
  node drag, resize, selection, or dnd-kit.
- Edge geometry updates immediately after node position, node size, handle
  position, section visibility, or edge source data changes.
- Edge drawing remains on the GPU hot path and does not force node texture
  recapture.

Implementation steps:

1. Audit current GPU edge geometry against the old xyflow renderers and record
   intentional visual differences.
2. Confirm `scheduleEdgeHandlePositionUpdate()` covers move, resize, dnd drop,
   minimization, expansion, and active DOM restore paths. Add narrow calls at
   owner surfaces if a path is missing.
3. Verify `Handle` DOM attributes and hit targets match what connection logic,
   tests, and section components expect.
4. Keep handle position source-of-truth typed and deterministic. Do not add
   keyword or DOM-text heuristics for resolving handles.
5. Make live connection preview draw through the GPU edge/overlay path with the
   same viewport transform as edges and nodes.
6. Ensure edge interaction controller target filtering respects `nopan`,
   active resize, active dnd, and active node teleport.
7. Keep backend route calls and validation in their existing owner paths. Do
   not duplicate edge creation rules in GPU-only code.

Tests:

- Extend `frontend/src/gpuFlow/edges/edgeGeometry.test.ts` and
  `edgeGpuBuffers.test.ts` for endpoint, style, z-order, and hidden/filter
  cases.
- Extend `frontend/src/gpuFlow/interactions/edges.test.ts` for click, context
  menu, connection start, valid drop, invalid drop, cancel, and viewport
  coordinate conversion.
- Extend handle tests under `frontend/src/gpuFlow/Handle/` for hit-target and
  validation parity.
- Add browser checks for creating, canceling, selecting, and context-clicking
  each supported edge family after pan, zoom, node move, node resize, and dnd.

## Phase 6: Viewport, Pane, and Selection Parity

This phase restores the non-node-manipulation behavior users expect from the
old xyflow canvas. It should land after the core input ownership rules are
stable because these behaviors combine viewport actions, background gestures,
selection state, and dnd guards.

Reference surfaces:

- `git show go-rewrite:frontend/src/forks/xyflow/core/hooks/useViewportHelper.ts`
  - reference for fit view, bounds-to-viewport math, center, zoom, and
    screen-to-flow conversion.
- `git show go-rewrite:frontend/src/forks/xyflow/core/hooks/useUpdateNodePositions.ts`
  - reference for committing node position updates through the old viewport
    helper surface.
- `git show go-rewrite:frontend/src/forks/xyflow/core/container/Pane.tsx`
  - reference for background click, context menu, selection rect, drag-over,
    and drop behavior.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/UserSelection.tsx`
  - reference for marquee selection rendering.
- `git show go-rewrite:frontend/src/forks/xyflow/core/components/NodesSelection.tsx`
  - reference for selection box display and selected-node movement behavior.
- `git show go-rewrite:frontend/src/forks/xyflow/minimap/MiniMap.tsx`
  - reference for minimap viewport behavior if the GPU minimap diverges.
- Current GPU owners:
  - `frontend/src/gpuFlow/viewportActions.ts`
  - `frontend/src/gpuFlow/viewportMath.ts`
  - `frontend/src/gpuFlow/GpuMiniMap.tsx`
  - `frontend/src/gpuFlow/interactions/selection.ts`
  - `frontend/src/components/Pages/Project/GpuProjectSurface.tsx`
  - `frontend/src/state/hooks/aiFollow.ts`
  - `frontend/src/state/actions/sections/sectionPositions.ts`

Viewport helper requirements:

- Fit view, go-to-section, set center, zoom in/out, reset zoom, and default zoom
  all use the GPU viewport store and preserve the existing Setta viewport
  contract.
- `screenToFlowPosition` and flow-to-screen conversions stay correct at zoom
  `0.5`, `1`, `2`, and with overview/UI-editor side panes visible.
- Viewport helpers respect min/max/default zoom settings.
- Minimap viewport rectangle, minimap node positions, and minimap click/drag
  behavior match the GPU viewport and visible project surface width.
- Keyboard shortcuts for viewport actions keep working through the GPU action
  surface.

Animated viewport requirements:

- Restore animated viewport transitions for user-visible navigation flows that
  had them under xyflow, especially AI follow, go-to-section, fit view, center,
  and zoom reset.
- Animation should live in the GPU viewport action layer, not in React component
  timers spread across callers.
- Animation must be cancellable by direct user pan, zoom, node drag, resize,
  selection drag, or dnd-kit drag.
- Animated transitions should mark viewport interaction active for the duration
  of the animation so passive texture upgrades can be deferred.
- Use a bounded duration and easing equivalent to prior behavior where known;
  record any intentional change.

Pane behavior requirements:

- Background click deselects sections and records the last pane click location
  in flow coordinates.
- Background context menu opens only for true pane targets and respects
  right-button pan settings.
- Drag-over and drop support file browser payloads and native file drops onto
  the canvas at the correct flow position.
- Pane handlers do not fire when the target is a node, selection rectangle,
  resize handle, edge handle, popover, CodeMirror tooltip, or interactive
  control.
- `nopan`, `nowheel`, and `nodrag` behavior matches the old canvas interaction
  expectations.

Selection parity requirements:

- Marquee selection starts only from the background while selection mode is
  active.
- Partial/full selection modes match `settings.gui.selectionMode`.
- Selection box dimensions, selected ids, and durable active-section sync follow
  the old lifecycle: live UI selection during the gesture, durable sync when the
  gesture settles.
- Multi-node selection box movement works at non-`1` zoom, supports snap-to-grid
  on stop, raises z-index, and updates edges and selection bounds.
- Arrow-key nudging works for selected nodes, including shift acceleration and
  snap-grid increments where applicable.
- Selection context menu opens for selected nodes and uses the selected root ids.
- Selection behavior remains disabled or guarded during dnd-kit sorting,
  moving-free mode, active resize, and active viewport animation as appropriate.

Tests:

- Extend `frontend/src/gpuFlow/viewportActions.test.ts` and
  `viewportMath.test.ts` for helper parity and animated transition math.
- Extend `frontend/src/gpuFlow/interactions/selection.test.ts` for
  background-only start, partial/full modes, cancellation, and dnd/resize guards.
- Add project-surface tests for background click, context menu, drag-over, and
  drop target filtering.
- Add browser checks for AI follow/go-to-section animation, fit view, minimap
  navigation, marquee selection, selection-box drag, keyboard nudging, pane
  context menu, and file drop.

## Phase 7: Full Section and Param UI Compatibility

Run this after scroll panning, node movement, resizing, and dnd-kit ownership
are working. The point is to prove the GPU/html-in-canvas architecture works for
the actual Setta surface area, not only for the common section and param cases.

Authoritative inputs:

- Section types come from `SectionTypeEnum` in
  `frontend/src/utils/generatedTypes.ts` and the renderer map in
  `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`.
- Param UI behavior comes from `CodeObjTypeEnum`,
  `frontend/src/components/Params/ParamUIs/ParamUI.tsx`,
  `frontend/src/components/Params/ParamUIs/ConfiguredParamInputs.tsx`, and the
  individual files under `frontend/src/components/Params/ParamUIs/`.
- Do not maintain a separate hard-coded implementation inventory. If a test
  helper needs a matrix, derive it from the generated enum plus the owner-owned
  renderer/config maps.

Section types to cover in the verification matrix:

- `Callable`, `Dict`, `GlobalVariables`
- `Code`, `GenPythonCode`, `GenPythonMetadata`, `Terminal`
- `Chat`, `Browser`, `Plugin`, `IFrame`
- `Image`, `Chart`, `Draw`, `Spreadsheet`
- `TextBlock`, `Prompt`, `MetaControl`, `Social`, `TaskBoard`
- `StateMachineStart`, `StateMachineGate`, `StateMachineEnd`
- `Group`, `ListRoot`

Param UI/code object input families to cover:

- text-like: `TextParam`, `TextAreaParam`, `CodeParam`
- date/time: `DateParam`, `TimeParam`
- controls: `SliderParam`, `RotaryParam`, `SwitchParam`, `ColorPickerParam`,
  `DropdownParam`, `PasswordParam`, `DropzoneParam`
- action and structural cases: `ButtonParam`, `NestedParam`

Required behavior:

- Every section type displays with the correct chrome, body layout, edge
  handles, minimized/expanded state, active state, and context/menu affordances.
- Every section type remains interactive when it needs native DOM behavior:
  text editing, CodeMirror editing, terminal input, chat input, browser/iframe
  interaction, spreadsheet editing, draw controls, plugin UI, media controls,
  and task board controls.
- Every section type can still participate in viewport operations where
  allowed: scroll pan, click pan around it, direct move, resize, selection,
  sorting, moving-free dnd, and edge interaction.
- Every param UI type displays correctly inside real section layouts and inside
  MetaControl surfaces where applicable.
- Every param UI type remains interactive on first pointer/key event:
  text/code editing, date/time controls, slider drag, rotary drag, switch
  toggle, color picker, dropdown/combobox, password reveal, dropzone file drop,
  button activation, and nested param expand/reorder interactions.
- Scrollable controls keep native wheel behavior when marked `nowheel`; canvas
  scroll pan and zoom activation still work outside those controls.
- Active DOM teleport does not duplicate subscriptions, editors, terminals, or
  local component state for any section or param family.
- Texture snapshots after interaction settle match the live DOM state and do
  not flash stale content.

Implementation steps:

1. Build a verification fixture project or test data helper that contains one
   representative instance of every section type and every param UI type. Keep
   generated enum values as the source for coverage expectations.
2. Add a coverage assertion that fails when a new section type or param UI type
   is added without an explicit display and interaction expectation.
3. For section types with external dependencies, use production paths and
   disposable data. Do not add broad mocks that bypass the section's real
   rendering and interaction path.
4. For each section family, verify display at zoom `0.5`, `1`, and `2`, plus
   after pan, resize, and direct move.
5. For each param UI family, verify the first meaningful interaction after
   active DOM handoff:
   - text/code/date/time: focus, caret, typing, escape/commit behavior
   - slider/rotary: pointer capture, continuous drag, final value commit
   - switch/button: first click activates exactly once
   - color/dropdown: popover positioning and selection
   - password: reveal action and placeholder state
   - dropzone: drag over, drop, and stateless attachment callback
   - nested params: expand/collapse and dnd behavior
6. Fix failures at the owner surface:
   - section layout or native interaction failures belong in the section
     component or active DOM handoff policy
   - param interaction failures belong in ParamUI or the specific param input
   - coordinate or event ownership failures belong in GPU flow interaction
     controllers or the dnd-kit adapter
7. Record any section or param type that cannot be verified with a concrete
   reason and a follow-up owner. Do not silently mark unsupported cases as
   passing.

Tests and browser verification:

- Add focused Vitest coverage for derived matrix completeness and any
  deterministic interaction helpers.
- Add Playwright or Chrome DevTools MCP scenarios for high-risk live DOM
  families: CodeMirror, terminal, chat input, browser/iframe, spreadsheet,
  dropzone, dropdown/color picker, and nested param dnd.
- Capture screenshots or traces for the full fixture before and after pan,
  zoom, direct move, resize, and dnd operations.

## Phase 8: Background Grid Settings Parity

This is lower priority than the direct interaction work, but it should be
verified before calling the xyflow replacement complete.

Reference surfaces:

- `git show go-rewrite:frontend/src/forks/xyflow/background/Background.tsx`
  - reference for old `showGridLines`, `gridPattern`, `gridPatternSize`,
    `snapGrid`, viewport transform, and light/dark color behavior.
- `git show go-rewrite:frontend/src/forks/xyflow/background/Patterns.tsx`
  - reference for dot and line SVG pattern geometry.
- `frontend/src/components/Pages/Project/GpuProjectSurface.tsx`
  - current GPU wiring from settings to `GpuGridInput`.
- `frontend/src/gpuFlow/gpuPipelines.ts`
  - current WebGPU grid renderer, uniform encoding, color parsing, and
    `BackgroundVariantEnum` handling.

Required behavior:

- `settings.gui.showGridLines` can turn the background grid off and on without
  affecting nodes, edges, selection, pan, zoom, move, resize, or dnd.
- `settings.gui.gridPattern` can render dots or lines.
- `settings.gui.gridColor` and `settings.gui.gridColorDarkMode` change the grid
  color in light and dark mode.
- `settings.gui.gridPatternSize` and `settings.gui.snapGrid` continue to drive
  pattern size and spacing.
- The grid stays anchored to the flow viewport during pan and zoom, matching the
  old xyflow behavior closely enough that grid points or lines do not drift from
  snapped node movement.
- Toggling or recoloring the grid updates GPU uniforms and redraws the frame,
  but does not mark node textures dirty or recapture HTML.

Tests:

- Extend `frontend/src/gpuFlow/gpuPipelines.test.ts` for:
  - hidden grid means no grid draw resources or draw call
  - dots and lines encode distinctly
  - light/dark hex colors encode correctly, including alpha-capable hex if
    supported
  - invalid grid colors fail loudly
- Extend or add `GpuProjectSurface` wiring coverage for:
  - `showGridLines: false` passes no grid input
  - `gridPattern`, `gridColor`, `gridColorDarkMode`, `gridPatternSize`, and
    `snapGrid` flow into `GpuGridInput`
- Include a CDP visual check for grid off/on, dots, lines, and custom color.

## Phase 9: Browser Verification

Use Chrome DevTools MCP because these are interaction and visual correctness
changes.

Required scenarios:

- Settings -> All Settings at zoom `1`
- Settings -> All Settings zoomed out and zoomed in
- two-finger style wheel pan over canvas background
- wheel over scrollable node content that uses `nowheel`
- click-to-drag panning still works
- direct single-node movement
- direct multi-node movement through the selection rectangle
- resize right, bottom, and bottom-right handles
- resize at zoomed-in and zoomed-out levels
- dnd-kit sortable mode inside a nested group/list
- dnd-kit moving-free mode onto the canvas
- dnd-kit moving-free mode onto a valid nested target
- invalid dnd target highlight
- edge handle hit testing, connection preview, valid connection creation,
  invalid connection cancellation, edge selection, and edge context menu
- CodeMirror or terminal first-click behavior after resize/move interactions
- animated fit view, go-to-section, AI follow, zoom reset, and minimap viewport
  navigation
- pane background click, context menu, file browser drop, and native file drop
- marquee selection, selection-box drag, keyboard nudging, and selection context
  menu
- full section/param compatibility fixture after Phase 7, including display and
  first-interaction checks for every covered family
- background grid off/on, dots/lines, and custom light/dark colors

Record the final implementation response with:

- `CDP visual check: done (...)`
- what viewport zoom levels were checked
- whether any texture upload or long-task anomalies were observed

If this plan is only being edited and no UI implementation is performed, the
final response may use `CDP visual check: not run (plan-only documentation
change)`.

## Performance Guardrails

- Pan and zoom must not recapture node textures merely because the viewport
  moved.
- Direct node movement must not recapture node textures while the node content
  is unchanged.
- Resize may use the live DOM path during the gesture, but final GPU texture
  upload should happen once the resize settles.
- dnd-kit hover visuals should not cause unbounded full-node texture uploads.
  Prefer active DOM for the currently involved node or bounded dirty uploads.
- Keep DOM hit-test transforms stable. Do not introduce layout shifts in
  `GpuNodeLayer`.
- Do not add polling for interaction state. Use existing dnd-kit events,
  viewport-store flags, resize callbacks, and paint events.

For any performance-relevant refactor, baseline first and record before/after
results in `perf/` as append-only reports.

## Suggested Implementation Order

1. Add/adjust unit tests for scroll panning priority and fix `panZoom.ts`.
2. Add the interaction ownership guardrails: dnd modes disable GPU node drag and
   viewport gestures where appropriate.
3. Harden direct node movement and selection movement against the old xyflow
   behavior.
4. Wire resize handles into active DOM teleport and GPU interaction flags.
5. Verify dnd-kit sortable mode with GPU zoom and live DOM policy.
6. Verify dnd-kit moving-free mode with GPU coordinate conversion and drag
   overlay behavior.
7. Restore edge rendering, handles, connection lifecycle, and edge
   interactions.
8. Restore viewport helpers, animated viewport behavior, pane behavior, and
   selection parity.
9. Run the full section and param UI compatibility matrix.
10. Verify background grid settings parity.
11. Run focused Vitest suites as each phase lands.
12. Run browser verification and then the quality gate.

## Success Criteria

The work is complete when:

- enabling `panOnScroll` makes a two-finger trackpad gesture pan the canvas
- pinch zoom and explicit zoom activation still zoom
- click-to-drag panning still works
- nodes can be moved directly in normal mode
- selected nodes can move together
- nodes can be resized with correct visual feedback and persisted size
- resize and move work correctly at non-`1` zoom levels
- dnd-kit sortable mode still reorders the intended sections
- dnd-kit moving-free mode still reparents or places sections on the canvas
- dnd-kit and direct GPU node movement never race for the same pointer gesture
- edge rendering, handle hit testing, connection creation/cancel, edge
  selection, and edge context menus match expected xyflow-era workflows
- viewport helpers, animated navigation, minimap navigation, pane background
  behavior, and selection behavior match expected xyflow-era workflows
- every section type displays correctly and remains interactive where expected
- every param UI type displays correctly and its first meaningful interaction
  works after active DOM handoff
- background grid visibility, dots/lines, and custom colors match settings
- native controls inside nodes keep first-click, text input, and wheel behavior
- GPU texture uploads stay off the pan/zoom and node-move hot paths
- focused unit/integration tests and CDP visual verification are recorded
