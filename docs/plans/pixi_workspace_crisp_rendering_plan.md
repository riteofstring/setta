# Pixi Workspace Crisp Rendering Plan

- **Date:** June 4, 2026
- **Status:** Phase 1, 2, 3, and 4 implemented; Phase 5 planned and implementation-ready
- **Scope:** Improve high-zoom sharpness and production rendering scalability for the Pixi workspace prototype without adding DOM labels or React state to hot interaction paths.

## Goal

Make nodes and labels remain crisp during deep zoom while preserving fast pan, zoom, drag, selection, and edge interactions.

The original issue was that the workspace zoomed the whole Pixi viewport while node labels were Pixi `Text` objects inside the zoomed world. Each label was rasterized to a texture and then magnified, which made text blur at high zoom and made naive fixes, such as regenerating larger text textures every wheel frame, risky for performance.

Phase 1 moved labels into a screen-space Pixi layer. Phase 2 made that label path explicitly pool-shaped and observable. Phase 3 replaced normal Pixi `Text` labels with an MSDF bitmap-font pipeline. Phase 4 added label LOD, decluttering, and culling without changing graph state ownership. The next work is cleaning up node geometry construction so repeated shapes and technical lines are cheaper and more observable before any larger renderer boundary changes.

The recommended production direction is:

- Keep graph geometry in a world-space Pixi layer.
- Move labels into a Pixi screen-space label layer outside the zoomed viewport.
- Pool visible label objects and update their screen positions imperatively.
- Use MSDF/SDF `BitmapText` for normal graph labels.
- Add LOD and culling before optimizing node geometry with custom shaders.

## Current State

The current prototype:

- Uses one Pixi canvas.
- Uses `pixi-viewport` for pan and zoom.
- Renders node bodies, ports, outlines, edges, temporary edges, and marquee selection with Pixi graphics.
- Renders node labels as screen-space Pixi `BitmapText` objects in a `labelLayer` sibling of the viewport.
- Tracks labels in a node-label map.
- Creates and releases labels through explicit `acquireLabel(nodeId)` and `releaseLabel(nodeId)` helpers.
- Loads the committed `InterMSDF` MSDF bitmap font through Pixi assets before creating normal graph labels.
- Validates node-label glyphs before constructing `BitmapText` labels.
- Syncs label screen positions through `syncAllLabels()` and `syncLabelPosition(nodeId)`.
- Exposes `labelSyncCount`, `visibleLabelCount`, label kind, label font family, and MSDF distance-field metadata in the debug snapshot.
- Exposes `labelObjectCount`, `labelVisibilityMode`, and per-label visibility reasons in the debug snapshot.
- Keeps label objects pooled while using zoom-based label LOD, viewport culling, and deterministic screen-space decluttering to toggle `label.visible`.
- Creates node bodies, shadows, selection/hover outlines, ports, and grid lines with Pixi `Graphics`.
- Creates node body and shadow geometry once per fixture node, but does not yet use cached `GraphicsContext` helpers for repeated shapes and states.
- Redraws selection/hover outline graphics only when interaction state changes, not during camera pan or zoom.
- Keeps interaction state in the imperative renderer path, not React state.
- Has visual smoke coverage for pan, zoom, node drag, edge drawing, multiselect, marquee, Escape clear, group drag, deep zoom labels, pan after deep zoom, label counter updates, MSDF bitmap label metadata, label LOD/culling behavior, and unchanged React render count during label sync.

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
- No node body, node shadow, node outline geometry, or grid geometry rebuild during camera pan or zoom.
- Pool display objects for labels and future visible-node virtualization.
- Profile before introducing custom mesh or shader renderers.

## Phase 1: Screen-Space Pixi Label Layer

Status: Implemented.

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

Status: Implemented.

Make the existing screen-space label layer production-shaped and observable before replacing normal text labels.

Completed work:

- Introduce explicit label lifecycle helpers:
  - `acquireLabel(nodeId)`
  - `releaseLabel(nodeId)`
- Keep `syncLabelPosition(nodeId)` and `syncAllLabels()` as the label-position sync boundaries.
- Keep the node-label map as the active-label registry for this phase.
- Define `releaseLabel(nodeId)` as the lifecycle boundary for future culling. It currently removes and destroys the label; full culling and LOD remain Phase 4.
- Add debug snapshot fields:

```ts
render: {
  labelSyncCount: number;
  visibleLabelCount: number;
};
```

- Update `desktop/src/renderer/src/global.d.ts` for the new debug fields.
- Increment `labelSyncCount` only when label position sync work runs.
- Report `visibleLabelCount` from the current label objects.
- Add visual smoke assertions that:
  - `labelSyncCount` exists and advances after pan, zoom, and group drag.
  - `visibleLabelCount` matches the visible screen-space label objects expected for the current fixture.
  - Label sync still does not change React render count.
- Preserve existing smoke assertions for deep zoom, pan after deep zoom, and group drag at non-1x zoom.
- Update `docs/reports/performance/pixi-workspace-visual-smoke.md` with the final artifact and label counter values.

Expected result:

- Label behavior is observable in automated smoke output.
- The code path is ready for culling and later text-rendering changes.

## Phase 3: MSDF BitmapText Pipeline

Status: Implemented.

Replace normal Pixi `Text` for default graph labels with Pixi v8 `BitmapText` backed by an MSDF AngelCode BMFont asset.

Completed decisions:

- Runtime text type: Pixi `BitmapText` from `pixi.js/text-bitmap`.
- Descriptor format: XML BMFont descriptor committed with a `.fnt` extension.
- Atlas format: adjacent PNG page referenced by the `.fnt` descriptor.
- Direct Pixi load target: the descriptor, not the PNG.
- Normal graph labels must fail loudly if the font asset cannot load or if a label contains a glyph outside the generated charset.
- Asset generation uses the focused `desktop/scripts/generate-pixi-workspace-font.mjs` script with the exact pinned `@pixi/msdf-bmfont-xml` dev dependency.
- Font generation settings live in `desktop/src/renderer/src/components/pixi-workspace-label-font-config.json`.

Asset layout:

```text
desktop/src/renderer/assets/fonts/source/inter/
  Inter-Bold.ttf
  OFL.txt

desktop/src/renderer/public/fonts/inter-msdf/
  InterMSDF.fnt
  InterMSDF.png
```

Descriptor requirements:

```xml
<info face="InterMSDF" size="48" .../>
<common lineHeight="..." base="..." scaleW="1024" scaleH="1024" pages="1" packed="0" .../>
<page id="0" file="InterMSDF.png"/>
<distanceField fieldType="msdf" distanceRange="4"/>
<chars count="95">
```

The page file must be a stable relative path. Do not use an absolute filesystem path, a Vite-hashed path, or a dev-server-only URL inside the descriptor.

Completed generation behavior:

- Use `Inter-Bold.ttf` to match the current bold node-label style.
- Use generation font size `48`, rendered font size `16`, texture size `1024x1024`, padding `2`, field type `msdf`, and distance range `4`.
- Generate printable ASCII glyphs from code point `32` through `126`.
- Keep the generated `.fnt` and `.png` committed so renderer startup does not depend on a generation step.
- Keep the source font and license committed so the generated asset is reproducible.

Completed renderer loading:

- Import `pixi.js/text-bitmap` before loading the font.
- Import `Assets` and `BitmapText` from `pixi.js`.
- Load `fonts/inter-msdf/InterMSDF.fnt` inside `createPixiWorkspaceRenderer()` after `app.init(...)` and before the loop that calls `acquireLabel(node.id)`.
- Use the loaded bitmap font's `fontFamily`, expected to be `InterMSDF`, rather than assuming the asset alias is the font family.
- Keep `createPixiWorkspaceRenderer()` as the async initialization boundary; it is already awaited by the React wrapper.
- Throw a specific error if the font load returns no usable `fontFamily`, returns the wrong family, or does not report MSDF distance-field metadata with range `4`.

Completed renderer integration:

- Replace the pooled normal labels created by `acquireLabel(nodeId)` with pooled `BitmapText` labels.
- Preserve `releaseLabel(nodeId)`, `syncLabelPosition(nodeId)`, `syncAllLabels()`, `labelSyncCount`, and `visibleLabelCount`.
- Add glyph validation for node labels before constructing `BitmapText`; fail specifically on unsupported glyphs.
- Add per-label debug metadata including `label.kind: "bitmap-text"`, `label.fontFamily`, `label.fontDistanceFieldType`, and `label.fontDistanceFieldRange`.
- Update `desktop/src/renderer/src/global.d.ts` for any new debug fields.
- Keep Pixi `Text` only for future selected/editing/rich-label states, not normal graph labels.

Constraints:

- Do not dynamically mutate label resolution every zoom frame.
- Do not create a unique texture per label.
- Do not add DOM labels for normal graph labels.
- Do not use JSON as the direct bitmap-font descriptor.
- Do not use `?url` imports for the `.fnt` unless the emitted descriptor and PNG adjacency has been verified.
- Do not add a silent fallback from `BitmapText` to Pixi `Text` for normal graph labels.

Expected result:

- Labels stay sharp across common zoom ranges with substantially lower texture churn than Pixi `Text`.
- The normal label path uses one shared generated font atlas rather than one raster texture per label.

## Phase 4: Label LOD, Decluttering, and Culling

Status: Implemented.

Add a simple production-shaped visibility policy for labels. This phase should only decide which existing pooled labels are visible; it should not add a spatial index, virtualize node bodies, or create a second renderer.

Implementation decisions:

- Keep all normal labels as pooled screen-space `BitmapText` objects in the existing `nodeLabels` map.
- Do not call `releaseLabel(nodeId)` for camera-driven label LOD. In this phase, `releaseLabel(nodeId)` remains a node lifecycle boundary, not a pan/zoom culling mechanism.
- Hide and show labels by setting `label.visible`.
- Keep position and visibility updates push-based from the same imperative events that already call label sync:
  - initial render
  - camera pan
  - wheel pan
  - wheel zoom
  - node drag and group drag
  - selection changes
  - window resize
- Keep the implementation O(number of fixture nodes) for now. The spatial index remains Phase 6.
- Keep `visibleLabelCount` as the number of labels with `label.visible === true`; it should no longer be assumed to equal total fixture node count.

Implementation tasks:

- Define label visibility modes:

```ts
type LabelVisibilityMode = "selected" | "visible-priority" | "all-visible";

function labelVisibilityModeForZoom(zoom: number): LabelVisibilityMode {
  if (zoom < 0.75) return "selected";
  if (zoom < 1.75) return "visible-priority";
  return "all-visible";
}
```

- Add a `syncLabelVisibility()` helper and call it from `syncAllLabels()` after label positions are synced.
- Keep `syncLabelPosition(nodeId)` focused on position and scale only; visibility should be a separate helper.
- Use viewport world bounds to reject offscreen nodes:
  - derive bounds from the current viewport screen rectangle with `viewport.toWorld(...)`
  - reuse existing node bounds helpers where practical
  - treat a node as visible when its world bounds intersect the current viewport bounds
- In `selected` mode:
  - show selected labels whose nodes intersect viewport bounds
  - hide unselected labels
- In `visible-priority` mode:
  - show selected labels whose nodes intersect viewport bounds
  - then show unselected in-viewport labels that pass decluttering
  - use current fixture node order as the deterministic priority order until graph data has explicit label priority
- In `all-visible` mode:
  - show every label whose node intersects viewport bounds
  - still hide labels whose nodes are outside viewport bounds
- Add a simple screen-space decluttering pass for `visible-priority`:
  - selected labels are inserted first and always win
  - estimate each label's screen-space rectangle from its synced position and current `BitmapText` dimensions
  - inflate label boxes by a small padding, such as `8px` horizontal and `4px` vertical
  - hide a candidate label when its inflated box intersects a previously accepted box
  - keep the pass deterministic and allocation-light; an array of accepted boxes is enough for the fixture, and a screen-grid can replace it when density requires
- Add debug snapshot fields:

```ts
render: {
  labelObjectCount: number;
  labelVisibilityMode: "selected" | "visible-priority" | "all-visible";
  visibleLabelCount: number;
};
```

- Update `desktop/src/renderer/src/global.d.ts` for the new debug fields.
- Add per-label debug visibility metadata:

```ts
label: {
  visibilityReason:
    | "selected"
    | "visible-priority"
    | "all-visible"
    | "outside-viewport"
    | "zoom-hidden"
    | "decluttered";
};
```

- Keep label metadata for hidden labels in the debug snapshot so smoke tests can distinguish hidden, offscreen, and decluttered labels.
- Update visual smoke assertions:
  - do not assert `visibleLabelCount === 4` globally
  - assert `labelObjectCount === graph.nodeCount` for the current fixture
  - assert `visibleLabelCount` matches labels with `label.visible === true`
  - assert low zoom enters `selected` mode and hides unselected labels
  - assert a selected in-viewport label remains visible in `selected` mode
  - assert normal zoom enters `visible-priority` mode and keeps labels screen-space
  - assert deep zoom enters `all-visible` mode and shows all in-viewport labels
  - assert panning far enough to move a node outside the viewport hides that node's label
  - assert label visibility updates do not change React render count
- Keep all label updates push-based from camera, node, and selection changes.

Expected result:

- Label rendering cost scales with visible and important labels, not total graph size.
- Camera movement toggles label visibility without creating or destroying label display objects.
- Automated smoke output can explain which LOD mode is active and why each label is visible or hidden.

## Phase 5: Node Geometry Cleanup

Status: Planned; implementation-ready.

Improve crispness and batching for node geometry without jumping straight to custom shaders.

Scope:

- Keep the existing Pixi `Graphics` renderer path.
- Keep graph geometry in the existing world-space `viewport` layers.
- Limit this phase to node body, node shadow, node selection/hover outline, and grid-line geometry.
- Do not change edge geometry, port state rendering, label LOD, spatial indexing, pointer hit testing, graph data, or React state.
- Do not introduce custom `Mesh`, shaders, sprites, texture atlases, or `cacheAsTexture()`.

Implementation decisions:

- Add a small node-geometry helper module near the renderer, for example `pixi-workspace-node-geometry.js`.
- Move node geometry style constants into that helper module:
  - body corner radius `8`
  - body fill alpha `0.92`
  - body stroke color `0xffffff`
  - body stroke alpha `0.55`
  - body stroke width `1.5`
  - shadow offset `(7, 9)`
  - shadow alpha `0.14`
  - hover outline inset `5`, radius `12`, alpha `0.42`, width `2`
  - selected outline inset `5`, radius `12`, alpha `0.95`, width `3`
- Add cached Pixi `GraphicsContext` helpers:

```ts
function nodeBodyContextFor(node: NodeFixture): GraphicsContext;
function nodeShadowContextFor(node: NodeFixture): GraphicsContext;
function nodeOutlineContextFor(
  node: NodeFixture,
  state: "hovered" | "selected",
): GraphicsContext;
```

- Key `nodeBodyContextFor(...)` by dimensions and body style, including node fill color. The current fixture may still produce one body context per differently colored node; the cache is still the production-shaped boundary for repeated future node types.
- Key `nodeShadowContextFor(...)` by dimensions, radius, offset, alpha, and color. This should share for fixture nodes that have the same size.
- Key `nodeOutlineContextFor(...)` by dimensions, radius, inset, outline state, stroke width, stroke alpha, and stroke color.
- Use `new Graphics(sharedContext)` for body, shadow, hover outline, and selected outline display objects.
- Replace the current mutable single-outline graphics with two prebuilt outline graphics per node:
  - `hoverOutline`, initially hidden
  - `selectedOutline`, initially hidden
- Replace `drawNodeOutline(nodeId)` with a helper that toggles outline visibility:

```ts
function syncNodeOutlineVisibility(nodeId: string) {
  selectedOutline.visible = selectedNodeIds.has(nodeId);
  hoverOutline.visible = !selectedOutline.visible && hoveredNodeIds.has(nodeId);
}
```

- Keep selected outline visually dominant over hover outline when both states are true.
- Keep `body.eventMode`, `body.cursor`, and `body.hitArea` unchanged so pointer behavior stays on the body graphics.
- Keep node container movement as transform updates only during drag.
- Keep grid geometry built once during renderer initialization. Use `pixelLine: true` only for grid and other 1px technical hairlines where visual inspection confirms it improves sharpness. Do not force `pixelLine` on thicker stylistic strokes such as selected outlines.
- Leave port visuals alone in this phase. They are stateful interaction affordances and can get their own state-context cleanup later if profiling points there.

Implementation tasks:

- Add node geometry context caches and exported cache-size/debug helpers.
- Update `nodeContainer(node)` to construct body, shadow, hover outline, and selected outline graphics from cached contexts.
- Replace `nodeOutlines` with a map that stores both outline graphics for each node.
- Update hover, selection, and clear-selection flows to call the visibility-sync helper instead of clearing/redrawing outline graphics.
- Keep `drawAllNodeOutlines()` as a compatibility wrapper if useful, but have it call visibility sync only.
- Add renderer debug snapshot fields:

```ts
render: {
  gridDrawCount: number;
  nodeBodyContextCount: number;
  nodeBodyGraphicsCount: number;
  nodeOutlineContextCount: number;
  nodeOutlineGraphicsCount: number;
  nodeOutlineVisibilityUpdateCount: number;
  nodeShadowContextCount: number;
  nodeShadowGraphicsCount: number;
};
```

- Increment `gridDrawCount` only when grid geometry is created.
- Increment `nodeOutlineVisibilityUpdateCount` only when outline visibility sync work runs.
- Assert context counts are stable across camera pan, wheel pan, wheel zoom, deep zoom, and node drag.
- Assert `gridDrawCount` remains unchanged across camera pan, wheel pan, wheel zoom, deep zoom, and node drag.
- Assert body, shadow, and outline graphics counts match the fixture node expectations:
  - body graphics count equals node count
  - shadow graphics count equals node count
  - outline graphics count equals `nodeCount * 2`
- Preserve all existing interaction behavior and label assertions.

Expected result:

- Lower geometry overhead and sharper technical lines without changing the renderer architecture.
- Node body, shadow, and outline geometry construction is centralized and cache-backed.
- Camera movement only changes viewport transforms and label visibility/position; it does not rebuild node or grid geometry.
- Selection and hover update outline visibility, not outline path geometry.
- The implementation provides debug counters that make future geometry regressions visible in smoke output.

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

For Phase 5 specifically, baseline before implementation and append the result to `docs/reports/performance/pixi-workspace-visual-smoke.md`:

```sh
pnpm -C desktop build
./scripts/test_pixi_workspace_visual.sh --skip-build --keep-artifacts
```

After Phase 5 implementation, rerun the same visual smoke workflow and append a before/after "Node Geometry Cleanup Update" section under `docs/reports/performance/`. Include artifact paths, frame timing metrics, geometry debug counters, and any visible sharpness observations.

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
- Normal graph labels are `BitmapText` labels using the expected MSDF font family.
- Unsupported glyph validation fails loudly in a focused unit test.
- After Phase 4, label visibility mode changes deterministically across low, normal, and deep zoom.
- After Phase 4, `visibleLabelCount` matches currently visible labels, not total fixture nodes.
- After Phase 4, low zoom hides unselected labels, selected in-viewport labels remain visible, and offscreen labels are hidden.
- After Phase 5, node body, shadow, outline, and grid geometry counters are present in the debug snapshot.
- After Phase 5, node geometry context counts and `gridDrawCount` remain stable across camera pan, wheel pan, wheel zoom, node drag, and deep zoom.
- After Phase 5, selection and hover update outline visibility without changing node body, shadow, or grid geometry counters.
- React render count remains stable during label sync.
- Existing pan, zoom, selection, marquee, group drag, and edge drawing flows still pass.

Manual verification:

- Inspect labels at minimum, normal, and maximum zoom.
- Verify text does not blur noticeably during deep zoom.
- Verify labels do not jitter objectionably when panning slowly.
- Verify labels remain aligned with node centers after group drag.
- Verify label LOD changes do not create visible popping during ordinary zoom gestures beyond the intended mode thresholds.
- Verify node body strokes, selected/hover outlines, and grid hairlines remain visually acceptable at minimum, normal, and maximum zoom.
- Verify node drag, selection, hover, and edge drawing still target the expected hit areas after body graphics are constructed from shared contexts.
- Record before/after screenshots and metrics under `docs/reports/performance/`.

## Non-Goals

- No DOM labels for normal workspace nodes.
- No inline label editing in this slice.
- No accessibility layer in this slice.
- No custom shader node renderer unless profiling justifies it.
- No backend, generated contract, persistence, undo/redo, or semantic graph-model changes.
- No full graph virtualization until graph size requires it.
