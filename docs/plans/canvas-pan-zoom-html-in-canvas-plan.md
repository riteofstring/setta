# Canvas Pan/Zoom With HTML-in-Canvas Plan

## Goal

Replace the current XYFlow/React Flow style viewport with a canvas-owned pan/zoom renderer while keeping section/node contents as real HTML.

The target outcome is high-frequency pan and zoom where the browser is no longer repainting and compositing a large transformed DOM subtree on every viewport update. Section contents stay as `SectionContainer` HTML; the canvas draws those HTML nodes through the experimental html-in-canvas APIs.

This plan assumes a clean branch with no users and no compatibility obligations. Do not build legacy fallbacks, dual renderers, or migration paths. If the required browser API is unavailable, fail loudly with a clear development error.

## Current State

The current canvas is `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`.

Important pieces:

- `ReactFlow.tsx` owns the `.react-flow` wrapper and scroll cancellation shim.
- `FlowRenderer.tsx` composes `ZoomPane`, `Pane`, selection handles, and the viewport children.
- `ZoomPane.tsx` uses `d3-zoom` and writes `useReactFlow.state.transform`.
- `Viewport.tsx` applies the viewport CSS transform to `.react-flow__viewport`.
- `NodeRenderer.tsx` renders every node as DOM through `NodeWrapper`.
- `wrapNode.tsx` positions each section with a per-node CSS `transform`.
- `EdgeRenderer.tsx`, `AgenticEdgeRenderer.tsx`, `StateMachineEdgeRenderer.tsx`, `Background.tsx`, `ConnectionLine`, `NodesSelection`, `MiniMap`, and `Controls` are all tied to the XYFlow store and DOM/SVG viewport model.

The main performance problem is structural: the entire viewport is a transformed DOM subtree. Even with `will-change: transform`, the browser still has to manage a large live DOM/SVG layer tree during pan and zoom.

Other Setta code depends on XYFlow concepts:

- `useReactFlow.state.transform` is the shared viewport contract.
- `screenToFlowPosition`, `setCenter`, `zoomIn`, `zoomOut`, `resetZoom`, `getViewport`, and `updateMapPosition` are used outside the renderer.
- `useReactFlow.state.domNode` is used by geometry, context menus, windowing, and dimensions code.
- Edge handles are measured from real DOM elements in `state/actions/edgeHandles.ts`.
- DnD uses the current zoom to scale drag deltas.
- Project chat windowing currently reaches into `d3Zoom` directly in a few places and must be moved to viewport actions.

## What The Example Repos Show

The local examples in `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` support a much simpler renderer than a full Three.js port.

### Official WICG Example

`html-in-canvas-official/README.md` defines the primitives:

- `<canvas layoutsubtree>` opts direct canvas children into layout, hit testing, and accessibility.
- `CanvasRenderingContext2D.drawElementImage(element, ...)` draws a direct child element into the canvas.
- The method returns a `DOMMatrix`; applying it to `element.style.transform` synchronizes native hit testing with the drawn location.
- CSS transforms on the source child are ignored for drawing, but still affect hit testing/accessibility.
- A `paint` event fires when canvas children have a new rendering snapshot.
- `requestPaint()` forces a paint event, useful for initial paint and animation-driven updates.
- `ResizeObserver` with `device-pixel-content-box` is the right way to size the canvas backing store.

`Examples/complex-text.html` and `Examples/text-input.html` are the key shape for us: one canvas, real HTML child content, `ctx.drawElementImage(...)`, then `element.style.transform = transform.toString()`.

### three-html-render

`three-html-render` proves the same model works with heavier transforms:

- `src/htmlTexture.ts` recaptures a canvas child on `paint` and marks a texture dirty.
- `src/interactionManager.ts` and `src/htmlOverlayRenderer.ts` keep real DOM elements aligned with rendered surfaces by writing CSS matrices every frame.
- `src/raycastInteractionManager.ts` shows an alternate event-driven interaction path for complex 3D surfaces.
- The README says native events, focus, hover, input, selection, scroll, and caret rendering can remain tied to real DOM.

For Setta, this means we do not need to rewrite section internals. We need a 2D camera transform and DOM transform synchronization, not 3D projection or raycast routing.

The package's polyfill is useful as reference, but not as the performance solution. It falls back to SVG `foreignObject` rasterization and would reintroduce expensive raster work for our large nodes. The Setta implementation should require the native Chromium feature.

### compiz-web, cracks, room, and cloth examples

These repos show related implementation details:

- `compiz-web/src/transitions/TransitionEngine.ts` uses `texElementImage2D`, waits for a frame after appending new canvas children, and uploads HTML into WebGL textures.
- `html-in-canvas-cracks/src/main.js` uses html-in-canvas as a live source texture for a WebGPU/Three scene and keeps the source canvas/DOM as the authoritative content.
- `html-in-canvas-room/extension/entrypoints/content.ts` and `html-in-canvas/plugins/html-cloth.mjs` show that a real DOM wrapper can be transformed for native interaction while the HTML capture remains independent of those CSS transforms.
- `html-cloth.mjs` also shows a useful pattern for dynamic media: request a paint event, listen once for `paint`, then upload/draw the element snapshot.

The common lesson: keep HTML as real DOM, let the canvas own visual composition, and synchronize DOM hit testing with the same transform used for drawing.

## Relevant Example References

Use these local examples as implementation references:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/README.md`
  - Source-of-truth explainer for `layoutsubtree`, `drawElementImage`, returned `DOMMatrix` synchronization, `paint`, and `requestPaint`.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/complex-text.html`
  - Minimal Canvas 2D pattern for drawing complex HTML and applying the returned transform back to the element.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/text-input.html`
  - Minimal Canvas 2D pattern for real inputs inside a canvas child.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlInCanvasPolyfill.ts`
  - Useful reference for dirty scheduling, `paint` event handling, canvas child management, and transform math. Do not use it as the runtime path.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlRenderer.ts`
  - Useful reference for dynamic form state, focus/selection handling, and why the SVG fallback is not the desired high-performance path.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/examples/focus-ring.html`
  - Practical reference for focused input feedback, `texElementImage2D`, and keeping visual effects synchronized with live HTML state.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-demo/demos/water-drop/index.html`
  - Reference for live interactive HTML rendered through WebGL, especially recapturing during transitions and control interactions.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`
  - Reference for native html-in-canvas support gating, paint readiness, and HTML-to-texture upload timing.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas/plugins/html-cloth.mjs`
  - Reference for request-paint/upload sequencing and manual interaction mapping under heavier transforms.

## Core Decision

Use a Canvas 2D renderer first.

We only need pan and zoom. A 2D renderer can draw grid, edges, node HTML snapshots, selection rectangles, and connection lines in one canvas. This avoids adding Three.js and avoids a WebGL texture pipeline unless Canvas 2D `drawElementImage` itself profiles as the bottleneck.

The rendering model:

1. A full-size `<canvas layoutsubtree>` replaces the transformed DOM viewport.
2. Each top-level section node is a direct child of that canvas.
3. The node child contains the existing `SectionContainer` tree.
4. On render, the canvas draws background/grid, edges, visible nodes, connection line, and selection overlays.
5. For each drawn node, the renderer applies the returned `DOMMatrix` to that node's real DOM element so pointer events, focus, hover, and accessibility align with the canvas pixels.
6. Pan and zoom update only a lightweight camera transform and schedule an imperative canvas redraw. React should not re-render the whole node tree on every viewport tick.

Do not use always-on `will-change: transform` for nodes. The real DOM is only a hit-test/accessibility layer; the visual viewport is the canvas.

## Proposed File Layout

Create a Setta-owned renderer instead of another XYFlow fork:

- `frontend/src/canvasFlow/CanvasFlow.tsx`
- `frontend/src/canvasFlow/CanvasSurface.tsx`
- `frontend/src/canvasFlow/CanvasNodeLayer.tsx`
- `frontend/src/canvasFlow/canvasRenderer.ts`
- `frontend/src/canvasFlow/canvasViewportStore.ts`
- `frontend/src/canvasFlow/viewportMath.ts`
- `frontend/src/canvasFlow/viewportActions.ts`
- `frontend/src/canvasFlow/interactions/panZoom.ts`
- `frontend/src/canvasFlow/interactions/nodeDrag.ts`
- `frontend/src/canvasFlow/interactions/selection.ts`
- `frontend/src/canvasFlow/edges/edgeGeometry.ts`
- `frontend/src/canvasFlow/edges/edgeHitTesting.ts`
- `frontend/src/canvasFlow/CanvasControls.tsx`
- `frontend/src/canvasFlow/CanvasMiniMap.tsx`
- `frontend/src/canvasFlow/htmlInCanvasTypes.ts`

Then update imports from `forks/xyflow/...` to `canvasFlow/...` and delete `frontend/src/forks/xyflow` when the replacement is complete.

Keep the state concepts that are genuinely Setta concepts:

- transform as `[x, y, zoom]`
- viewport dimensions
- node selection dimensions
- connection state
- selection key state
- pan/zoom activation key state
- `viewportInteractionActive`

But remove `d3Zoom`, `d3Selection`, and all direct `d3-zoom` control paths. Programmatic viewport changes should use explicit Setta actions such as `setViewport`, `panBy`, `zoomTo`, `zoomBy`, `setCenter`, and `fitView`.

## Canvas DOM Shape

The new root should look conceptually like:

```tsx
<div className="setta-canvas-flow" data-tab-scope="canvas">
  <canvas
    ref={canvasRef}
    className="setta-canvas-flow__canvas"
    layoutsubtree=""
  >
    {visibleOrMountedNodeIds.map((nodeId) => (
      <CanvasNodeChild key={nodeId} nodeId={nodeId} />
    ))}
  </canvas>
  <CanvasOverlayPortals />
</div>
```

`CanvasNodeChild` must be a direct child of the canvas because `drawElementImage` requires direct canvas children. It should render the existing section contents:

```tsx
<div
  className="setta-canvas-flow__node"
  data-id={nodeId}
  data-testid={`rf__node-${nodeId}`}
  ref={nodeRef}
>
  <NodeIdContext.Provider value={nodeId}>
    <SectionContainer sectionId={nodeId} isTopLevel={true} />
  </NodeIdContext.Provider>
</div>
```

Important styling:

- `position: absolute`
- `left: 0`
- `top: 0`
- `transform-origin: 0 0`
- `pointer-events: auto`
- `z-index` set from node z order for hit testing
- no model position in CSS except the synchronized matrix returned by `drawElementImage`

Node model position remains in `useNodeInternals`. CSS position is no longer the source of truth.

## Canvas Render Loop

The renderer should be imperative and frame-coalesced.

Inputs:

- current viewport transform
- canvas backing size and CSS size
- visible node records from `useNodeInternals`
- DOM element refs for node children
- edge handle positions from `useEdgeHandleRegistry`
- project edge lists and variant map
- settings for grid, colors, selection mode, minimap/controls

Scheduling:

- `scheduleCanvasDraw(reason)` coalesces to one `requestAnimationFrame`.
- Viewport changes schedule a draw but do not trigger React tree renders.
- Node position/size changes schedule a draw.
- Edge handle changes schedule a draw.
- Native `canvas.onpaint` schedules a draw because child snapshots changed.
- Initial mount calls `canvas.requestPaint()` and waits for the first paint before drawing nodes.

Sketch:

```ts
function drawFrame(ctx: CanvasRenderingContext2D, state: CanvasDrawState) {
  const { dpr, widthCss, heightCss, transform } = state;
  const [tx, ty, zoom] = transform;

  ctx.reset();
  ctx.clearRect(0, 0, widthCss * dpr, heightCss * dpr);
  ctx.scale(dpr, dpr);

  drawGrid(ctx, state);

  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(zoom, zoom);
  drawEdges(ctx, state);

  for (const node of getVisibleNodesSorted(state)) {
    const element = state.nodeElements.get(node.id);
    if (!element) continue;
    const matrix = ctx.drawElementImage(element, node.position.x, node.position.y);
    element.style.transform = matrix.toString();
    element.style.pointerEvents = "auto";
  }

  drawConnectionLineInFlowCoords(ctx, state);
  ctx.restore();

  drawSelectionOverlayInScreenCoords(ctx, state);
}
```

After drawing visible nodes, park every mounted-but-culled node by setting `pointer-events: none` and moving its synchronized DOM transform far offscreen. A culled node must never keep an old hit-test transform in the visible viewport.

The exact CTM/argument combination must be verified with a small local probe because browser implementations are still experimental. The preferred implementation is to put the full camera transform on the 2D context and call `drawElementImage(element, node.position.x, node.position.y)`. If the returned CSS matrices are incorrect in the current Chromium build, switch to explicit screen-space draw calls:

```ts
ctx.drawElementImage(
  element,
  tx + node.position.x * zoom,
  ty + node.position.y * zoom,
  node.width * zoom,
  node.height * zoom,
);
```

The invariant is more important than the exact call shape: the visual draw transform and the DOM hit-test transform must come from the same call.

## Culling

Node culling is required from the first usable version.

Use the existing viewport math:

- `screenToFlowPosition({ x: 0, y: 0 })`
- `screenToFlowPosition({ x: width, y: height })`
- expand the flow rect by a padding margin, for example 800 CSS px divided by zoom
- include any currently active, dragged, resizing, connecting, or focused node even if just outside the rect

Draw only visible nodes. Keep DOM mounted initially to reduce risk to section state, but only draw visible nodes. If mounted DOM itself remains too costly, add a second phase that window-mounts inactive far-away nodes with state-preserving rules for sensitive section types.

For mounted but culled nodes:

- set `pointer-events: none`
- park the element with an offscreen transform
- do not recompute edge handle positions from its parked DOM rect
- refresh handle positions when the node becomes visible again or when its node dimensions change

Edges should also be culled:

- draw an edge when either endpoint is inside or the edge bounding box intersects the viewport
- always draw active/connecting edges
- recompute edge handle positions only for sections whose geometry changed, not on every pan frame

## Edge Rendering

Move edge drawing from SVG to Canvas 2D.

Reuse existing semantic sources:

- project edges from `useProjectState.projectConfig.edges`
- handle positions from `useEdgeHandleRegistry.positions`
- variant visibility from `projectConfig.sectionVariantMap`
- wire colors from settings

Implement Canvas equivalents for:

- bezier edges
- straight edges
- selected edge styles
- animated edge style, only if still needed
- labels, either drawn to canvas as text or rendered as direct canvas children if they need rich HTML
- connection line while dragging from a handle
- agentic and state machine edge renderers

Keep edge hit testing model-owned:

- store path geometry per edge after draw
- use `Path2D` where possible for hit testing
- otherwise use distance-to-segment/bezier math in flow coordinates
- context menu and selection should resolve edge ids from this geometry, not from SVG DOM

## Edge Handles

Preserve real DOM handles inside section content.

The current registry in `state/actions/edgeHandles.ts` measures handle elements with `getBoundingClientRect()` and converts to flow coordinates using `screenToFlowPosition`. This still works if the renderer synchronizes node DOM transforms with `drawElementImage` on every draw.

Updates needed:

- Replace `.react-flow__viewport` existence checks with canvas-flow checks.
- Ensure handle registration schedules a canvas draw after positions change.
- Keep `ResizeObserver` on handle elements.
- On native `paint` events, schedule handle position refresh for changed node children if handle geometry might have moved.
- During pan/zoom, do not recompute handle positions; flow coordinates do not change.

This keeps edge handles connected to real section DOM without requiring section internals to expose static port geometry.

## Pan And Zoom Interactions

Replace `d3-zoom` with explicit pointer and wheel handling.

Wheel behavior should preserve current settings:

- `zoomOnScroll`
- `zoomOnPinch`
- `panOnScroll`
- `panOnScrollSpeed`
- `panOnScrollMode`
- `zoomActivationKeyPressed`
- `NO_WHEEL_CLASS_NAME`
- `NO_PAN_CLASS_NAME`

Viewport actions:

- `setViewport({ x, y, zoom }, { duration?: number })`
- `panBy({ x, y })`
- `zoomAtScreenPoint(nextZoom, screenPoint)`
- `zoomBy(factor, screenPoint)`
- `setCenter(flowX, flowY, { zoom, duration })`
- `fitView(options)`

Zoom around a screen point:

```ts
const flowBefore = screenToFlowPosition(screenPoint, true);
const nextZoom = clamp(zoom * factor, minZoom, maxZoom);
const nextX = screenPoint.x - flowBefore.x * nextZoom;
const nextY = screenPoint.y - flowBefore.y * nextZoom;
```

Panning:

- pointer down on canvas background starts pan
- pointer move updates `x/y`
- pointer capture stays on the canvas
- middle-click pan over a node can be preserved by checking `panOnDrag`
- update `paneDragging` and `viewportInteractionActive`
- close context menus on gesture start

Animations:

- replace `d3` transitions with a small RAF tween helper
- fit view and reset zoom can animate over the existing short durations
- while a transition runs, write transform to the store and draw once per frame

## Node Drag And Resize

Replace `useDrag.ts` with canvas-flow pointer handling.

Node drag still starts from the real node DOM child:

- respect `NO_DRAG_CLASS_NAME`
- respect position/size lock
- use `screenToFlowPosition` to compute flow deltas
- snap to grid on drag end if enabled
- keep auto-pan by calling `panBy`
- update `useNodeInternals` through existing `updateNodePositions`
- schedule edge handle updates for moved sections
- schedule a canvas draw after every position update

Resize can keep using existing `SectionContainerCoreResizable` internals if it only needs current zoom and real DOM events. Replace any `useReactFlow` imports with canvas-flow store helpers.

## Selection

Selection rectangle can be canvas-drawn.

Keep current behavior:

- selection starts on background when the selection key is active
- active ids are computed with `getNodesInside`
- final selection sync uses existing active section actions
- `nodesSelectionDims` remains a store field for multi-node drag/resize affordances

Replace DOM/SVG selection boxes with:

- canvas draw for the visible selection rectangle
- a small transparent DOM hit target only if multi-selection drag handles need native events
- otherwise handle multi-selection drag from canvas pointer hit testing against the selection bounds

## Controls And MiniMap

Replace `forks/xyflow/controls` with `canvasFlow/CanvasControls.tsx`.

Controls can stay normal React DOM because they are not part of the panned node surface. Their actions call canvas-flow viewport actions, not `d3Zoom`.

Replace `forks/xyflow/minimap` with `canvasFlow/CanvasMiniMap.tsx`.

The minimap can stay SVG or become a small canvas. It is not the primary performance bottleneck. It should read:

- `useNodeInternals`
- current viewport transform
- active section ids
- dark mode and minimap settings

Click/drag on the minimap should call `setCenter` or `setViewport`.

## Portals, Tooltips, And Popovers

The existing viewport owns:

- `CODEMIRROR_TOOLTIP_PARENT_ID`
- `SETTA_POPOVER_PORTAL_PARENT_ID`

Do not put these inside a transformed DOM viewport. Options:

1. Keep portal roots as ordinary absolutely positioned DOM siblings over the canvas and convert any flow-anchored coordinates through `flowToScreenPosition`.
2. If a portal must visually pan with a section, make it a direct canvas child and draw it like a node.

Start with option 1. It is lower risk and keeps transient overlays out of the hot pan/zoom path.

## API Cleanup

Replace these direct XYFlow/d3 dependencies:

- `restoreProjectChatCanvasViewport` in `state/actions/projectChatWindowing.ts`
- `movePaneToIncludeElement` in `forks/xyflow/core/utils/graph.ts`
- minimap pan/zoom handlers
- controls zoom handlers
- DnD zoom helpers
- tests that seed `d3Zoom`/`d3Selection`

New helper exports should live in canvas-flow:

- `useCanvasFlow`
- `getViewport`
- `setViewport`
- `zoomIn`
- `zoomOut`
- `resetZoom`
- `setCenter`
- `screenToFlowPosition`
- `flowToScreenPosition`
- `getZoom`
- `fitView`
- `updateMapPosition`

After all imports move, remove:

- `frontend/src/forks/xyflow`
- `d3-zoom`
- `d3-drag`
- `d3-selection` if no other code still uses it
- `d3-interpolate` if no other code still uses it

## Native API Gate

Add a single support check near `CanvasSurface` startup:

```ts
function assertHtmlInCanvasSupport(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.drawElementImage !== "function") {
    throw new Error(
      "Setta canvas flow requires Chromium html-in-canvas. Enable chrome://flags/#canvas-draw-element.",
    );
  }
  if (typeof canvas.requestPaint !== "function") {
    throw new Error(
      "Setta canvas flow requires HTMLCanvasElement.requestPaint from html-in-canvas.",
    );
  }
}
```

Add local TypeScript declarations for:

- `HTMLCanvasElement.layoutSubtree`
- `HTMLCanvasElement.requestPaint`
- `HTMLCanvasElement.onpaint`
- `HTMLCanvasElement.captureElementImage`
- `CanvasRenderingContext2D.drawElementImage`
- `PaintEvent.changedElements`

Do not add a runtime polyfill.

## Implementation Sequence

### 1. Probe The Browser Contract

Create a minimal local probe in the frontend codebase, then delete it after the renderer is working.

The probe must verify:

- React can render direct children inside `<canvas layoutsubtree>`.
- React click/input handlers on canvas child content fire normally.
- `drawElementImage` returns a transform that aligns `getBoundingClientRect()` with drawn pixels.
- The preferred CTM draw path works at DPR 1 and DPR 2.
- A nested input can focus, type, show caret, and redraw through `paint`.
- `changedElements` identifies the direct node child when nested content changes.

This should be done before large migration work because it validates the experimental API details in the current local Chromium.

### 2. Add Canvas-Flow Store And Math

Implement `canvasViewportStore`, `viewportMath`, and `viewportActions`.

Port focused tests from XYFlow store/utils:

- `screenToFlowPosition`
- `flowToScreenPosition`
- zoom-around-point math
- `fitView`
- `panBy` constraints
- viewport update subscription

No UI changes yet.

### 3. Build Canvas Surface Skeleton

Replace `ReactFlow` usage in `UIPage.tsx` with `CanvasFlow`.

At this stage:

- canvas exists and sizes correctly
- support gate runs
- grid draws
- transform updates can be driven by temporary controls or existing controls
- viewport persistence still updates backend through the existing subscription shape

### 4. Render Node HTML Through Canvas

Implement `CanvasNodeLayer` and direct canvas node children.

Reuse:

- `SectionContainer`
- `NodeIdContext`
- `useSectionRefAndInit`
- `ResizeObserver` dimension updates
- active section state and section chrome

Remove the viewport-level CSS transform and node-position CSS transform. The canvas renderer becomes the only visual positioning path.

### 5. Port Pan, Zoom, Selection, And Node Drag

Implement the interaction controllers and remove `d3-zoom`/`d3-drag` from the hot path.

Carry forward the current interaction settings that still make sense, but do not keep d3 shims.

### 6. Draw Edges And Connection State On Canvas

Port edge geometry to Canvas 2D:

- regular arg edges
- agentic edges
- chat shared edges
- state machine edges
- connection line
- selected/hover/active edge state

Keep DOM handles for interaction and measurement.

### 7. Replace Controls And MiniMap

Move controls and minimap to canvas-flow implementations.

Update `Overview.tsx` and `ResponsiveMiniMap.tsx` imports. Delete the XYFlow controls/minimap code after the new versions are used.

### 8. Update External Consumers

Migrate all imports from:

- `forks/xyflow/core/store`
- `forks/xyflow/core/hooks/useViewportHelper`
- `forks/xyflow/core/utils/graph`
- `forks/xyflow/core/types`
- `forks/xyflow/minimap`
- `forks/xyflow/controls`

to canvas-flow equivalents or Setta-owned type modules.

Pay special attention to:

- `frontend/src/forks/dnd-kit`
- `frontend/src/state/actions/projectChatWindowing.ts`
- `frontend/src/state/actions/sectionInfos.ts`
- `frontend/src/state/actions/nodeInternals.ts`
- `frontend/src/state/actions/edgeHandles.ts`
- section layout components that read zoom
- context menus that clear selection dims

### 9. Delete XYFlow

Once no imports remain:

- delete `frontend/src/forks/xyflow`
- remove unused d3 dependencies from `frontend/package.json`
- run dependency cleanup through the repo scripts, not manual lockfile edits unless dependency changes require it

## Tests

### Unit Tests

Add tests beside canvas-flow modules:

- `viewportMath.test.ts`
- `viewportActions.test.ts`
- `canvasCulling.test.ts`
- `edgeGeometry.test.ts`
- `edgeHitTesting.test.ts`
- `panZoom.test.ts`
- `selection.test.ts`
- `nodeDrag.test.ts`

Use jsdom for math and interaction reducers. Mock `drawElementImage` for unit tests; do not try to validate browser rendering in jsdom.

### Integration Tests

Update existing tests that currently mock `useReactFlow`.

Add focused component tests for:

- mounting `CanvasFlow`
- rendering section nodes as canvas direct children
- preserving `NodeIdContext`
- updating dimensions through `ResizeObserver`
- converting handle DOM positions to flow coordinates
- selection rectangle active ids
- node drag with snap-to-grid
- viewport persistence subscription

### Browser Verification

Use Chrome DevTools Protocol because this is a UI and performance-sensitive change.

Required checks:

- initial canvas view is nonblank
- nodes render as canvas pixels
- text inputs inside a node can focus and type
- buttons/dropdowns inside nodes respond
- CodeMirror sections still accept input
- terminals still display and scroll
- pan by pointer drag is smooth
- wheel zoom is smooth around cursor
- trackpad pinch zoom works if enabled
- node drag works with auto-pan
- selection rectangle works
- edge connection and reconnection work
- minimap click/drag recenters the viewport
- context menus open at correct coordinates
- popovers/tooltips anchor correctly

Performance checks:

- record old branch baseline and new branch after implementation with the same large project
- use the repo Chrome recording workflow when relevant
- inspect main-thread flame chart for paint/composite work during pan/zoom
- target: pan/zoom frames dominated by canvas draw calls, not DOM paint
- target: no recurring long tasks during simple viewport movement

## Quality Commands

For implementation work, expected verification is:

- `pnpm -C frontend exec vitest run <changed test paths>`
- broader targeted frontend tests around canvas-flow, dnd-kit, sections, edge handles, minimap, and controls
- `./check_quality.sh` before finishing unless the scope is explicitly narrowed

Run browser/CDP visual and performance verification for the final UI change. A docs-only plan does not need CDP verification.

## Risks And Decisions To Revisit

### Browser API Stability

The API is experimental. The plan intentionally requires the native API and fails loudly when missing. If Chromium changes method names or behavior, update the native gate and renderer directly.

### React Events Inside Canvas

The first probe must verify React synthetic events through canvas children. If React delegation has an issue, switch node children to a React portal host owned by the canvas child tree or attach native event bridges only where required.

### Paint Event Granularity

If `paint.changedElements` is not reliable enough for nested node updates, fall back to a `MutationObserver` per direct node child that only schedules `canvas.requestPaint()` and a draw. This is not a compatibility fallback; it is a dirty-tracking implementation detail.

### Canvas 2D Copy Cost

If Canvas 2D `drawElementImage` copies too much per visible node, the next renderer should be WebGL with one texture per visible node using `texElementImage2D`. The DOM structure, viewport store, culling, and interaction design stay the same.

### Very Large Nodes

Huge sections can create huge element snapshots. Culling is mandatory. If individual node snapshots still cause stalls, add per-section rendering policy:

- visible large nodes render normally
- partially visible huge nodes can draw clipped source regions if the API implementation supports source rects well
- far-away nodes remain mounted but are not drawn

### DOM Mount Cost

This plan initially keeps all top-level node DOM mounted to avoid rewriting section state lifecycles. If idle DOM cost remains high after canvas pan/zoom, add windowed mounting as a separate refactor with explicit keep-mounted exceptions for active/focused/running sections.

## Success Criteria

- No `forks/xyflow` imports remain in frontend runtime code.
- Pan/zoom no longer applies a viewport CSS transform to the section DOM tree.
- Section contents are still real HTML and require no wholesale rewrite.
- Native input, focus, hover, and click behavior work inside canvas-rendered nodes.
- Edges/grid/selection render through canvas, not transformed SVG under a DOM viewport.
- Programmatic viewport actions still work for AI follow, project chat windows, minimap, controls, and fit view.
- Browser profiling shows pan/zoom hitching is not dominated by DOM paint/composite work.
