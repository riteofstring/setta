# Pixi Workspace Crisp Rendering Plan

**Date:** June 4, 2026  
**Status:** Planned  
**Scope:** Improve high-zoom sharpness and production rendering scalability for the Pixi workspace prototype without adding DOM labels or React state to hot interaction paths.

## Goal

Make nodes and labels remain crisp during deep zoom while preserving fast pan, zoom, drag, selection, and edge interactions.

The primary issue is that the current workspace zooms the whole Pixi viewport. Node labels are Pixi `Text` objects inside the zoomed world, so each label is rasterized to a texture and then magnified. This makes text blur at high zoom and makes naive fixes, such as regenerating larger text textures every wheel frame, risky for performance.

The recommended production direction is:

- Keep graph geometry in a world-space Pixi layer.
- Move labels into a Pixi screen-space label layer outside the zoomed viewport.
- Pool visible label objects and update their screen positions imperatively.
- Use MSDF/SDF `BitmapText` for normal graph labels when the font pipeline is ready.
- Add LOD and culling before optimizing node geometry with custom shaders.

## Current State

The current prototype:

- Uses one Pixi canvas.
- Uses `pixi-viewport` for pan and zoom.
- Renders node bodies, ports, outlines, edges, temporary edges, and marquee selection with Pixi graphics.
- Renders node labels as Pixi `Text` children inside each node container.
- Keeps interaction state in the imperative renderer path, not React state.
- Has visual smoke coverage for pan, zoom, node drag, edge drawing, multiselect, marquee, Escape clear, and group drag.

This plan should extend the existing renderer/controller path. Do not create a second Pixi implementation or introduce DOM labels for workspace nodes.

## Core Architecture

Keep the existing world container for graph geometry:

```text
viewport / world container
  backgroundLayer
  edgeLayer
  nodeLayer
  interactionLayer
  effectsLayer
```

Add a separate screen-space Pixi label layer as a sibling of the viewport:

```text
app.stage
  viewport / world container
    edgeLayer
    nodeLayer
    interactionLayer
    effectsLayer
  labelLayer
    pooled node labels
```

The label layer must not inherit the viewport scale. Label positions are computed from node world coordinates through `viewport.toScreen(...)`.

## Performance Rules

- No React state updates in pan, zoom, drag, selection, marquee, edge drawing, label sync, or animation hot paths.
- No DOM nodes for workspace node labels.
- No per-frame Pixi `Text` texture regeneration during wheel, pinch, pan, drag, or marquee interactions.
- No `cacheAsTexture()` for the full viewport, per-node containers, or every label.
- No full Pixi scene rebuild on pan or zoom.
- Pool display objects for labels and future visible-node virtualization.
- Profile before introducing custom mesh or shader renderers.

## Phase 1: Screen-Space Pixi Label Layer

Move node title rendering out of the zoomed node containers.

Implementation tasks:

- Add `labelLayer` to `app.stage` as a sibling of the viewport.
- Remove node-label `Text` children from `nodeContainer`.
- Create a label view map keyed by node ID.
- Initial implementation may use Pixi `Text` in the screen-space layer for all current fixture nodes.
- Sync label positions from node world bounds to screen coordinates:

```ts
const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
label.position.set(Math.round(screen.x), Math.round(screen.y));
label.scale.set(1);
```

- Update label positions after:
  - Initial render.
  - Camera pan.
  - Wheel pan.
  - Wheel zoom.
  - Node drag and group drag.
  - Window resize.
- Keep label style screen-sized, not viewport-scaled.
- Keep labels non-interactive for this phase.

Expected result:

- Deep zoom no longer magnifies label textures.
- Labels remain readable and sharper at high zoom.
- Node bodies may still show normal antialias softening under deep zoom, but the most visible text blur is addressed.

## Phase 2: Label Pooling and Debug Counters

Make the label layer production-shaped before replacing text technology.

Implementation tasks:

- Introduce explicit label lifecycle helpers:
  - `acquireLabel(nodeId)`
  - `releaseLabel(nodeId)`
  - `syncLabelPosition(nodeId)`
  - `syncAllLabels()`
- Add debug snapshot fields:

```ts
render: {
  labelSyncCount: number;
  visibleLabelCount: number;
};
```

- Ensure label sync does not change React render count.
- Add visual smoke assertions that labels remain visible after:
  - Deep zoom.
  - Pan after deep zoom.
  - Group drag at non-1x zoom.

Expected result:

- Label behavior is observable in automated smoke output.
- The code path is ready for culling and MSDF migration.

## Phase 3: MSDF/SDF BitmapText Pipeline

Replace normal Pixi `Text` for default graph labels with MSDF/SDF `BitmapText`.

Implementation tasks:

- Add a committed MSDF/SDF bitmap font asset for the default node-label typeface.
- Load the font through Pixi assets during renderer initialization.
- Replace pooled normal labels with pooled `BitmapText` labels.
- Preserve fallback or failure behavior by failing loudly if the required font asset cannot load in the prototype path.
- Keep Pixi `Text` only for future selected/editing/rich-label states, not normal graph labels.

Constraints:

- Do not dynamically mutate label resolution every zoom frame.
- Do not create a unique texture per label.
- Do not add DOM labels for normal graph labels.

Expected result:

- Labels stay sharp across common zoom ranges with substantially lower texture churn than Pixi `Text`.

## Phase 4: Label LOD, Decluttering, and Culling

Add a simple production-shaped visibility policy for labels.

Implementation tasks:

- Define zoom LOD buckets:

```ts
function labelModeForZoom(zoom: number) {
  if (zoom < 0.35) return "none";
  if (zoom < 0.75) return "selected";
  if (zoom < 1.75) return "visible-priority";
  return "all-visible";
}
```

- For the prototype fixture, implement O(number of nodes) visible-node filtering using viewport bounds.
- Hide labels outside viewport bounds.
- Show selected labels even when general labels are hidden.
- Add a simple screen-grid occupancy pass before showing dense labels once the graph can contain enough nodes to overlap.
- Keep all label updates push-based from camera, node, and selection changes.

Expected result:

- Label rendering cost scales with visible and important labels, not total graph size.

## Phase 5: Node Geometry Cleanup

Improve crispness and batching for node geometry without jumping straight to custom shaders.

Implementation tasks:

- Evaluate Pixi v8 `GraphicsContext` sharing for repeated node body shapes and states.
- Use screen-stable stroke settings such as `pixelLine` where appropriate for outlines, grid lines, and technical hairlines.
- Avoid clearing and rebuilding node body graphics during camera movement.
- Keep selection and hover outlines as reusable graphics, updated only when interaction state changes.
- Benchmark before and after with visual smoke and performance reports.

Expected result:

- Lower geometry overhead and sharper technical lines without changing the renderer architecture.

## Phase 6: Spatial Index and Large-Graph Renderer Boundary

Only after the prototype needs larger graphs, add an application-level spatial index.

Implementation tasks:

- Introduce a spatial index for node bounds.
- Use it for:
  - Visible-node filtering.
  - Pointer hit testing.
  - Label visibility.
  - Future edge culling.
- Keep Pixi display objects as rendering projections, not graph state owners.
- Pool visible node, port, edge, and label views.

Expected result:

- Large graph performance depends on visible graph size and LOD, not total graph size.

## Phase 7: Optional Custom Mesh or Shader Rendering

Do not implement this until profiling shows Pixi graphics are the bottleneck.

Candidate implementation:

- One quad per visible node.
- Per-node attributes for `x`, `y`, `width`, `height`, `radius`, fill, stroke, and state.
- Fragment shader computes a rounded-rectangle signed distance.
- Antialias with `fwidth` and `smoothstep`.
- Keep stroke width screen-stable when needed.

Use this only if:

- Shared `GraphicsContext`, pooling, culling, and LOD are insufficient.
- Profiling shows node body rendering dominates frame time.
- The expected visible-node count justifies custom renderer complexity.

## Verification

Focused checks during implementation:

```sh
pnpm -C desktop typecheck
pnpm -C desktop test
pnpm -C desktop build
./scripts/test_pixi_workspace_visual.sh --skip-build --keep-artifacts
```

After source/test/doc edits are stable:

```sh
./scripts/format.sh
./check_quality.sh --all
```

Extend the Pixi visual smoke workflow to cover:

- Deep zoom on node labels.
- Label sharpness proxy through screenshot/pixel checks where practical.
- Label position remains attached to node centers during pan and zoom.
- Label position updates after node drag and group drag.
- Labels remain screen-sized, not viewport-scaled.
- React render count remains stable during label sync.
- Existing pan, zoom, selection, marquee, group drag, and edge drawing flows still pass.

Manual verification:

- Inspect labels at minimum, normal, and maximum zoom.
- Verify text does not blur noticeably during deep zoom.
- Verify labels do not jitter objectionably when panning slowly.
- Verify labels remain aligned with node centers after group drag.
- Record before/after screenshots and metrics under `docs/reports/performance/`.

## Non-Goals

- No DOM labels for normal workspace nodes.
- No inline label editing in this slice.
- No accessibility layer in this slice.
- No custom shader node renderer unless profiling justifies it.
- No backend, generated contract, persistence, undo/redo, or semantic graph-model changes.
- No full graph virtualization until graph size requires it.
