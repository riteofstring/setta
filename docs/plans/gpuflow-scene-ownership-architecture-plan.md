# GpuFlow Scene Ownership Architecture Plan

## Goal

Move the remaining live project-canvas scene ownership into `GpuFlow`.

The section-resizing move was the right first step, but the long-term
architecture should be broader: every high-frequency canvas geometry and
interaction-projection concern should have one owner, and that owner should be
`GpuFlow`.

The target state is:

- `GpuFlow` owns live canvas-scene geometry, hit testing, pointer projection,
  interaction-frame scheduling, and renderer-visible overlays.
- Project frontend code owns Setta-specific policy, permissions, optimistic
  state changes, and durable persistence callbacks.
- Go remains the source of truth for canonical behavior, validation, endpoint
  shapes, generated contracts, and correctness-sensitive runtime rules.
- HTML section components own content rendering inside dimensions supplied by
  the graph; they do not own top-level graph geometry.

This is a clean-break plan. Do not add backward compatibility, legacy support,
migrations, old/new mode switches, transitional adapters, dual-read/write
paths, or silent fallback behavior. When a responsibility moves to `GpuFlow`,
remove the previous owner in the same implementation slice.

## Architecture Decision

`GpuFlow` should own all live state needed to answer these questions without
reading layout back from screen DOM:

- where each canvas node is
- how large each canvas node is
- which node, port, handle, edge, label, or overlay is under a pointer
- where an edge endpoint is
- what selected-node bounds are visible
- how group drag, resize, reconnect, and selection update the scene per frame
- which source DOM surface must be aligned for native interaction
- which HTML texture or tile must be size-dirtied or content-dirtied

Project/state modules should answer different questions:

- is the user allowed to move, resize, connect, reconnect, or edit this object?
- what Setta-specific policy applies?
- what optimistic project update should be committed on stop?
- which backend operation persists the final result?
- which Go-owned contract or generated type defines the durable shape?

The performance reason is straightforward: the WebGPU/html-in-canvas hot path
is efficient when it redraws from known scene data. It becomes fragile when it
has to rediscover graph geometry through `getBoundingClientRect()`,
`ResizeObserver`, React overlay transforms, or global stores that were not
designed as renderer scene state.

The maintainability reason is also straightforward: a graph renderer should
have one geometry model. Adapters can translate Setta policy into that model,
but the renderer should not depend on scattered project-state side effects to
know where its own objects are.

## Current Ownership Gaps

### Live Node Layout

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  builds `GpuNodeLayout[]` from `useNodeInternals` and passes it into
  `GpuFlow`.
- `frontend/src/state/actions/nodeInternals.ts` mutates the global node map for
  GPU resize, intrinsic size, drag, fit view, selection bounds, and edge-handle
  scheduling.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectNodeResize.ts`
  correctly keeps Setta resize policy and persistence outside the generic
  `GpuFlow` resize controller.

Recommended move:

- Move the live renderer layout store into `frontend/src/gpuFlow/`.
- Let the project adapter initialize that store from project state and commit
  durable updates on drag/resize/auto-size stop.
- Keep `useNodeInternals` only as a project-facing durable-layout surface while
  removing it as the renderer's live source.

Long-term target:

- `GpuFlow` owns `GpuNodeLayout` records, z ordering, measured/intrinsic
  dimensions relevant to rendering, dirty geometry flags, and visible set
  invalidation.
- Project adapters receive structured layout-change events and decide how to
  update Setta state.
- Renderer frames never need to reconstruct node geometry from React/global
  project state during an active interaction.

### Edge Handle And Port Geometry

Current files:

- `frontend/src/state/actions/edgeHandles.ts` registers handle elements,
  measures them with `getBoundingClientRect()`, and converts screen coordinates
  to flow coordinates.
- `frontend/src/gpuFlow/Handle/index.tsx` registers DOM handles with the global
  edge-handle registry and observes their size.
- `frontend/src/components/Pages/Project/gpuProjectEdgeScene.ts` builds the GPU
  edge scene from `useNodeInternals` plus edge-handle positions.

Recommended move:

- Move port geometry into `GpuFlow` as source-local handle descriptors plus the
  current `GpuNodeLayout` transform.
- Register handles by semantic metadata, local rect, side, type, and port id,
  not by screen-DOM measurement.
- Build edge paths, hit regions, reconnect anchors, and minimap/selection
  dependencies from the `GpuFlow` scene model.

Long-term target:

- Edge endpoints are computed from node-local coordinates and live node layout.
- Handle measurement, when needed for intrinsic local handle size, stays
  source-local and does not use screen transforms as the source of truth.
- Moving, resizing, panning, zooming, or projecting a source DOM element does
  not invalidate endpoint correctness.

This is one of the highest-value moves after the live layout store. The current
screen-DOM measurement model conflicts with html-in-canvas because passive
source DOM intentionally does not represent visual graph placement.

### Selected-Node Bounds And Group Drag

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/nodeSelectionOverlay.tsx`
  renders a React DOM selected-node overlay outside `GpuFlow`.
- The same file owns group drag, keyboard nudge, auto-pan, temporary z-index
  behavior, and selection bounds shifting.
- `frontend/src/gpuFlow/interactions/nodeDrag.ts` already owns generic node drag
  behavior for direct node dragging.

Recommended move:

- Move selected-node bounds rendering, group drag, keyboard nudge, and auto-pan
  into `GpuFlow` interaction modules.
- Keep Setta-specific permission checks and final persistence in the project
  adapter.
- Render the selected bounds through the renderer overlay path or a minimal
  `GpuFlow`-owned hit target, not as a project page sibling that duplicates
  viewport transforms.

Long-term target:

- Single-node drag and selected-group drag share one generic drag engine.
- Selection bounds are derived from the live `GpuFlow` layout store.
- Keyboard movement and pointer movement produce the same structured
  `GpuNodeLayoutChange` events.
- Project code only answers "can this section move?" and "how should the final
  move commit?"

### Edge Labels And Reconnect Anchors

Current files:

- `frontend/src/gpuFlow/GpuEdgeLabels.tsx` renders edge labels as DOM elements
  in a viewport-transformed layer.
- `frontend/src/gpuFlow/GpuEdgeReconnectAnchors.tsx` renders reconnect anchors
  as DOM elements and delegates pointer start into the old handle connection
  handler.
- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx` mounts edge labels and
  reconnect anchors as DOM siblings outside the WebGPU canvas.

Recommended move:

- Move edge labels and reconnect anchors into the `GpuFlow` scene and hit-test
  pipeline.
- Render simple labels through GPU text or label HTML surfaces, depending on
  text-quality requirements.
- Hit-test reconnect anchors through `GpuFlow` edge interaction geometry and
  start reconnect from a generic interaction controller.

Long-term target:

- Edge labels, reconnect anchors, edge hit regions, and edge draw buffers are
  built from one edge scene.
- Reconnect anchor visuals do not require a second DOM layer synchronized to
  viewport transforms.
- Project code supplies validity checks and `onReconnect` callbacks only.

### Intrinsic Auto-Size Measurement

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectNodeIntrinsicSize.ts`
  owns `ResizeObserver`, `MutationObserver`, rAF dirty batching, intrinsic
  dimension measurement, Setta min/max policy, and node-internals updates.
- `frontend/src/state/actions/nodeInternals.ts` applies intrinsic size updates
  into the same global node map used by live GPU layout.

Recommended move:

- Keep DOM measurement because intrinsic auto-size is genuinely content-owned.
- Move the scheduler, dirty node set, and renderer layout application into
  `GpuFlow`.
- Keep Setta size-mode policy and min/max clamps in the project adapter.

Long-term target:

- Source DOM reports "my intrinsic content size may have changed."
- `GpuFlow` schedules and applies the measurement to the live layout store.
- The project adapter decides whether `auto`, `auto_only`, min/max, and section
  policy allow a layout change.
- Manual resize does not depend on this measurement path.

### Focus, Reveal, And Source-Local Geometry

Current files:

- `frontend/src/gpuFlow/flowGeometry.ts` still falls back to section refs and
  `getBoundingClientRect()` for section rects and focus movement.
- `frontend/src/utils/focusManager.ts`, `state/actions/sections/createSections.ts`,
  `state/actions/sections/sectionPositions.ts`,
  `state/actions/copyPaste.ts`, and other project actions consume those helpers.

Recommended move:

- Move focus/reveal geometry to `GpuFlow` layout queries.
- Keep viewport and pane calculations in `GpuFlow`, but expose small public
  query helpers for project actions.
- Remove DOM rect fallbacks for top-level canvas graph nodes.

Long-term target:

- "Move the pane to include section X" uses `GpuFlow` node bounds.
- Copy/paste bounds, create-section placement, AI-follow bounds, and section
  reveal logic use the same renderer layout model as the canvas.
- DOM rect reads are reserved for normal non-canvas UI and source-local
  intrinsic measurement.

### Floating Portals And Tooltips

Current files:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  mounts the CodeMirror tooltip root and Setta popover portal root inside
  `GpuFlow` children.
- `frontend/src/components/Pages/Project/gpu-flow-project.css` positions those
  roots as tiny absolute DOM containers.

Recommended move:

- Add a `GpuFlow` overlay/portal manager that classifies portals by coordinate
  space:
  - flow-anchored portals
  - source-local portals
  - viewport/global app portals
- Flow-anchored and source-local portals should be represented as GPU surfaces
  or projected source DOM targets.
- Viewport/global app portals should be normal DOM siblings outside the
  layout-subtree canvas.

Long-term target:

- A tooltip anchored to text inside a node follows the same source-local to
  visual projection as pointer interaction.
- A global menu or app popover is not hidden inside the html-in-canvas source
  layer.
- Portal placement does not rely on accidental DOM layering around a canvas
  child that may not visually composite.

## Reference Lessons

Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as the
local reference root. These examples are relevant to this ownership plan:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/raycastInteractionManager.ts`
  - Best reference for pointer projection. It raycasts the visual surface to UV,
    translates that to source-local coordinates, moves the real source element
    for native hit testing, and lets browser DOM behavior handle the final
    target.
  - Apply this lesson to handles, ports, edge reconnect anchors, and
    source-local portal anchoring: visual geometry belongs to the renderer;
    source DOM is projected for interaction.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/random-stuff/apps/curved-markup/src/App/index.tsx`
  - Compact example of interactive DOM rendered on a curved surface. It proves
    native controls can remain interactive while visual placement is
    renderer-owned.
  - Apply this lesson to Setta's selected-node overlays and portal strategy:
    do not build architecture that assumes the visual node is a flat DOM layer.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas/plugins/html-cloth.mjs`
  - Shows HTML as a source texture on a deforming mesh with interaction mapped
    through the rendered surface.
  - Apply this lesson to future edge/overlay hit testing: hit regions should be
    scene data, not DOM boxes in screen space.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/multi-element-composition/demo.html`
  - Shows multiple direct canvas children, draw-order-controlled composition,
    source transforms, changed elements, and direct manipulation of only the
    affected child.
  - Apply this lesson to Setta's node sources, label surfaces, and dirty
    scheduling: a changed child should dirty only its owning surface or overlay.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlTexture.ts`
  - Shows texture lifecycle tied to paint events while retaining the source
    element for interaction.
  - Apply this lesson to intrinsic auto-size and portal surfaces: measurement
    and texture refresh should be explicit renderer-scheduled work.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlInCanvasPolyfill.ts`
  - Shows observer-driven dirty marking coalesced through rAF.
  - Apply this lesson to intrinsic auto-size scheduling, not to manual resize or
    high-frequency drag as a source-of-truth mechanism.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Shows explicit WebGPU resource ownership when size-dependent resources
    change.
  - Apply this lesson to node resize, label surfaces, and portal surfaces:
    geometry changes should explicitly dirty size-dependent resources.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/3d-room-live-content/demo.html`
  - Documents practical constraints around layout-subtree sources needing to
    stay laid out and painted.
  - Apply this lesson to portal and source-host placement: hidden staging must
    be intentional and renderer-owned.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/README.md`
  - Documents direct canvas-child constraints, paint events, changed elements,
    and transform behavior.
  - Treat this as the browser contract reference for source-layer and portal
    decisions.

The common lesson across these examples is that source DOM should remain real,
but visual geometry and interaction projection should be renderer-owned. Setta
should not rebuild DOM-overlay versions of graph objects once those objects are
part of the canvas scene.

## Target GpuFlow Modules

The exact file names can change during implementation, but the long-term
ownership should look like this:

- `frontend/src/gpuFlow/layoutStore.ts`
  - Live `GpuNodeLayout` records.
  - Batched layout mutation API.
  - Dirty flags for node geometry, edge geometry, selection bounds, visible set,
    texture size, and source size.
  - Public query helpers for bounds, hit testing, focus/reveal, fit view, and
    minimap.
- `frontend/src/gpuFlow/layoutStore.test.ts`
  - Tests for batched updates, changed-node sets, bounds queries, z ordering,
    and dirty dependency propagation.
- `frontend/src/gpuFlow/ports/portGeometry.ts`
  - Source-local handle descriptors.
  - Local rect measurement and semantic port registration.
  - Flow-space endpoint calculation from live node layout.
- `frontend/src/gpuFlow/ports/portGeometry.test.ts`
  - Tests for endpoint calculation across node move, resize, zoom-independent
    flow geometry, and shared-handle fanout.
- `frontend/src/gpuFlow/edges/edgeSceneStore.ts`
  - Edge scene derivation from ports, node layout, and project edge data.
  - Edge labels, reconnect anchors, edge draw inputs, and edge hit regions.
- `frontend/src/gpuFlow/interactions/selectionDrag.ts`
  - Generic selected-node drag, keyboard nudge, auto-pan, cancel, and commit
    events.
- `frontend/src/gpuFlow/interactions/edgeReconnect.ts`
  - Generic reconnect interaction based on edge-scene hit targets.
- `frontend/src/gpuFlow/overlays/overlayScene.ts`
  - Renderer-owned overlay descriptors for selection bounds, labels, anchors,
    lightweight text, and future flow-anchored UI.
- `frontend/src/gpuFlow/portals/portalManager.tsx`
  - Coordinate-space classification for flow, source-local, and viewport/global
    portals.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
  - Project-specific adapter between Setta state and `GpuFlow` layout events.
  - Owns permissions, policy resolution, optimistic commits, and durable
    persistence.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuPortAdapter.ts`
  - Converts Setta section ports/handles into generic `GpuFlow` port
    descriptors.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuPortalAdapter.ts`
  - Classifies CodeMirror, popover, and other project-owned portals into the
    appropriate `GpuFlow` portal space.

Keep these modules generic:

- `gpuFlow/*` must not import Setta project APIs, OpenAPI clients, generated
  settings, section implementation details, or backend persistence helpers.
- Project adapters may import both `gpuFlow/*` and Setta project/state modules.
- If a new durable contract is needed, prefer a Go-owned generated contract
  over a handwritten TypeScript mirror.

## Data Model

Introduce renderer-owned scene records that separate live geometry from durable
Setta state.

`GpuFlowLayoutNode`:

- `nodeId`
- `x`
- `y`
- `width`
- `height`
- `zIndex`
- `tempZIndex`
- `sourceElement`
- `sourceLocalBounds`
- `interactionFlags`
- `textureInvalidation`

`GpuFlowPortDescriptor`:

- `nodeId`
- `portId`
- `type`
- `side`
- `localRect`
- `isConnectableStart`
- `isConnectableEnd`
- `metadata`

`GpuFlowPortEndpoint`:

- `nodeId`
- `portId`
- `type`
- `side`
- `x`
- `y`
- `normal`

`GpuFlowLayoutChange`:

- `phase`: `start`, `change`, `commit`, or `cancel`
- `reason`: `drag`, `resize`, `intrinsic-size`, `keyboard`, `load`, or
  `project-sync`
- changed node ids
- previous and next flow layout for changed nodes
- dirty dependency set

`GpuFlowOverlayDescriptor`:

- `id`
- `kind`
- coordinate space
- bounds or anchor
- z ordering
- hit-test behavior
- optional source-surface owner

Durable Setta layout can still be stored wherever the project state requires.
The key architectural change is that durable state is not the live scene store
during high-frequency interactions.

## Implementation Phases

### Phase 1: Baseline And Invariants

- Record current pan/zoom, node drag, resize, edge reconnect, selection drag,
  keyboard nudge, and tooltip behavior.
- Add or update focused tests around current project adapters where behavior is
  unclear.
- Capture performance baselines for dense pan/zoom and selection/group drag.
- Record performance results in `perf/` if this work changes runtime behavior.

Exit criteria:

- The existing behavior to preserve is explicit.
- The paths to remove are known.
- There is no plan to keep old and new ownership active together.

### Phase 2: Add The GpuFlow Layout Store

- Add the renderer-owned layout store and query API.
- Initialize it from project state through `projectGpuLayoutAdapter`.
- Route node drag and node resize live updates through the layout store.
- Emit structured layout-change events back to the project adapter.
- Remove direct renderer dependency on `useNodeInternals` for live frame
  geometry.

Exit criteria:

- `GpuFlow` can render, pan, zoom, drag, and resize using its own live layout.
- Project state receives final commits through adapter callbacks.
- No interaction frame has to rebuild live node geometry from project state.

### Phase 3: Move Port And Edge Endpoint Geometry

- Replace screen-DOM handle measurement with source-local port descriptors.
- Build edge endpoints from `GpuFlow` layout plus port descriptors.
- Update edge-scene derivation to consume renderer-owned endpoints.
- Remove top-level graph dependency on `state/actions/edgeHandles.ts`.

Exit criteria:

- Edge endpoints remain correct during pan, zoom, node drag, node resize, and
  source DOM projection.
- Port geometry is testable without mounting viewport-transformed DOM overlays.

### Phase 4: Move Selection Bounds And Group Movement

- Move selected-node bounds calculation into the layout store.
- Move group drag, keyboard nudge, and auto-pan into
  `gpuFlow/interactions/selectionDrag.ts`.
- Replace `GpuProjectNodesSelectionOverlay` with a renderer-owned overlay or
  hit target.
- Keep Setta move permissions and final z-index/project commits in the project
  adapter.

Exit criteria:

- Single-node and selected-group movement use one layout-change pipeline.
- Selection bounds do not duplicate viewport transform logic outside `GpuFlow`.
- Keyboard nudge and pointer drag share commit semantics.

### Phase 5: Move Edge Labels And Reconnect Anchors

- Fold label descriptors, reconnect anchor descriptors, and edge hit regions
  into the edge scene.
- Render labels and anchors through the renderer overlay system or HTML
  surfaces.
- Start reconnect from a generic `GpuFlow` edge interaction controller.
- Remove DOM viewport layers for labels and reconnect anchors.

Exit criteria:

- Edge visual overlays and edge hit targets are derived from one edge scene.
- Reconnect works without the old DOM anchor layer.

### Phase 6: Move Intrinsic Auto-Size Scheduling

- Move intrinsic dirty scheduling into `GpuFlow`.
- Keep Setta `auto`, `auto_only`, min/max, and section-policy decisions in the
  project adapter.
- Apply accepted intrinsic dimensions to the layout store.
- Commit durable auto-size results according to existing Setta semantics.

Exit criteria:

- Intrinsic measurement is still DOM-based, but the live layout update is
  renderer-owned.
- Manual resize and intrinsic auto-size are separate pipelines.

### Phase 7: Move Focus, Reveal, And Placement Queries

- Replace top-level canvas-node DOM rect reads in `flowGeometry.ts` with layout
  store queries.
- Update copy/paste bounds, create-section placement, AI follow, selection
  bounds, and focus/reveal code to use those queries.
- Remove `getBoundingClientRect()` fallback behavior for top-level graph
  geometry.

Exit criteria:

- Any top-level graph bounds query returns renderer scene bounds.
- DOM rect reads remain only for non-canvas UI or source-local intrinsic
  measurement.

### Phase 8: Add Portal And Overlay Manager

- Add coordinate-space classification for project portals.
- Move flow-anchored portals into renderer-owned overlays or HTML surfaces.
- Keep global app popovers as normal DOM outside the canvas source layer.
- Document which portal types are supported in each coordinate space.

Exit criteria:

- Tooltips and popovers no longer rely on accidental canvas-child visual
  behavior.
- Flow-anchored UI follows renderer projection rules.

### Phase 9: Remove Old Owners

- Delete the project-level selected-node overlay once replaced.
- Delete top-level graph use of `state/actions/edgeHandles.ts`.
- Delete DOM viewport layers for labels and reconnect anchors.
- Delete top-level graph DOM rect fallbacks.
- Delete any now-unused tests, mocks, styles, and comments that describe the
  previous ownership model.

Exit criteria:

- Each moved concern has exactly one owner.
- There are no compatibility shims, old/new switches, transitional bridges, or
  silent fallbacks.

## Performance Requirements

Pan and zoom:

- Do not call `requestPaint()` because the viewport moved.
- Do not upload HTML textures because the viewport moved.
- Do not force React renders for passive nodes.
- Do not rewrite source DOM transforms for every node.
- Allow bounded vertex-buffer changes only when the visible set changes.

Drag and resize:

- Use one rAF-coalesced layout update per frame.
- Update only changed nodes and directly affected edge/overlay dependencies.
- Do not measure screen DOM for live graph geometry.
- Do not call OpenAPI on pointer move.
- Dirty only affected textures or size-dependent resources.

Edge and port updates:

- Endpoint recomputation should be proportional to affected nodes/edges, not
  total DOM size.
- Panning and zooming should not trigger endpoint recomputation from DOM.

Intrinsic auto-size:

- Observer events can mark source nodes dirty.
- Measurement must be coalesced.
- Accepted size updates must enter the same layout store as drag and resize.

## Verification Plan

Focused tests:

- `pnpm -C frontend exec vitest run src/gpuFlow/layoutStore.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/ports/portGeometry.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/interactions/nodeDrag.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/interactions/nodeResize.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/interactions/selectionDrag.test.ts`
- Existing tests for `projectNodeResize`, `projectNodeIntrinsicSize`,
  `gpuProjectEdgeScene`, edge reconnect, and selection behavior as they move.

Browser verification:

- Use the documented Chrome flags for WebGPU/html-in-canvas.
- Verify dense pan/zoom remains texture-cache driven.
- Verify node drag, group drag, resize, reconnect, keyboard nudge, selection,
  focus/reveal, CodeMirror tooltips, and project popovers.
- Use Chrome DevTools visual checks for every UI-visible phase.

Quality verification:

- Run the relevant focused tests after each phase.
- Run `./scripts/quality/check.sh` before finishing implementation changes
  unless the developer explicitly narrows verification scope.
- For performance-relevant phases, baseline first, re-measure after, and record
  before/after results in `perf/` as append-only reports.

## What Should Not Move To GpuFlow

Keep these outside `GpuFlow`:

- Go-owned contracts, validation, endpoint shapes, and canonical behavior.
- OpenAPI/generated client usage.
- Setta section permissions and share capabilities.
- Setta-specific resize, drag, connection, and persistence policies.
- Durable project layout persistence.
- Section content rendering and nested section layout.
- Business rules for section implementations, attached terminals, and
  project-state side effects.

The current `projectNodeResize.ts` pattern is the right boundary: generic
pointer lifecycle, live geometry, and frame scheduling in `GpuFlow`; Setta
policy and final persistence in the project adapter.

## Non-Goals

- Keeping old project-state or DOM-overlay owners alive after a concern moves.
- Supporting a non-GPU top-level graph path.
- Adding compatibility flags or dual runtime modes.
- Moving Setta domain policy into generic renderer modules.
- Replacing all DOM measurement. Intrinsic content size still needs DOM
  measurement, but it should not be the source of truth for live graph
  geometry.
- Rewriting section internals or nested-section layout as part of this plan.
- Adding handwritten TypeScript mirrors for Go-owned contracts.

## Final Ownership Model

The final architecture should be easy to summarize:

- `GpuFlow` is the live scene graph and renderer runtime.
- Source HTML is real, direct canvas-child DOM used for content, capture,
  accessibility, and native interaction projection.
- Project adapters translate Setta policy into generic renderer options and
  commit final results back to project state.
- Go owns the durable contracts and correctness-sensitive behavior.

When a future feature asks where a canvas node, port, edge, label, overlay, or
source-local interaction target lives during a frame, the answer should be
`GpuFlow`.
