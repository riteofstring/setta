# HTML-in-Canvas Pan/Zoom Replacement Plan

## Goal
Replace the current xyflow-style DOM/SVG pan/zoom renderer with a canvas-owned renderer using Chromium's experimental HTML-in-Canvas API, while keeping existing React-authored section/node contents as much as possible.

The primary success criterion is extremely high performance pan/zoom on large graphs. It is acceptable for this branch to break existing behavior while the renderer is rebuilt.

## Working Assumptions
- There are no users to protect.
- This work happens on a separate branch.
- No compatibility, backward compatibility, legacy support, migrations, transitional UI, or fallback renderer is required.
- Browsers without HTML-in-Canvas support may fail loudly.
- The renderer can bet directly on `layoutsubtree`, `drawElementImage()`, canvas `paint`, and `requestPaint()`.
- Existing node bodies should remain React components. Rewriting the graph renderer is acceptable; rewriting all section/node content is not.

## Source Context
- Current graph entry point:
  - `frontend/src/components/Pages/Project/UiPage.tsx`
  - `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`
- Current pan/zoom hot path:
  - `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  - `frontend/src/forks/xyflow/core/container/Viewport.tsx`
- Current node shell:
  - `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  - `frontend/src/components/Section/Container/SectionContainer.tsx`
- Current edge and handle paths:
  - `frontend/src/forks/xyflow/core/container/EdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`
  - `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`
  - `frontend/src/state/actions/edgeHandles.ts`
- Prototype reference notes:
  - `docs/notes/chatgpt-html-in-canvas-notes.md`

## Current Problem
The current renderer pans and zooms by updating a global viewport transform and applying it to a large DOM subtree:

```text
ReactFlow root
  ZoomPane / d3-zoom
    Pane
      Viewport div with CSS transform
        SVG edge layers
        DOM node layer
          SectionContainer trees
```

This means the browser still has to deal with a large transformed DOM/SVG scene during viewport motion. We have already profiled this as a DOM painting/compositing bottleneck. `will-change: transform` helps somewhat, but it also increases memory/compositing pressure and does not remove the fundamental cost of moving a large DOM scene.

The replacement architecture should make pan/zoom update canvas drawing, not a transformed DOM viewport.

## Decision
Build a hard replacement called `CanvasFlow`.

Use HTML-in-Canvas Model A first:

```text
CanvasFlow root
  <canvas layoutsubtree>
    direct DOM child: node wrapper for section A
    direct DOM child: node wrapper for section B
    direct DOM child: node wrapper for section C

paint event:
  clear canvas
  apply viewport transform
  draw grid/background
  draw edges with canvas paths
  draw visible node DOM children with ctx.drawElementImage()
  apply returned transform to each DOM node wrapper
```

Each node has one DOM instance. That DOM instance is both:
- the source drawn into the canvas with `drawElementImage()`
- the browser target for pointer events, focus, text input, menus, accessibility, and nested controls

Do not build:
- a fallback DOM renderer
- a runtime renderer switch
- a compatibility wrapper around xyflow
- a legacy route for old graph behavior
- support for browsers without the experimental API

## Non-Goals
- Do not preserve xyflow's internal architecture.
- Do not preserve d3-zoom as a requirement if a simpler pointer/wheel implementation is faster.
- Do not preserve SVG edge rendering.
- Do not preserve old CSS transform pan/zoom behavior.
- Do not keep `will-change` pan/zoom workarounds after the canvas renderer is working.
- Do not hand-rewrite section/node bodies unless a specific component cannot work inside HTML-in-Canvas.

## Target Architecture

### CanvasFlow Module
Create a new graph renderer area:

```text
frontend/src/canvasflow/
  CanvasFlow.tsx
  CanvasFlowCanvas.tsx
  CanvasFlowNodeLayer.tsx
  CanvasFlowInteractions.ts
  canvasFlowPaint.ts
  canvasFlowViewport.ts
  canvasFlowGeometry.ts
  canvasFlowEdges.ts
  canvasFlowStore.ts
  canvasFlowSupport.ts
  canvasFlowTypes.ts
```

This can later replace or delete `frontend/src/forks/xyflow/`. During the branch, favor implementation speed and clarity over preserving old file boundaries.

### Root Component
Replace the `ReactFlow` import in `UiPage.tsx` with `CanvasFlow`.

`CanvasFlow` owns:
- the root graph container
- the `<canvas layoutsubtree>` element
- node wrapper refs
- live viewport refs
- canvas sizing
- paint scheduling
- pointer/wheel/pinch handlers
- node visibility/culling

### HTML-in-Canvas Support Check
Add `canvasFlowSupport.ts`:

```ts
export function assertHtmlInCanvasSupport(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof (ctx as any).drawElementImage !== "function") {
    throw new Error("HTML-in-Canvas drawElementImage is not available.");
  }
  if (typeof (canvas as any).requestPaint !== "function") {
    throw new Error("HTML-in-Canvas requestPaint is not available.");
  }
}
```

The app should fail loudly with a clear error. No fallback UI is needed.

### Viewport Model
Use a ref-first viewport:

```ts
type CanvasFlowViewport = {
  x: number;
  y: number;
  zoom: number;
};
```

Rules:
- Pointer/wheel/pinch updates mutate a ref.
- Each viewport mutation schedules `canvas.requestPaint()`.
- React state does not update on every pan/zoom frame.
- Zustand/project state may receive debounced or gesture-end viewport updates for persistence.
- Any UI that needs live viewport information should subscribe to a lightweight external store, not force node re-renders.

### Node Model
Reuse existing node data from `useNodeInternals`.

Node wrapper responsibilities:
- direct child of the canvas
- fixed `position: absolute; left: 0; top: 0`
- fixed width/height from measured node dimensions when available
- `transform-origin: 0 0`
- contain enough layout/paint/style isolation to avoid global layout churn
- render `<SectionContainer sectionId={id} isTopLevel={true} />`

The wrapper must not be hidden with `display: none`, because `drawElementImage()` requires generated boxes.

### Edge Model
Replace edge SVG rendering with canvas path rendering.

Initial edge input can still use current project edge data and current handle registry positions:
- data edges from `projectConfig.edges`
- agentic edges from the current agentic renderer source data
- state-machine edges from the current state-machine renderer source data

But the rendered output should be canvas paths, not SVG.

Edge paint should:
- sort by z-index or existing render order
- draw under nodes
- support selected/hover styling later
- support straight and bezier paths first
- add state-machine and agentic edge styling after the base path is stable

### Edge Handle Coordinates
Initial implementation can continue measuring real DOM handle elements because Model A keeps the real node DOM available.

However, pan/zoom itself should not recompute handle positions from DOM. During viewport movement, world-space handle positions do not change. Recompute handles only when:
- node content resizes
- node position changes
- handles mount/unmount
- relevant section/port metadata changes

Follow-up improvement:
- Derive common handle coordinates from node geometry and typed port metadata.
- Keep DOM measurement only for handles whose position depends on internal layout.

### Portals and Tooltips
The current viewport contains portal roots for CodeMirror tooltips and Radix popovers. In CanvasFlow:
- keep stable portal roots in the graph root or canvas subtree as needed
- verify whether a portal inside `<canvas layoutsubtree>` can be drawn and interacted with correctly
- if portal drawing is unreliable, keep portals outside the canvas and reposition them from live DOM anchors

This is not a compatibility path; it is a required part of keeping existing node controls usable.

## Implementation Phases

### Phase 0: Branch Setup and Baseline
1. Create the feature branch.
2. Record current baseline traces for representative graph sizes:
   - 100 nodes
   - 500 nodes
   - 1,000 nodes
   - 2,500 nodes
   - largest realistic local graph available
3. Record at minimum:
   - pan FPS
   - zoom FPS
   - input latency
   - scripting time
   - style/layout time
   - paint time
   - composite time
   - memory
4. Save append-only baseline notes under `perf/`.

### Phase 1: HTML-in-Canvas Skeleton
1. Add `frontend/src/canvasflow/`.
2. Implement `CanvasFlow` with a full-size `<canvas layoutsubtree>`.
3. Add hard support assertion for `drawElementImage()` and `requestPaint()`.
4. Add `ResizeObserver` using `devicePixelContentBoxSize` when available.
5. Add a paint listener that:
   - resets the context
   - clears the canvas
   - draws a basic background
6. Replace `ReactFlow` with `CanvasFlow` in `UiPage.tsx`.
7. Confirm the app fails loudly without the browser flag and reaches a blank canvas with the flag.

Acceptance:
- The graph page mounts `CanvasFlow`.
- Canvas size tracks the viewport.
- No xyflow viewport DOM transform is used.

### Phase 2: Draw Real Section Nodes
1. Render top-level section node wrappers as direct children of the canvas.
2. Reuse `SectionContainer` inside each wrapper.
3. Register wrapper refs by section id.
4. Draw each node in the canvas paint loop:

```ts
const transform = ctx.drawElementImage(
  nodeElement,
  node.position.x,
  node.position.y,
  node.width,
  node.height,
);
nodeElement.style.transform = transform.toString();
```

5. Keep node wrappers interactive.
6. Add instrumentation:
   - visible node count
   - total `drawElementImage()` time
   - transform assignment time
   - total paint time

Acceptance:
- Real section nodes appear through canvas drawing.
- Node click, nested button click, text input, and focus work.
- Pan/zoom is still not implemented or remains minimal.

### Phase 3: Ref-First Pan and Zoom
1. Implement background drag panning with pointer events.
2. Implement wheel zoom around the pointer position.
3. Implement trackpad pan/wheel handling.
4. Implement pinch zoom if practical in the first pass.
5. Update only viewport refs during active gestures.
6. Request canvas paint on every viewport change.
7. Debounce persistence/project state updates until interaction settles.
8. Remove d3-zoom from the active viewport hot path.

Acceptance:
- Panning and zooming move the graph by redrawing canvas.
- React node components do not re-render during viewport movement.
- The old `.react-flow__viewport` transform path is gone.

### Phase 4: Canvas Edge Rendering
1. Port straight and bezier path math from existing edge components into pure canvas drawing helpers.
2. Replace `EdgeRenderer` SVG output with `canvasFlowEdges.ts`.
3. Draw edges before nodes in the paint loop.
4. Use current edge handle positions as world coordinates.
5. Add selected/hover styling only after base drawing is stable.
6. Add state-machine edge rendering.
7. Add agentic edge rendering.
8. Remove SVG edge layers from the active renderer.

Acceptance:
- Data edges, agentic edges, and state-machine edges render on canvas.
- Pan/zoom does not trigger SVG or edge React re-renders.

### Phase 5: Node Dragging and Selection
1. Replace or adapt top-level node drag so it updates node positions and schedules canvas paint.
2. During node drag:
   - update the dragged node wrapper transform
   - update affected edge endpoints
   - avoid global React re-render per pointer event where possible
3. Rebuild selection rectangle against world coordinates.
4. Rebuild multi-node drag against world coordinates.
5. Keep keyboard arrow movement for selected nodes.

Acceptance:
- Single-node drag works.
- Multi-node selection and movement work.
- Selection rectangle uses canvas/world coordinates correctly.
- Edge positions follow dragged nodes.

### Phase 6: Culling and Mount Policy
1. Compute visible world rect from viewport and canvas size.
2. Add overscan in world coordinates.
3. First draw only visible + overscan nodes while keeping all nodes mounted.
4. If DOM/layout memory remains high, mount only visible + overscan nodes.
5. Keep unmount/remount hysteresis large enough to avoid churn during small pans.
6. Add a simple spatial index if linear scanning becomes expensive.

Acceptance:
- Large graphs draw only visible nodes.
- Panning across large graphs does not mount/unmount on every tiny movement.
- Paint time scales with visible nodes, not total nodes.

### Phase 7: Portal, CodeMirror, Terminal, and Embedded Surface Pass
Validate the real heavy node content:
- CodeMirror editing and tooltips
- terminal surfaces
- browser/iframe sections
- spreadsheet sections
- draw area sections
- Radix popovers and menus
- context menus
- scrollable group sections
- nested section DnD

For each failure, choose the fastest direct fix:
- keep portal outside canvas and reposition from anchors
- force active/focused node into a normal DOM overlay
- temporarily disable a problematic embedded section type
- add a targeted metadata path for positions

Do not build a generic compatibility layer.

Acceptance:
- The common editable node types remain usable.
- Known broken node types are explicitly listed with a chosen fix or accepted temporary breakage.

### Phase 8: Remove Old Renderer Assumptions
Once the canvas renderer works:
1. Remove active usage of:
   - `ReactFlow.tsx`
   - `Viewport.tsx`
   - DOM/SVG edge renderers
   - d3-zoom hot path
2. Remove viewport-interaction `will-change` and `translateZ(0)` workarounds from section shells.
3. Delete or repurpose xyflow CSS that only exists for the transformed DOM viewport.
4. Repurpose `useReactFlow` only if it remains the real canvas graph store.
5. Delete stale fields like `d3Zoom`, `d3Selection`, and `d3ZoomHandler` after all callers are moved.

Acceptance:
- The codebase has one active graph renderer.
- No old DOM transform pan/zoom path remains.

### Phase 9: Performance Verification and Decision
Repeat the baseline matrix:
- 100 nodes
- 500 nodes
- 1,000 nodes
- 2,500 nodes
- largest realistic local graph

Record:
- pan FPS
- zoom FPS
- input latency
- total paint time
- `drawElementImage()` time per visible node
- transform sync time
- style/layout time
- memory
- visible node count
- mounted node count

Save before/after results under `perf/`.

Decision outcomes:
- If Model A is fast enough, harden it.
- If `drawElementImage()` is fast but DOM transform sync is expensive, move to Model B.
- If `drawElementImage()` is expensive at realistic visible counts, add bitmap caching or lower-detail rendering.
- If specific rich nodes are the bottleneck, use active-node overlay or node-type-specific simplification.

## Model B Contingency
Model B should only start after Model A is measured.

Architecture:
- inactive nodes are canvas-drawn and optionally bitmap-cached
- active, focused, hovered, edited, or dragged nodes become normal DOM overlays
- custom hit testing maps pointer positions to node ids
- canvas owns all inactive interaction feedback

Use Model B if:
- per-frame transform assignment to many DOM nodes dominates
- browser hit testing over many layoutsubtree children becomes expensive
- dynamic node hover/focus invalidation causes frequent canvas snapshots

## Store Strategy
The fastest route is to keep the existing graph-adjacent state where it already owns real app data, but change the renderer semantics.

Keep:
- `useNodeInternals` as the authoritative measured top-level node map
- project section state as the source of section content
- edge handle registry initially, because real DOM handles still exist

Replace or repurpose:
- `useReactFlow.transform` as a canvas viewport value, not a DOM transform driver
- `panBy`, `screenToFlowPosition`, and `rendererPointToPoint` around the new viewport math
- d3-specific fields after caller migration

Important rule:
- Do not preserve old store fields for old behavior. Keep a field only if the canvas renderer or existing node components actively need it.

## Interaction Requirements
The first complete pass should validate:
- background drag pan
- wheel zoom
- pinch zoom where supported
- node body click
- nested button click
- nested text input typing
- CodeMirror typing
- node drag
- selection rectangle
- multi-node drag
- edge creation
- edge reconnect
- context menu
- section menu popover
- scroll inside a node
- keyboard arrow movement
- minimap replacement or temporary removal

Minimap may be removed temporarily if it blocks renderer progress. Rebuild it against the canvas viewport later.

## Testing Plan

### Unit/Vitest
Add tests for pure helpers:
- viewport math
- pointer-centered zoom
- screen/world conversion
- visible world rect calculation
- culling with overscan
- bezier/straight edge path geometry
- edge endpoint derivation

### Component Tests
Add focused tests where jsdom can provide value:
- `CanvasFlow` fails loudly without required API shape
- node refs register/unregister
- culling selects expected node ids
- viewport store updates do not force node list rerender

### Browser Verification
Use Chrome/Chromium with `chrome://flags/#canvas-draw-element` enabled.

Run visual and interaction checks with chrome-devtools:
- initial render is nonblank
- pan is smooth
- zoom is smooth and pointer-centered
- node hit testing matches drawn position
- nested controls receive input
- popovers/tooltips appear in the right place
- edges align with handles
- no obvious text blurring at common zoom levels

### Performance Tests
Add a reproducible graph stress scenario or script that can generate:
- many simple nodes
- many realistic sections
- mixed heavy nodes
- dense edge graphs

Record profiles before and after under `perf/`.

## Acceptance Criteria
- CanvasFlow is the only active project graph renderer.
- Pan/zoom does not move a large DOM/SVG viewport with CSS transforms.
- Pan/zoom does not re-render all React nodes.
- Real section node contents render through HTML-in-Canvas.
- Common node interactions still work.
- Edges render on canvas.
- Large graph pan/zoom is materially smoother than the current renderer.
- Performance notes are recorded under `perf/`.
- Old xyflow pan/zoom assumptions are removed or explicitly scheduled for deletion.

## Suggested Execution Order
1. Baseline profiling.
2. CanvasFlow shell and support assertion.
3. Real node drawing with `drawElementImage()`.
4. Ref-first pan/zoom.
5. Canvas edge rendering.
6. Node drag and selection.
7. Culling and overscan.
8. Heavy node/portal pass.
9. Delete old active renderer paths.
10. Final performance comparison and Model A vs Model B decision.
