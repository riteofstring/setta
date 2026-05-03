# GpuFlow-Owned Section Resizing Plan

## Goal

Move top-level section resizing out of HTML-owned `re-resizable` behavior and
into `GpuFlow`.

The target outcome is one canonical live section size during a resize:
`GpuFlow` node layout. HTML section contents render at the size they are given.
The HTML surface must not mutate its own size first and then rely on DOM
measurement to reconcile the graph.

This plan assumes the GPU surface is the primary project surface. Do not add a
legacy compatibility layer, dual resize owner, or silent fallback path. If an
old non-GPU surface still needs `re-resizable`, keep that isolated from the
GpuFlow path instead of preserving it as a shared top-level section primitive.

## Why This Should Move To GpuFlow

Section size is graph geometry, not section content state. In the html-in-canvas
renderer, graph geometry controls:

- visible node quads
- texture dimensions and resolution policy
- source host dimensions
- hit testing and pointer projection
- edge endpoint placement
- minimap and selection bounds
- viewport culling
- persisted `topLevelSections` layout

The current model lets the inner HTML wrapper resize first. `GpuFlow` then tries
to discover the result through `ResizeObserver` and `updateNodeDimensions`.
That is backwards for html-in-canvas. It can make the section contents resize
while the rendered graph quad remains stale, which is the bug that prompted this
plan.

The correct long-term ownership is:

- `GpuFlow` owns resize gestures, live node bounds, dirty scheduling, and graph
  interaction state.
- Project-specific frontend actions own Setta section size policy and backend
  persistence.
- HTML section components own only content rendering inside the dimensions
  supplied by the graph.

## Current State

Relevant frontend files:

- `frontend/src/components/Utils/Resizable/CustomResizable.tsx`
  - Wraps each section in `ResizableWithScale`.
  - Uses `re-resizable` for pointer gestures, handles, min/max, aspect ratio,
    snap grid, and final size calculation.
  - Calls `setSectionSizes` on resize stop through
    `persistSectionSizeChange`.
  - Sets `gpuFlowViewportStore.nodeResizing` as an interaction flag, but does
    not update `GpuFlow` node layout during the resize.
- `frontend/src/components/Utils/Resizable/ResizableWithScale.tsx`
  - Thin wrapper around `re-resizable`.
- `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx`
  - Mounts `CustomResizable` around `SectionContainerChrome` and
    `CanvasSectionBody`.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
  - Builds `GpuNodeLayout[]` from `useNodeInternals`.
  - Registers source elements with `useProjectNodeResizeObserver`.
  - The observer calls `getNodeUpdateInformation` and
    `updateNodeDimensions`.
- `frontend/src/gpuFlow/htmlSurfaces/frame.tsx`
  - Applies `GpuNodeLayout.width` and `GpuNodeLayout.height` to the source host
    in `configureGpuNodeHostElement`.
  - Builds visible quads from `GpuNodeLayout`.
  - Registers textures with dimensions from the visible quads.
- `frontend/src/state/actions/sections/sectionSizes.ts`
  - Owns existing section size policy helpers such as
    `setSelfParentSiblingChildrenWidths`, `getResizeStartAutoSizeUpdate`,
    `adjustSizeToBeAtLeastMin`, and resize direction classification.
- `frontend/src/state/actions/sectionInfos/viewportUpdates.ts`
  - Debounces `setTopLevelSectionLayout` persistence.

The problematic loop today:

1. `re-resizable` changes the section DOM wrapper dimensions.
2. Section contents reflow inside that wrapper.
3. The `GpuFlow` source host can still have the previous graph dimensions
   because `configureGpuNodeHostElement` sizes it from `GpuNodeLayout`.
4. The graph quad, texture record, hit scene, and persistence only update after
   node dimensions are discovered and propagated.

That ordering is fragile, and it makes DOM measurement the hot-path source of
truth for graph geometry.

## Reference Lessons

Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as the
local reference root. The important lesson for this plan is not a specific API
copy, but the ownership model used by the examples:

- HTML stays as a real source element.
- The renderer owns where and how that source appears visually.
- DOM measurement is useful for intrinsic content and initialization, not for
  high-frequency graph geometry during pointer gestures.
- Resize and paint work is scheduled with `requestAnimationFrame` or explicit
  paint invalidation, not unbounded pointer-event side effects.

High-signal references:

- `three-html-render/src/htmlInCanvasPolyfill.ts`
  - Shows ResizeObserver plus rAF scheduling around source sizing and paint
    scheduling.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Shows explicit render-loop ownership around an HTML source used as a WebGPU
    texture.
- `html-in-canvas/plugins/html-cloth.mjs`
  - Reinforces that interaction projection and visual geometry should be owned
    outside the source HTML.
- `html-in-canvas-official/README.md`
  - Documents direct canvas-child constraints, paint events, and that source
    transforms affect hit testing separately from capture.

Performance-relevant resize references:

- `three-html-render/src/htmlInCanvasPolyfill.ts`
  - `attachObservers` marks affected children dirty and calls a single
    `schedulePaint`, while `schedulePaint` coalesces all dirty work through one
    `requestAnimationFrame`.
  - Use the dirty-set/rAF shape as the scheduling model for resize frames. Do
    not copy the polyfill's broad "all children dirty" behavior for Setta
    manual resize; only the active resized node should be size-dirtied.
- `html-in-canvas-official/README.md`
  - The examples size canvas backing stores with `ResizeObserver` using
    `device-pixel-content-box`, and the explainer documents the selected paint
    timing model as one `paint` event per frame.
  - Apply this to the GpuFlow surface and texture-resolution code, not to manual
    resize ownership. ResizeObserver is suitable for canvas/DPR backing size
    changes and intrinsic measurement, not for discovering a pointer-resized
    graph node.
- `html-in-canvas-cracks/src/main.js` and `html-in-canvas-cracks/README.md`
  - `schedulePaint` coalesces paint work, fast resize uses the actually drawn
    source element as the source of truth, DPR is clamped against max texture
    dimensions, and GPU texture allocation is explicitly refreshed when backing
    dimensions change.
  - The useful Setta lesson is: keep JS-side texture records stable for
    references, but treat backing-size changes as explicit GPU allocation or
    resolution-dirty events. Avoid silently scaling new HTML content into an old
    allocation.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - The WebGPU resize path recreates size-dependent textures/bind groups and
    resets accumulation state on canvas resize.
  - For Setta, resizing a node should explicitly update size-dependent texture
    resources for that node while leaving passive nodes and unrelated renderer
    state alone.
- `compiz-web/src/transitions/TransitionEngine.ts`
  - Separates DPR-aware canvas backing-store resize from HTML element texture
    upload.
  - Keep the same separation in GpuFlow: canvas size, node layout size, and HTML
    texture content upload are related, but they should be independently
    scheduled and measured.
- `three-html-render/src/htmlTexture.ts` and
  `three-html-render/src/threeHTMLRenderer.ts`
  - `htmlTexture.ts` ties texture updates to paint events and keeps the source
    element available for interaction managers. `threeHTMLRenderer.ts` requests
    repaint every frame for CSS animations.
  - For Setta resize, use the paint-driven texture update idea, but do not adopt
    every-frame `requestPaint` except for explicitly animated HTML sources.

## Target Architecture

Add a first-class GpuFlow node resize interaction:

- `GpuFlow` detects resize handles through the rendered hit scene and source
  target descriptors.
- `GpuFlow` captures the pointer on resize start.
- Pointer deltas are converted from screen space to flow space using the current
  viewport zoom.
- Resize math is applied once per animation frame.
- The live result updates node layout state directly.
- Source host dimensions, visual quads, texture registration, hit testing, and
  edge geometry all derive from that same live layout.
- Backend persistence runs only on stop or through the existing debounced
  top-level layout pathway.

HTML section components become passive with respect to top-level size:

- The section root fills its GpuFlow source host with `width: 100%` and
  `height: 100%`.
- Resize handles may still be rendered as HTML for styling and accessibility,
  but they do not run `re-resizable`.
- Handles expose stable metadata such as `data-resize-direction="bottomRight"`.
- The handle visual state is driven by GpuFlow resize interaction state.

Keep `GpuFlow` generic:

- `GpuFlow` should not import Setta section APIs, generated settings, or
  OpenAPI callers.
- Project integration passes resize options and callbacks into `GpuFlow`.
- Setta-specific size policy remains in project/state modules.

## Proposed File Layout

New or changed modules:

- `frontend/src/gpuFlow/interactions/nodeResize.ts`
  - Generic pointer lifecycle and rAF-batched resize controller.
  - Converts screen deltas to flow deltas.
  - Handles pointer capture, cancellation, and interaction flags.
- `frontend/src/gpuFlow/interactions/nodeResize.test.ts`
  - Pure controller tests for start, move coalescing, stop, cancel, zoom-scaled
    deltas, snap grid, and pointer capture behavior.
- `frontend/src/gpuFlow/resizeHandles.ts`
  - Generic resize handle selectors, direction parsing, cursor mapping, and hit
    descriptor helpers.
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectNodeResize.ts`
  - Setta project adapter for node resize.
  - Resolves per-section policy and permissions.
  - Applies live layout updates.
  - Persists final section sizes and top-level layout.
- `frontend/src/components/Section/Container/SectionResizeFrame.tsx`
  - Passive replacement for the top-level GPU path of `CustomResizable`.
  - Renders section chrome/body and resize handles without owning the gesture.
- `frontend/src/state/actions/sections/sectionResizePolicy.ts`
  - Optional extraction target for pure helpers currently embedded in
    `CustomResizable.tsx`.
  - Keep this minimal. Do not duplicate generated or owner-defined types.
- `frontend/src/state/actions/sections/sectionResizePolicy.test.ts`
  - Tests min/max, auto promotion, aspect ratio, snap, and double-click policy
    if those helpers move out of `CustomResizable`.

Likely removals after the GPU path is converted:

- Remove `ResizableWithScale` from top-level project sections.
- Remove `re-resizable` from the top-level GPU section resize path.
- Remove `useProjectNodeResizeObserver` as the active resize owner. Keep a
  narrower intrinsic auto-size observer only if a true auto-size production path
  needs DOM measurement.

## Resize Data Model

Use these concepts:

- `GpuNodeResizePolicy`
  - `enabled`
  - `directions`
  - `minWidth`
  - `maxWidth`
  - `minHeight`
  - `maxHeight`
  - `aspectRatio`
  - `sizeMode`
  - `snapGrid`
  - `snapToGrid`
- `GpuNodeResizeStart`
  - `nodeId`
  - `direction`
  - `pointerId`
  - `startClientPoint`
  - `startFlowSize`
  - `startFlowPosition`
  - `startSectionSize`
- `GpuNodeResizeFrame`
  - latest pointer point
  - clamped next width and height
  - optional next x/y if left/top handles are ever enabled
  - dirty flags for layout, source size, texture, and edge geometry
- `GpuNodeResizeCommit`
  - final graph layout dimensions
  - final Setta `SectionSize` updates
  - affected sibling/attached-terminal section sizes
  - persistence operation ids

For the initial implementation, only preserve the directions Setta currently
enables for sections:

- `right`
- `bottom`
- `bottomRight`

Do not add left/top resizing unless a product requirement appears.

## Interaction Flow

### Pointer Down

1. Resolve the topmost hit surface using the existing GpuFlow hit scene.
2. Determine whether the source target is a resize handle.
3. Resolve the resize direction from stable metadata or handle class.
4. Ask the project adapter for a resize policy.
5. If resizing is disabled, let normal GpuFlow interaction continue.
6. Cancel viewport transitions.
7. Set `gpuFlowViewportStore.nodeResizing = true`.
8. Capture the pointer.
9. Promote `auto` dimensions to concrete numeric dimensions using current
   graph layout, not DOM measurement.
10. Emit the existing height resize start event when the direction affects
    height.

### Pointer Move

1. Store the latest pointer point.
2. Schedule one resize frame with `requestAnimationFrame` if none is pending.
3. In the frame:
   - Convert client delta to flow delta by dividing by viewport zoom.
   - Apply direction semantics.
   - Apply snap grid.
   - Apply min/max.
   - Apply aspect ratio if enabled.
   - Update live node dimensions in the node layout store.
   - Update source host style through the normal `GpuNodeLayout` render path.
   - Mark the active node texture size/content dirty.
   - Mark affected edges and selection bounds dirty.
4. Do not send `setSectionSizes` on pointer move.
5. Do not rely on `ResizeObserver` to discover the size.
6. Do not force React re-render of unrelated nodes.

### Pointer Up

1. Flush any pending resize frame synchronously.
2. Compute final Setta `SectionSize` updates with existing section size policy.
3. Apply optimistic project state with `setSelfParentSiblingChildrenWidths`.
4. Persist `setSectionSizes`.
5. Persist top-level `w` and `h` through the existing top-level layout pathway.
6. Emit the existing height resize end event when appropriate.
7. Release pointer capture.
8. Clear `nodeResizing`.

### Cancel

Cancel on `Escape`, `pointercancel`, `lostpointercapture`, surface unmount, or
window blur:

1. Restore the start layout unless the resize already committed.
2. Clear pending animation frame.
3. Release pointer capture if held.
4. Clear `nodeResizing`.
5. Emit a cancel/end resize event only if existing semantics require it.

## State And Persistence Rules

There must be one live graph-size owner during a resize.

During pointer move:

- Update `useNodeInternals` or the GpuFlow node layout source directly through a
  dedicated action.
- Update active view mode top-level layout in memory if the current architecture
  requires `topLevelSections` to be the source for node dimensions.
- Avoid broad project-state rewrites on every pointer event.
- Do not call OpenAPI.

On pointer stop:

- Use the existing optimistic operation infrastructure for `setSectionSizes`.
- Use the existing debounced `setTopLevelSectionLayout` infrastructure unless
  the implementation introduces a more precise top-level layout commit helper.
- Ensure active view mode layout and base project layout stay consistent with
  existing `viewportUpdates.ts` semantics.

Avoid new duplicated policy logic:

- Reuse `sectionSizes.ts` helpers where they are already authoritative.
- If new non-trivial section size policy is needed, extract it once into a
  shared owner module and test it there.
- If the policy shape needs new generated contracts, prefer the Go-owned
  generation path instead of handwritten frontend mirrors.

## Texture And Paint Rules

Resizing changes both geometry and source dimensions. That means the active
node's texture record must be size-dirtied explicitly.

Expected behavior:

- The visual quad updates from the live node layout in the same animation frame
  as the source host dimensions.
- The active resized node may request paint and upload according to the existing
  active-node upload budget.
- Passive nodes must not upload or request paint because one node is resizing.
- Pan/zoom during or after resize must still use cached texture rendering and
  camera uniforms, not DOM measurement.
- Texture resolution should be recomputed from the final CSS size, DPR, and
  current zoom policy.
- Backing-size changes must explicitly dirty or recreate size-dependent GPU
  resources for the active node. Do not let a resized HTML source be sampled
  through an old allocation that silently stretches or squashes the new content.
- Keep JS-side texture records stable when other renderer objects hold
  references to them, but refresh their underlying GPU allocation or resolution
  metadata when CSS/device-pixel dimensions change.

Do not make `ResizeObserver` the mechanism that tells textures the resized size.
The resize controller already knows the size.

## HTML And CSS Rules

Replace size-owning HTML with passive section layout:

- The top-level section root should fill the GpuFlow source host.
- Internal scroll containers should continue to own their own overflow.
- Resize handles should be stable, fixed-size hit targets that do not resize the
  layout when they hover or become active.
- Existing `NO_DRAG_CLASS_NAME`, `NO_PAN_CLASS_NAME`,
  `SETTA_PREVENT_SECTION_ACTIVE_CSS`, and
  `SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER` semantics should remain on handle
  elements or their GpuFlow equivalents.
- Handles need stable `data-resize-direction` attributes so GpuFlow does not
  depend on Tailwind class names for behavior.

If visual handle rendering remains inside `SectionContainer`, keep it purely
declarative. The imperative gesture must live in GpuFlow.

## Correctness Requirements

The new implementation must preserve:

- position/size lock behavior
- share policy edit permissions
- snap-to-grid behavior
- min and max section dimensions
- `auto` to fixed-size promotion on resize start
- `auto_only` restrictions
- aspect-ratio resize behavior
- attached terminal width propagation
- sibling/child width propagation in non-horizontal groups
- resize start/end events used by height-sensitive content
- double-click/no-op resize behavior where currently intentional
- active view mode layout semantics
- edge endpoint updates
- selection overlay bounds
- minimap bounds
- source hit testing and pointer handoff

If any existing behavior is unclear, characterize it with focused tests before
rewriting it.

## Performance Requirements

Resize pointer movement must be O(1) with respect to total node count except for
bounded updates to directly affected edges and overlays.

During a resize frame, avoid:

- project-wide React rerenders
- measuring every node
- backend calls
- broad `ResizeObserver`-driven geometry discovery
- rewriting DOM transforms for non-active nodes
- uploading textures for passive nodes
- requestPaint loops that are not tied to the active resized node or an
  explicitly animated HTML source

Allowed resize-frame work:

- one rAF-coalesced live size update for the active node
- source host width/height update for the active node
- active node texture invalidation/upload within budget
- active node size-dependent texture allocation or resolution metadata update
- affected edge/selection/minimap geometry updates
- viewport auto-pan if explicitly enabled for resize

Baseline before changing:

- Record a Chrome repro for resizing `settings-section__shortcuts`.
- Capture app-published GPU frame metrics during the drag.
- Record host/section dimensions before, during, and after resize.

Re-measure after:

- Same section, same viewport, same drag distance.
- Record before/after in `perf/` as an append-only report if the change is
  performance-relevant.

## Implementation Phases

### Phase 1: Characterize Current Behavior

- Add focused tests around existing pure resize helpers in
  `CustomResizable.tsx` and `sectionSizes.ts`.
- Add tests for `useProjectNodeResizeObserver` or `updateNodeDimensions` that
  document why ResizeObserver is not sufficient for explicit GPU resizing.
- Capture the current broken behavior from the latest Chrome recording in the
  plan notes or a small repro script if useful.
- Confirm whether any non-GPU code path still needs `CustomResizable`.

Exit criteria:

- The expected resize policies are covered by tests.
- The implementation scope for removing `re-resizable` from GPU sections is
  clear.

### Phase 2: Extract Setta Resize Policy

- Move pure policy helpers out of `CustomResizable.tsx` into a shared owner
  module only as needed.
- Keep the extraction small. Do not create parallel generated types.
- Introduce a project-level policy resolver that can answer:
  - is this node resizable?
  - which directions are enabled?
  - what are min/max dimensions?
  - does aspect ratio apply?
  - what snap grid applies?
  - what state updates should occur on start and stop?

Exit criteria:

- Resize policy can be tested without rendering `re-resizable`.
- `CustomResizable` no longer owns non-UI policy that GpuFlow will need.

### Phase 3: Add Generic GpuFlow Resize Interaction

- Implement `gpuFlow/interactions/nodeResize.ts`.
- Wire it into `GpuFlow` alongside pan/zoom, node drag, selection, edge
  interaction, and edge reconnect.
- Reuse existing hit-scene resolution from `activeNodeTargeting.ts`.
- Add stable resize-handle direction resolution.
- Add pointer capture, rAF batching, cancel paths, and zoom-scaled deltas.

Exit criteria:

- Unit tests prove the generic controller emits live layout updates without DOM
  measurement.
- Existing pan/zoom and node drag tests still pass.

### Phase 4: Add Project Gpu Resize Adapter

- Add `projectNodeResize.ts`.
- Resolve Setta-specific policies from current project/settings/share state.
- Apply live size to node layout/top-level layout state.
- Mark active source texture size/content dirty explicitly.
- Persist final section sizes and top-level layout through existing OpenAPI
  paths.
- Preserve resize event state.

Exit criteria:

- GpuFlow can resize one top-level section without `re-resizable`.
- Section contents and graph quad resize together during pointer move.
- No resize move sends `setSectionSizes`.

### Phase 5: Replace HTML Resize Wrapper In GPU Sections

- Replace the GPU top-level `CustomResizable` path with a passive
  `SectionResizeFrame`.
- Keep visual handle markup, but remove `re-resizable` gesture ownership.
- Ensure section roots fill the GpuFlow source host.
- Remove `ResizableWithScale` from GPU section rendering.
- Remove or narrow `useProjectNodeResizeObserver` so it is not the active manual
  resize owner.

Exit criteria:

- `settings-section__shortcuts` resizes correctly with no bridge sync.
- Source host dimensions, section dimensions, visual quad dimensions, and final
  persisted layout match.

### Phase 6: Cleanup And Dependency Removal

- Delete unused `re-resizable` wrappers if no non-GPU path uses them.
- Remove resize-handle class behavior dependencies from GpuFlow once stable data
  attributes exist.
- Update tests that mocked `re-resizable`.
- Remove stale comments that describe HTML-owned resizing.

Exit criteria:

- There is no top-level GPU section resize path that depends on
  `re-resizable`.
- The only remaining ResizeObserver uses are intrinsic measurement or canvas
  backing-size observation.

## Verification Plan

Run focused checks as each phase lands:

- `pnpm -C frontend exec vitest run src/components/Utils/Resizable/CustomResizable.test.ts`
- `pnpm -C frontend exec vitest run src/gpuFlow/interactions/nodeResize.test.ts`
- `pnpm -C frontend exec vitest run src/state/actions/sections/sectionResizePolicy.test.ts`
- Existing GpuFlow tests touched by interaction wiring.
- `./scripts/quality/check.sh --files <changed-files>`

Browser verification:

- Start with:
  `CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh`
- Use CDP on `/settings`.
- Resize `settings-section__shortcuts`.
- Confirm during drag:
  - source host size changes
  - section root size changes
  - visual section footprint changes
  - resize handle follows the visual footprint
  - no error console messages introduced
  - no per-move `setSectionSizes`
- Confirm after stop:
  - final `setSectionSizes` succeeds
  - final `setTopLevelSectionLayout` succeeds or debounced layout persistence
    fires as designed
  - reload preserves final dimensions

Performance verification:

- Use Chrome DevTools trace if frame metrics regress or if resize feels delayed.
- Compare GPU frame metrics from the old recording and the new run.
- Keep any performance report append-only under `perf/`.

## Non-Goals

- Adding left/top section resize handles.
- Supporting resize ownership by both HTML and GpuFlow.
- Rewriting section internals.
- Replacing all intrinsic DOM measurement. Some content may still need measured
  auto-size behavior, but manual resize must not depend on it.
- Adding compatibility shims for old generated shape or old resize semantics.

## Open Questions To Resolve During Phase 1

- Does any non-GPU project surface still render top-level sections through
  `CustomResizable`?
- Which section types truly require aspect-ratio resizing today?
- Which resize event consumers depend on start/end timing rather than final
  dimensions?
- Should top-level layout be updated live in `projectConfig.topLevelSections`,
  `useNodeInternals`, or a dedicated GpuFlow layout store that commits back to
  project state on stop?
- Is the active node texture upload budget sufficient during continuous resize,
  or should resize use a lower-resolution live texture and final high-resolution
  upload on stop?
