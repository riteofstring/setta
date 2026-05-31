## Recommended production strategy

Use a **hybrid renderer**:

1. **World-space Pixi layer for graph geometry**: edges, node bodies, ports, selection outlines.
2. **Screen-space or inverse-scaled label layer**: labels do not get magnified by the viewport transform.
3. **MSDF/SDF `BitmapText` for many labels**; use normal Pixi `Text` only for a small number of rich or editable labels.
4. **LOD + culling + pooling**: never render every node, edge decoration, and label at every zoom level.
5. **No per-frame re-rasterization during pan/zoom**: while interacting, update transforms and visible sets only; expensive texture/text updates happen after zoom settles or in small frame-budgeted batches.

The important rule is: **do not chase crispness by continually making bigger raster textures**. For arbitrary zoom, crispness comes from either **not rasterizing before zoom** or using a **scale-tolerant representation** such as MSDF text or analytic shader geometry.

Pixi `Text` is fundamentally a raster-texture path: Pixi renders text through the browser canvas text API, converts it into a texture, and texture regeneration happens when text/style changes. That is why scaling `Text` inside a zoomed viewport eventually blurs and why updating many `Text` objects during zoom is expensive. ([PixiJS][1])

---

## Best architecture

```ts
app.stage
  ├─ viewport / world container     // pan + zoom transform
  │   ├─ edgesLayer                 // world-space
  │   ├─ nodeBodyLayer              // world-space
  │   ├─ nodeOverlayLayer           // ports, selection, hover, decorations
  │
  └─ labelLayer                     // screen-space, not scaled by viewport
```

Recommended defaults:

```ts
import {
  Application,
  Assets,
  BitmapText,
  Container,
  Graphics,
  GraphicsContext,
} from 'pixi.js';

const app = new Application();

await app.init({
  resizeTo: hostElement,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
  antialias: true,
  powerPreference: 'high-performance',
});

const world = new Container({ isRenderGroup: true });
const edgesLayer = new Container();
const nodeBodyLayer = new Container();
const nodeOverlayLayer = new Container();

world.addChild(edgesLayer, nodeBodyLayer, nodeOverlayLayer);

const labelLayer = new Container({ isRenderGroup: true });

app.stage.addChild(world, labelLayer);
```

Pixi’s `Application` supports renderer `resolution`, `autoDensity`, `antialias`, and GPU power preference options, and render groups can be useful when splitting large scene parts that move together, such as a world layer and a HUD/label layer. Do not create render groups for every node; Pixi’s own guidance is to use them strategically and profile because too many can hurt performance. ([PixiJS][2])

---

## Nodes: do not cache the zoomed node bodies by default

### For simple nodes

Use **uncached `Graphics` / shared `GraphicsContext`** for simple shapes, or migrate to a custom shader/mesh renderer once profiling shows Graphics overhead.

Pixi v8’s `GraphicsContext` lets multiple `Graphics` instances share shape data. This is useful for repeated node shapes and states. Pixi also explicitly recommends not clearing/rebuilding Graphics every frame, preferring shared/prebuilt contexts or context swapping for dynamic shapes. ([PixiJS][3])

Example:

```ts
const nodeContextCache = new Map<string, GraphicsContext>();

function getNodeContext(
  width: number,
  height: number,
  radius: number,
  fill: number,
  stroke: number,
) {
  const key = `${width}:${height}:${radius}:${fill}:${stroke}`;

  let ctx = nodeContextCache.get(key);

  if (!ctx) {
    ctx = new GraphicsContext()
      .roundRect(0, 0, width, height, radius)
      .fill(fill)
      .stroke({
        color: stroke,
        width: 1,
        // Good for screen-stable 1px outlines.
        pixelLine: true,
      });

    nodeContextCache.set(key, ctx);
  }

  return ctx;
}

function createNodeView(node: NodeModel) {
  const g = new Graphics(
    getNodeContext(node.w, node.h, 8, node.fill, node.stroke),
  );

  g.position.set(node.x, node.y);
  return g;
}
```

`pixelLine` is specifically designed for lines that remain one screen pixel thick under scaling, which is useful for crisp graph outlines, grids, and technical-editor strokes. ([PixiJS][4])

### For many thousands of nodes

For a very large graph, the fastest production renderer is usually **not one `Graphics` object per visual node**. Use one of these:

| Node renderer                                   |                                          Best use | Tradeoff                                                      |
| ----------------------------------------------- | ------------------------------------------------: | ------------------------------------------------------------- |
| Shared `GraphicsContext`                        | Hundreds to low thousands of simple visible nodes | Easy, good quality, moderate object overhead                  |
| Sprites / `NineSliceSprite` from a shared atlas |                          Many repeated node skins | Very fast, batched, but texture scaling can blur at high zoom |
| Custom `Mesh` / shader rounded-rect renderer    |            Thousands to tens of thousands visible | Highest performance and sharpness, more engineering           |
| `ParticleContainer` for low-zoom dots           |                     Overview/minimap/cluster mode | Very fast but limited; not full node UI                       |

Pixi’s performance guidance says simple Graphics are fast when not constantly modified, small Graphics can be as fast as sprites, but hundreds of complex Graphics can become slow and should be replaced with sprites/textures or another strategy. ([PixiJS][5])

The **highest-quality large-graph node renderer** is an analytic shader:

* Draw one quad per node.
* Store per-node `x, y, w, h, radius, fill, stroke, strokeWidth`.
* In the fragment shader, compute a rounded-rectangle signed distance.
* Use `fwidth`/smoothstep for antialiasing.
* Apply the camera matrix in the vertex shader.
* Keep stroke width in screen pixels if desired.

This avoids both Graphics triangulation overhead and texture scaling blur. It is the same conceptual reason SDF text works: you render from a distance representation at the final screen scale instead of magnifying a pre-rasterized bitmap.

---

## Text: use MSDF/SDF `BitmapText` for graph labels

For labels in a large graph editor, the best Pixi-native default is:

```ts
await Assets.load('fonts/InterGraphMSDF.fnt');

const label = new BitmapText({
  text: node.label,
  style: {
    fontFamily: 'InterGraphMSDF',
    fontSize: 13,
    fill: 0x222222,
  },
  anchor: 0.5,
});

label.roundPixels = true;
labelLayer.addChild(label);
```

Pixi’s `BitmapText` renders from a pre-generated glyph atlas instead of rasterizing every string into its own texture. Pixi documents it as suitable for large numbers of text instances, with shared glyph textures and lower overhead, and Pixi supports MSDF/SDF bitmap fonts for crisp, resolution-independent scaling. ([PixiJS][6])

Use **MSDF** rather than normal bitmap fonts for graph labels. Plain bitmap fonts are fast but still blur when scaled outside their intended size. MSDF/SDF fonts are the scalable option. The caveat is that `BitmapText.resolution` is not dynamically mutable per text object; choose the font atlas resolution and distance-field settings up front, and use multiple font atlases only if you need distinct size ranges or styles. ([PixiJS][6])

Recommended label setup:

```ts
type LabelView = {
  text: BitmapText;
  nodeId: string;
};

const visibleLabels = new Map<string, LabelView>();

function syncLabelToNode(label: BitmapText, node: NodeModel, viewport: ViewportLike) {
  const screen = viewport.toScreen(node.x + node.w / 2, node.y + node.h / 2);

  // Rounding improves resting sharpness. During kinetic pan, you may choose
  // not to round to reduce jitter.
  label.position.set(Math.round(screen.x), Math.round(screen.y));
  label.scale.set(1);
}
```

If you use `pixi-viewport`, it exposes helpers such as `toScreen`, `toWorld`, `getVisibleBounds`, and viewport events like `moved`, `zoomed`, and `zoomed-end`, which are useful for syncing a screen-space label layer and deferring expensive work until interaction ends. ([Viewport PixiJS][7])

---

## Do not scale Pixi `Text` inside the zoomed viewport unless label count is small

Pixi `Text` is still useful, but use it selectively:

* selected node title
* active rename/editor state
* tooltip
* rich styled label
* a few hundred visible labels at most
* cases requiring full browser font shaping, large character sets, emoji, or uncommon CSS-like styling

Pixi `Text.resolution` can be increased for sharper text, and higher values trade quality for performance/memory. ([PixiJS][1])

A safe zoom-bucketed approach for a small visible set:

```ts
const TEXT_RESOLUTION_CAP = 4;

function bucketTextResolution(zoom: number, rendererResolution: number) {
  const target = rendererResolution * zoom;

  if (target <= 1) return 1;
  if (target <= 1.5) return 1.5;
  if (target <= 2) return 2;
  if (target <= 3) return 3;
  return TEXT_RESOLUTION_CAP;
}

function updateVisibleTextResolutionAfterZoomEnd(
  labels: Text[],
  zoom: number,
  rendererResolution: number,
) {
  const nextResolution = bucketTextResolution(zoom, rendererResolution);

  for (const label of labels) {
    if (label.resolution !== nextResolution) {
      label.resolution = nextResolution;
    }
  }
}
```

Do **not** run this on every wheel/pinch frame for thousands of labels. Every Pixi `Text` instance owns texture data, and changing text/style regenerates textures; Pixi’s performance docs explicitly warn against changing text every frame because it redraws to canvas and uploads to the GPU. ([PixiJS][8])

Memory grows quickly. A single 100×20 px label at resolution 4 is roughly:

```txt
100 * 20 * 4 bytes * 4² = 128 KB
```

Ten thousand such labels would be over a gigabyte before overhead. That is why **screen-space MSDF `BitmapText` with pooled visible labels** is usually the right answer.

---

## Caching: use sparingly and never as the main solution for zoom crispness

`cacheAsTexture()` is good for static or infrequently updated containers because it renders children into one texture and reuses that texture. Pixi v8 also lets you pass cache `resolution` and `antialias`, and `updateCacheTexture()` refreshes the cached content. ([PixiJS][9])

Use it for:

* static HUD pieces
* complex icons that do not scale much
* expensive decorative node interiors at a known zoom bucket
* temporary drag previews
* pre-rendered cluster tiles at overview zoom

Avoid it for:

* the whole zoomed graph
* every individual node
* every label
* content expected to stay sharp across arbitrary zoom

Why: once cached, the result is a texture. Scaling it beyond its cached resolution reintroduces blur. Per-node caching also creates many unique textures, increasing memory and often hurting batching.

A reasonable pattern:

```ts
// Good: cache a complex static, non-zoomed panel.
hudPanel.cacheAsTexture({
  resolution: app.renderer.resolution,
  antialias: true,
});

// Later, only when actual contents change:
hudPanel.updateCacheTexture();
```

Not recommended:

```ts
// Bad for arbitrary zoom crispness:
viewport.cacheAsTexture(true);
nodeContainer.cacheAsTexture(true);
labelContainer.cacheAsTexture(true);
```

---

## Screen-space labels vs inverse-scaled labels

### Screen-space Pixi label layer

Best default for graph editors.

Pros:

* Labels are drawn at final screen scale.
* No zoom-dependent raster magnification.
* Works well with MSDF `BitmapText`.
* Easy label decluttering in screen pixels.
* Easy to cap label count.
* Pan/zoom only updates label positions.

Cons:

* You must sync label positions from world to screen.
* Labels are no longer naturally clipped/nested by world containers.
* Z-order with world objects needs explicit management.

Use this for node titles, edge labels, and dense graph labels.

### Inverse-scaled labels inside the world

Good when labels need to remain attached in the scene graph:

```ts
label.position.set(node.w / 2, node.h / 2);
label.scale.set(1 / viewport.scale.x);
```

Pros:

* Labels remain children of their nodes.
* Easier local positioning.

Cons:

* Every visible label may need scale updates on zoom.
* Nested transforms become harder.
* Sorting and culling are more complicated.
* Still use MSDF/BitmapText; inverse scaling does not fix normal `Text` texture churn.

### DOM labels

Use DOM labels for **editing and accessibility**, not for all graph labels.

Best uses:

* active inline text editor
* selected node details
* hover cards
* inspector overlays
* rich HTML labels for a small number of nodes

Avoid DOM for thousands of labels. Layout, style recalculation, event handling, clipping, scroll/zoom synchronization, and z-ordering become a bottleneck. A DOM overlay can look crisp, but it usually loses to a Pixi/MSDF label layer for dense graph rendering.

### Canvas 2D overlay labels

Useful only in narrower cases:

* static or low-count overlays
* print/export mode
* debug labels
* non-interactive labels with custom CPU layout

For thousands of labels during pan/zoom, a 2D canvas overlay requires CPU redraw and text measurement work. It can be sharp at `devicePixelRatio`, but it is usually worse for interaction smoothness than GPU-batched MSDF text.

---

## LOD strategy for thousands of nodes

A large graph editor should not render the same detail at every zoom.

Example thresholds:

```ts
function getGraphLOD(zoom: number) {
  if (zoom < 0.12) return 'clusters';      // dots / heatmap / cluster hulls
  if (zoom < 0.35) return 'node-dots';     // no labels, no ports
  if (zoom < 0.75) return 'simple-nodes';  // simple rects, selected labels only
  if (zoom < 1.75) return 'normal';        // important labels, basic ports
  return 'detail';                         // full labels, ports, badges, handles
}
```

Recommended rules:

|   Zoom level | Nodes                   | Edges                      | Labels                         |
| -----------: | ----------------------- | -------------------------- | ------------------------------ |
| Very far out | clusters, dots, heatmap | simplified or hidden       | none                           |
|      Far out | tiny rects/dots         | simple lines only          | selected/high-priority only    |
|       Normal | full node body          | normal edges               | visible non-overlapping labels |
|    Zoomed in | full node UI            | arrowheads, ports, handles | all visible labels             |
|    Deep zoom | detailed controls       | edge labels, anchors       | rich/editable labels           |

Use an application-level spatial index such as an R-tree, quadtree, grid index, or graph-layout tile index. Ask it for visible nodes/edges using the viewport bounds, then pool Pixi objects for only the visible set. Pixi v8 moved culling into user-controlled APIs such as `cullable`, `cullArea`, `cullableChildren`, and `Culler.shared.cull()`, and Pixi’s performance docs note that application-level culling is often preferable. ([PixiJS][10])

Pseudo-flow:

```ts
function updateVisibleScene(viewport: ViewportLike) {
  const worldBounds = viewport.getVisibleBounds();
  const zoom = viewport.scale.x;
  const lod = getGraphLOD(zoom);

  const nodes = spatialIndex.search(worldBounds);
  const edges = edgeIndex.search(worldBounds);

  updateNodePool(nodes, lod);
  updateEdgePool(edges, lod);
  updateLabelPool(nodes, lod, viewport);
}
```

For labels, add screen-space decluttering:

```ts
function shouldShowLabel(node: NodeModel, zoom: number, occupied: ScreenGrid) {
  if (node.selected) return true;
  if (zoom < 0.5) return false;
  if (node.importance < importanceThresholdForZoom(zoom)) return false;

  const box = estimateLabelScreenBox(node);

  if (occupied.intersects(box)) return false;

  occupied.insert(box);
  return true;
}
```

---

## Interaction smoothness rules

During active pan/zoom:

* Only update camera transform.
* Update visible-object pools if the viewport moved far enough.
* Sync screen-space label positions.
* Do not rebuild Graphics.
* Do not regenerate Pixi `Text` textures.
* Do not call `cacheAsTexture()` / `updateCacheTexture()`.
* Do not recreate thousands of display objects.
* Do not use Pixi event hit-testing on every node if you can pick via a spatial index.

For picking, prefer one pointer handler on the viewport/canvas:

```ts
function onPointerMove(e: FederatedPointerEvent) {
  const worldPoint = viewport.toWorld(e.global.x, e.global.y);
  const hit = nodeSpatialIndex.pick(worldPoint.x, worldPoint.y);

  setHoveredNode(hit?.id ?? null);
}
```

Pixi’s performance docs recommend setting `interactiveChildren = false` when a container has no interactive children, and using explicit hit areas to avoid unnecessary event traversal. ([PixiJS][5])

Layer ordering also matters. Keep draw order grouped by render type, for example:

```txt
all edges → all node fills → all node overlays → all labels
```

Avoid alternating sprite/graphic/text/sprite/graphic per node. Pixi’s performance guidance notes that render order affects batching and that sprites are the fastest path when batching is preserved. ([PixiJS][5])

---

## Approach comparison

| Approach                                  |                  Sharpness |              Runtime performance |           Memory | Use in production                             |
| ----------------------------------------- | -------------------------: | -------------------------------: | ---------------: | --------------------------------------------- |
| Redraw `Graphics` at zoom-dependent scale |                       High |         Poor if done during zoom |              Low | Use only debounced or for visible few         |
| Uncached vector `Graphics`                |                       Good |            Good for simple nodes |              Low | Good baseline                                 |
| Shared `GraphicsContext`                  |                       Good |     Better object/geometry reuse |       Low/medium | Recommended for built-in Pixi implementation  |
| `cacheAsTexture` nodes                    |     Poor at arbitrary zoom | Can improve static complex nodes | High if per-node | Use only for stable zoom buckets or static UI |
| Pixi `Text` with higher resolution        |        Good at target zoom |              Expensive to update |             High | Use for small visible set only                |
| Normal `BitmapText`                       |       Good near atlas size |                        Excellent |              Low | Good for fixed-size UI; not arbitrary scaling |
| MSDF/SDF `BitmapText`                     |                  Very good |                        Excellent |       Low/medium | Best Pixi-native label strategy               |
| Custom shader text                        |                  Excellent |     Excellent if engineered well |           Medium | Use only when built-in text is insufficient   |
| Screen-space Pixi labels                  |                  Excellent |         Good; position sync cost |       Low/medium | Recommended                                   |
| DOM labels                                | Excellent for small counts |                Poor at thousands |  DOM/layout cost | Use for editing/selected overlays             |
| Canvas 2D overlay                         |                       Good |                        CPU-bound |       Low/medium | Special cases, not main renderer              |
| LOD/culling                               |                   Indirect |                        Essential |   Reduces memory | Mandatory for large graph                     |

---

## Concrete final recommendation

For a production-grade Pixi graph editor:

1. **Node bodies**

   * Start with uncached `Graphics` using shared `GraphicsContext`.
   * Use `pixelLine` for crisp 1px outlines.
   * Do not rebuild Graphics during zoom.
   * Do not cache every node.
   * Move to a custom rounded-rect shader/mesh renderer if thousands of visible Graphics become the bottleneck.

2. **Edges**

   * Use batched geometry or a custom mesh for large edge counts.
   * Hide arrowheads, labels, shadows, and handles at low zoom.
   * Use screen-pixel stroke logic for hairline edges where possible.

3. **Labels**

   * Render labels outside the zoomed viewport in a screen-space Pixi layer.
   * Use MSDF `BitmapText` for normal graph labels.
   * Pool label objects.
   * Cap visible labels with LOD and decluttering.
   * Use Pixi `Text` only for selected/editing/rich labels or a small visible set.

4. **Caching**

   * Use `cacheAsTexture()` only for static, non-zoomed, or zoom-bucketed content.
   * Never cache the whole viewport for interactive zoom.
   * Avoid per-label and per-node caches unless profiling proves a benefit.

5. **Pan/zoom**

   * During interaction, only transform world geometry and sync screen-space label positions.
   * Defer text-resolution updates, cache refreshes, and high-detail LOD until `zoomed-end` / interaction end.
   * Use spatial culling and object pools.

This gives the best balance: **sharp nodes, crisp labels, low texture churn, bounded memory, and smooth interaction under large graph loads**.

[1]: https://pixijs.com/8.x/guides/components/scene-objects/text/canvas "Text (Canvas) | PixiJS"
[2]: https://pixijs.com/8.x/guides/components/application "Application | PixiJS"
[3]: https://pixijs.com/8.x/guides/components/scene-objects/graphics "Graphics | PixiJS"
[4]: https://pixijs.com/8.x/guides/components/scene-objects/graphics/graphics-pixel-line "Graphics Pixel Line | PixiJS"
[5]: https://pixijs.com/8.x/guides/concepts/performance-tips "Performance Tips | PixiJS"
[6]: https://pixijs.com/8.x/guides/components/scene-objects/text/bitmap "Bitmap Text | PixiJS"
[7]: https://viewport.pixijs.io/jsdoc/index.html "pixi-viewport API Documentation"
[8]: https://pixijs.download/release/docs/scene.Text.html "Text | pixi.js"
[9]: https://pixijs.com/8.x/guides/components/scene-objects/container/cache-as-texture "Cache As Texture | PixiJS"
[10]: https://pixijs.com/8.x/guides/migrations/v8 "v8 Migration Guide | PixiJS"
