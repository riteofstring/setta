# HTML-in-Canvas Zoomed-Out Performance Investigation Plan

## Goal

Identify and fix the real cause of poor CanvasFlow pan/zoom performance when zoomed out and many HTML-backed nodes are visible.

The plan deliberately avoids assuming that HTML-in-Canvas itself is too slow. The public API materials and demos show that real interactive HTML can be drawn into canvas smoothly in several graphics-heavy contexts. Our first job is to isolate which part of our current architecture is scaling badly with visible node count.

## Source Context

- Current implementation:
  - `frontend/src/components/Pages/Project/UiPage.tsx`
  - `frontend/src/canvasflow/CanvasFlow.tsx`
  - `frontend/src/canvasflow/CanvasFlowCanvas.tsx`
  - `frontend/src/canvasflow/CanvasFlowInteractions.ts`
  - `frontend/src/canvasflow/CanvasFlowNodeLayer.tsx`
  - `frontend/src/canvasflow/canvasFlowPaint.ts`
  - `frontend/src/canvasflow/canvasFlowGeometry.ts`
- Related plans:
  - `docs/plans/html-in-canvas-pan-zoom-plan.md`
  - `docs/plans/canvasflow-pan-zoom-performance-plan.md`
- Existing perf report:
  - `perf/reports/frontend/2026-04-27_html-in-canvas-pan-zoom-matrix.md`

## External API Notes

These notes come from the WICG explainer, Chrome Platform Status, Blink intent thread, Chromium runtime feature entry, and the current demo/API documentation linked from `docs/plans/html-in-canvas-pan-zoom-plan.md`.

- HTML-in-Canvas is intended for real HTML content inside 2D and 3D canvas scenes, including rich content boxes, in-game menus, forms, accessibility-preserving fallback content, and HTML used as WebGL/WebGPU textures.
- `layoutsubtree` opts canvas descendants into layout, hit testing, and accessibility.
- `drawElementImage()` draws a direct child of the canvas and returns a transform that can be applied to the same element for DOM hit-testing alignment.
- A canvas child must be a direct child and must have generated boxes. It cannot be `display: none`.
- CSS transforms on the source element are ignored for drawing, but still affect hit testing and accessibility.
- `paint` is tied to browser rendering updates. Calling `drawElementImage()` inside `paint` uses the current-frame snapshot; outside `paint`, it uses the previous snapshot.
- `requestPaint()` is the intended way to request another `paint` event for app-driven animation or camera movement.
- `PaintEvent.changedElements` exists and can identify children whose rendering changed.
- `captureElementImage()` can capture a transferable `ElementImage` for worker or cached rendering paths.
- WebGL/WebGPU paths exist through `texElementImage2D` and `copyElementImageToTexture`.
- Chromium currently exposes this behind the `CanvasDrawElement` runtime feature. Chrome Platform Status lists the feature as in development/experimental, with origin-trial naming under `HTMLInCanvas`.

## Corrected Diagnosis

The worst behavior is reported when zoomed out and many nodes are shown. That strongly suggests a visible-node-count bottleneck, not primarily a cost from mounted-but-not-drawn nodes.

The most likely visible-count-sensitive costs in the current code are:

1. `paintCanvasFlow()` calls `ctx.drawElementImage()` once per visible node every paint.
2. `paintCanvasFlow()` applies the returned transform to every visible node wrapper so hit testing remains aligned.
3. `getVisibleNodeDrawRecords()` linearly scans all registered nodes every paint.
4. Edge drawing may scale with total edge count rather than visible/relevant edge count.
5. Canvas paint instrumentation currently includes per-node timing calls in the hot loop.
6. Minimap, ResizeObserver, layout persistence, and legacy xyflow store synchronization may still add adjacent work during gestures.
7. Rich `SectionContainer` contents may be significantly more expensive than the simple TextBlock perf matrix suggests.

The right next step is an isolation matrix. Do not start with low-detail rendering, bitmap caching, or active-node overlays until measurements show which cost dominates.

## Investigation Matrix

Use the same large real project view where zoomed-out pan/zoom is bad. Settings project, All Settings view is acceptable if it is the easiest reproducible rich-node case.

Record each variant with the same initial viewport, zoom level, visible node count, and scripted pan/zoom gesture.

### Baseline

- Current CanvasFlow behavior.
- Record:
  - visible node count
  - drawn node count
  - mounted node count
  - registered node count
  - edge count
  - pan FPS and p95 input latency
  - `drawElementImageMs`
  - transform assignment time
  - total paint time
  - scripting, style, layout, paint, composite trace buckets
  - React commits during gesture
  - ResizeObserver loop errors
  - `setTopLevelSectionLayout` requests
  - `setViewport` requests

### Variant A: No Edges

Temporarily skip `drawCanvasFlowEdges()` and connection preview drawing.

Purpose: determine whether edge drawing is a major zoomed-out cost.

Expected interpretation:
- Large improvement means add edge culling, edge spatial indexing, or zoom-dependent edge simplification.
- Little improvement means node drawing/sync/app plumbing is more likely.

### Variant B: Rect Nodes Only

Keep node visibility calculation, but replace `drawElementImage()` with simple canvas rectangles using each node's screen rect.

Purpose: isolate the browser HTML snapshot draw cost from all other CanvasFlow work.

Expected interpretation:
- Large improvement means the bottleneck is `drawElementImage()` or source node rendering complexity.
- Little improvement means linear scans, edges, transform sync, minimap, or app subscriptions are more likely.

### Variant C: Draw HTML, Skip Transform Assignment

Call `drawElementImage()` but do not assign `element.style.transform`.

Purpose: measure the cost of per-visible-node DOM transform synchronization separately from HTML drawing.

Important: this variant is not shippable because hit testing will be wrong. It is diagnostic only.

Expected interpretation:
- Large improvement means transform sync/hit-testing alignment is the problem.
- Little improvement means `drawElementImage()` or surrounding work is more likely.

### Variant D: Simple HTML Cards

Replace each `SectionContainer` body with a simple fixed HTML card while preserving node count, positions, dimensions, and CanvasFlow paint behavior.

Purpose: determine whether real section content complexity is the draw/snapshot cost.

Expected interpretation:
- Large improvement means rich node internals are the problem. Investigate expensive CSS, CodeMirror, terminals, iframes, shadows, filters, and dynamic subtrees.
- Little improvement means cost is in renderer structure or visible-count scaling.

### Variant E: Minimap Off

Disable `ResponsiveMiniMap` for the same gesture.

Purpose: check whether live viewport minimap updates or SVG node rendering are contributing during pan/zoom.

Expected interpretation:
- Large improvement means minimap should update its viewport mask imperatively or use a canvas/static node representation.
- Little improvement means minimap is not primary.

### Variant F: ResizeObserver and Layout Persistence Off

Temporarily disable node ResizeObserver processing and top-level layout persistence during the gesture.

Purpose: check whether measuring/persistence work is still accidentally triggered by pure viewport motion.

Expected interpretation:
- Any repeated layout requests or ResizeObserver loop errors during pure viewport motion are bugs to fix before renderer changes.

### Variant G: Spatial Query Prototype

Replace linear visible-node scanning with a simple spatial index or precomputed grid for the test fixture.

Purpose: test whether per-paint O(total nodes) visibility scanning matters at the problematic graph sizes.

Expected interpretation:
- Improvement means implement a production node/edge spatial index.
- No improvement means drawing/sync dominates.

## Decision Tree

Use the isolation data to choose the smallest real fix.

- If edge-off is the big win:
  - Add edge visibility culling first.
  - Add edge spatial indexing if edge count is high.
  - Consider zoom-dependent edge category simplification only after culling.

- If rect-only is the big win and simple HTML cards are fast:
  - Rich section content is expensive to draw or snapshot.
  - Audit CSS and embedded surfaces inside nodes.
  - Prioritize reducing expensive node internals before adding renderer-level tricks.

- If rect-only is the big win and simple HTML cards are also slow:
  - `drawElementImage()` call count or browser implementation cost is the likely bottleneck.
  - Investigate `captureElementImage()` caching and WebGL/WebGPU texture paths.

- If skipping transform assignment is the big win:
  - Keep Model A for active/interactive nodes.
  - Investigate reducing transform sync to currently hit-testable nodes.
  - Consider an active-node overlay or canvas hit testing only if necessary.

- If minimap-off is the big win:
  - Stop re-rendering minimap SVG on every live viewport update.
  - Update only the viewport mask imperatively, or move minimap rendering to canvas.

- If ResizeObserver/layout-persistence-off is the big win:
  - Fix no-op dimension updates and gesture-time persistence before changing rendering.

- If spatial query prototype is the big win:
  - Build production spatial indexes for nodes and edges.

## Candidate Fixes After Measurement

### 1. Keep Model A, Fix Accidental Work

This is preferred if HTML drawing itself is not the dominant cost.

- Remove per-node `performance.now()` calls from normal paints.
- Ensure dataset diagnostic writes are fully diagnostic-only or sampled.
- Avoid `schedulePaint()` after no-op dimension updates.
- Prevent pure viewport gestures from triggering layout persistence.
- Keep delayed xyflow store sync and live viewport store separation.

### 2. Add Node and Edge Spatial Indexes

Use world-space indexes so pan/zoom paint cost scales with visible objects, not total project size.

- Nodes: query visible draw records directly from visible world rect plus overscan.
- Edges: index by bounding box of path/endpoints, then draw only visible/relevant edges.
- Keep indexes updated from node position/size and edge endpoint changes.

### 3. Improve Rich Node Draw Cost

If real `SectionContainer` content is the bottleneck:

- Identify expensive section types in the trace.
- Avoid CSS filters, backdrop filters, large shadows, and animated internal effects in node bodies where they materially hurt snapshotting.
- Verify CodeMirror, terminal, iframe, image-heavy, and nested DnD surfaces separately.
- Keep fixes section-type-specific and evidence-driven.

### 4. Snapshot Cache Stable Nodes

Only pursue this if repeated `drawElementImage()` calls dominate.

- Use `PaintEvent.changedElements` to invalidate cached node images.
- Explore `captureElementImage()` for transferable `ElementImage` snapshots.
- Draw cached images during viewport-only motion.
- Keep live HTML drawing for changed, focused, edited, selected, hovered, or active nodes.
- Release cached resources when nodes unmount or content changes.

### 5. Use WebGL/WebGPU Texture Path

Only pursue this if 2D canvas compositing is the bottleneck and caching is insufficient.

- Upload node snapshots as textures through `texElementImage2D` or `copyElementImageToTexture`.
- Render pan/zoom as a GPU transform over textured quads.
- Use `getElementTransform()` or main-thread transform calculation to keep active DOM hit testing aligned.
- This is a bigger renderer shift and should be justified by trace data.

### 6. Gesture-Time Simplification

Only pursue this if users need immediate smoothness and full-fidelity redraw cannot stay in budget.

- During active pan/zoom, draw stable cached snapshots or simplified primitives.
- After gesture end, request a full-fidelity paint.
- Avoid React state changes at LOD thresholds.
- Use hysteresis if any zoom-dependent mode switching is introduced.

This should be a last resort after fixing accidental work and measuring real `drawElementImage()` cost.

## Verification

- Add or extend the existing opt-in Playwright perf harness for the isolation variants.
- Save raw artifacts under `perf/artifacts/frontend/`.
- Save an append-only report under `perf/reports/frontend/`.
- Browser verification should use Chrome/Chromium with `--enable-blink-features=CanvasDrawElement`.
- Verify that real interactive nodes still support:
  - click
  - focus
  - text input
  - keyboard navigation
  - node drag
  - nested controls
  - popovers/tooltips
  - edge handles

## Acceptance Criteria

- The zoomed-out bottleneck is identified with a trace-backed isolation result.
- The chosen fix follows from the dominant measured cost.
- Pure pan/zoom does not trigger repeated layout persistence or ResizeObserver loops.
- Pan/zoom performance improves in the same real rich-node view where the issue was observed.
- Synthetic TextBlock performance does not regress.
- Any move beyond Model A, such as caching or WebGL/WebGPU textures, is justified by measured `drawElementImage()` or transform-sync cost.
