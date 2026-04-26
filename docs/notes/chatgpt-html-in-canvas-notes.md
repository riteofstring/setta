# HTML-in-Canvas Prototype Plan: Model A for Graph Pan/Zoom

_Date: 2026-04-27_

## 1. Summary

Our current graph UI uses a forked xyflow-style pan/zoom renderer. The graph nodes are complex HTML trees with many nested `div`s and controls. We have already confirmed that the dominant pan/zoom bottleneck is **DOM repainting**, not graph layout or application state updates.

The prototype goal is to test whether **HTML-in-Canvas** can let us keep node contents authored as HTML/React components while moving the pan/zoom hot path into a `<canvas>` renderer.

The first approach to test is **Model A**:

> Render each visible graph node as a direct DOM child of a `<canvas layoutsubtree>`, draw those elements into the canvas with `ctx.drawElementImage(...)`, and apply the returned transform to the same DOM element so browser hit testing, focus, and accessibility line up with the drawn pixels.

In this model, each node has one DOM instance. That same DOM element is:

1. the source used by `drawElementImage()`, and
2. the DOM element used for hit testing, focus, form controls, and accessibility.

This is the simplest version of the HTML-in-Canvas API and should be tested before moving to a more complex overlay/texture-cache architecture.

## 2. Motivation

The current architecture likely looks conceptually like this:

```text
Large DOM/SVG graph scene
  -> CSS transform for pan/zoom
  -> many complex HTML nodes repaint or composite during navigation
  -> frame drops as node count grows
```

The desired architecture is:

```text
Canvas viewport
  -> pan/zoom updates one canvas transform
  -> nodes are drawn into canvas from real HTML elements
  -> browser DOM interaction remains available through synchronized transforms
```

The main hypothesis:

> If panning and zooming redraw visible HTML nodes into canvas instead of moving/repainting a large DOM viewport, interaction should remain smooth with many complex nodes.

## 3. What HTML-in-Canvas is

HTML-in-Canvas is an experimental Chromium/WICG proposal for rendering HTML content through Canvas 2D, WebGL, or WebGPU.

The proposal introduces three core primitives:

1. `layoutsubtree` on `<canvas>`
   - Opts canvas descendants into layout and hit testing.
   - Canvas children behave like real laid-out DOM, but their rendering is not visible until explicitly drawn into the canvas.

2. `ctx.drawElementImage(element, ...)`
   - Draws a direct child of the canvas into the canvas.
   - Returns a `DOMMatrix`/transform that can be assigned to `element.style.transform` to align the element’s DOM position with the drawn canvas position.

3. `canvas.onpaint` / `paint` event and `canvas.requestPaint()`
   - `paint` fires when canvas child rendering changes.
   - `requestPaint()` asks the browser to fire a paint event even when the children have not changed, which is useful for pan/zoom frames.

Relevant references:

- [WICG HTML-in-Canvas explainer](https://github.com/WICG/html-in-canvas)
- [Blink intent to experiment: HTML-in-canvas](https://groups.google.com/a/chromium.org/g/blink-dev/c/t_nGEmJ_v4s)
- [Chromium runtime feature: `CanvasDrawElement`](https://chromium.googlesource.com/chromium/src.git/+/HEAD/third_party/blink/renderer/platform/runtime_enabled_features.json5)
- [HTML-in-Canvas browser setup guide](https://html-in-canvas.dev/docs/browser-support/)

## 4. Browser setup for local Chrome testing

Use **Chrome Canary** for the initial prototype.

1. Install or open Chrome Canary.
2. Paste this into the address bar:

   ```text
   chrome://flags/#canvas-draw-element
   ```

3. Enable the flag named approximately:

   ```text
   Enable the new drawElement API for Canvas
   ```

4. Relaunch the browser.
5. Load the prototype app.
6. Confirm support in DevTools:

   ```js
   const canvas = document.createElement('canvas');
   const ctx = canvas.getContext('2d');

   console.log(typeof ctx.drawElementImage);      // expected: "function"
   console.log(typeof canvas.requestPaint);       // expected: "function"
   console.log('layoutSubtree' in canvas);        // expected: true, depending on build/API shape
   ```

Optional command-line launch for Chromium/Chrome Canary builds that expose the Blink feature name:

```bash
/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary \
  --enable-blink-features=CanvasDrawElement \
  --user-data-dir=/tmp/chrome-html-in-canvas-test
```

Prefer the `chrome://flags/#canvas-draw-element` path first because it is the documented manual setup path for the developer trial.

## 5. Model A architecture

### 5.1 Mental model

A graph node wrapper is a real DOM element:

```tsx
<div className="graph-node-source">
  <GraphNode node={node} />
</div>
```

That wrapper must be a **direct child** of the `<canvas layoutsubtree>`.

The canvas paint loop draws that DOM element into the canvas:

```ts
const transform = ctx.drawElementImage(
  nodeEl,
  node.x,
  node.y,
  node.width,
  node.height,
);

nodeEl.style.transform = transform.toString();
```

`nodeEl` is the outer DOM element for a graph node. It is not a screenshot, not a separate hidden copy, and not an overlay. It is the real element that contains the node’s HTML.

### 5.2 Why the returned transform matters

Canvas drawing and DOM hit testing are separate systems.

`drawElementImage()` draws pixels into the canvas. Browser features such as pointer hit testing, focus, accessibility, selection, and intersection observers still depend on the element’s DOM location.

The transform returned by `drawElementImage()` is meant to keep those systems aligned:

```ts
const transform = ctx.drawElementImage(nodeEl, x, y, width, height);
nodeEl.style.transform = transform.toString();
```

Important: CSS transforms on the source element are ignored for the canvas drawing operation, but still affect hit testing/accessibility. This is what allows the same element to be both the drawing source and the interactive DOM target.

## 6. Initial React structure

Example shape:

```tsx
function GraphCanvas({ nodes, edges, viewport }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeElsRef = useRef(new Map<string, HTMLElement>());

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      {...({ layoutsubtree: '' } as any)}
    >
      {nodes.map(node => (
        <div
          key={node.id}
          ref={el => {
            if (el) nodeElsRef.current.set(node.id, el);
            else nodeElsRef.current.delete(node.id);
          }}
          className="graph-node-source"
          style={{
            width: node.width,
            height: node.height,
          }}
        >
          <GraphNode node={node} />
        </div>
      ))}
    </canvas>
  );
}
```

Recommended CSS starting point:

```css
.graph-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.graph-node-source {
  position: absolute;
  left: 0;
  top: 0;
  box-sizing: border-box;
  contain: layout paint style;
  transform-origin: 0 0;
}
```

Notes:

- Use `layoutsubtree` on the canvas.
- Keep each node wrapper as a direct canvas child.
- Do not use `display: none` for node source elements.
- Use fixed node dimensions for the first prototype. Dynamic measurement can be added later.
- React/TypeScript may not know the experimental `layoutsubtree` attribute yet; the `as any` spread is acceptable for a prototype.

## 7. Paint loop

Basic version:

```ts
function attachCanvasPainter(params: {
  canvas: HTMLCanvasElement;
  getViewport: () => { x: number; y: number; zoom: number };
  getVisibleNodes: () => GraphNodeModel[];
  getVisibleEdges: () => GraphEdgeModel[];
  getNodeEl: (id: string) => HTMLElement | undefined;
}) {
  const { canvas, getViewport, getVisibleNodes, getVisibleEdges, getNodeEl } = params;
  const ctx = canvas.getContext('2d') as any;

  function paint() {
    const viewport = getViewport();

    ctx.reset();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Production code should handle devicePixelRatio carefully.
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    drawEdges(ctx, getVisibleEdges());

    for (const node of getVisibleNodes()) {
      const nodeEl = getNodeEl(node.id);
      if (!nodeEl) continue;

      const transform = ctx.drawElementImage(
        nodeEl,
        node.x,
        node.y,
        node.width,
        node.height,
      );

      // Align DOM hit testing/focus/accessibility with the drawn position.
      nodeEl.style.transform = transform.toString();
    }
  }

  canvas.addEventListener('paint', paint as EventListener);
  canvas.requestPaint?.();

  return () => {
    canvas.removeEventListener('paint', paint as EventListener);
  };
}
```

On pan/zoom:

```ts
function onViewportChanged(nextViewport: Viewport) {
  viewportRef.current = nextViewport;
  canvasRef.current?.requestPaint();
}
```

The key rule is that pan/zoom should update viewport state and request a canvas paint. It should not trigger a React re-render of every node.

## 8. Device-pixel-ratio handling

Canvas should be sized to the device pixel box to avoid blurry output.

The WICG example uses `ResizeObserver` with `devicePixelContentBoxSize`:

```ts
const observer = new ResizeObserver(([entry]) => {
  canvas.width = entry.devicePixelContentBoxSize[0].inlineSize;
  canvas.height = entry.devicePixelContentBoxSize[0].blockSize;
  canvas.requestPaint();
});

observer.observe(canvas, { box: 'device-pixel-content-box' });
```

For the prototype, this is enough. Later, verify the exact coordinate conventions for:

- CSS pixel coordinates,
- canvas backing-store pixels,
- device pixel ratio,
- returned DOM transforms,
- pointer event coordinates.

## 9. Visibility and culling

Start with all nodes mounted if the test graph is small enough. For realistic graphs, use visible-node culling.

Recommended progression:

1. **Prototype A:** mount all nodes, draw all nodes.
2. **Prototype B:** mount all nodes, draw only visible nodes.
3. **Prototype C:** mount only visible nodes plus overscan.

Culling should use graph/world coordinates, not DOM queries:

```ts
const visibleWorldRect = screenRectToWorldRect(canvasRect, viewport);
const visibleNodes = spatialIndex.search(expand(visibleWorldRect, overscan));
```

Use overscan so nodes do not mount/unmount on every small pan movement.

## 10. Interaction model for Model A

Model A intentionally keeps interaction simple:

- A node’s DOM wrapper is the drawing source.
- The same wrapper is transformed to the drawn location.
- Pointer events, inputs, focus, and accessibility should continue to target the DOM node.

For the first prototype, test these interactions explicitly:

- click node body,
- click nested button,
- type into nested input,
- focus/blur behavior,
- hover styles,
- drag node,
- drag canvas background,
- wheel/pinch zoom,
- keyboard navigation if relevant.

If native DOM interaction is too expensive or too hard to synchronize at scale, move to Model B later:

```text
Inactive nodes: drawn with drawElementImage(), custom graph hit testing.
Active node: normal DOM overlay outside the canvas.
```

But do not start with Model B unless Model A fails.

## 11. Performance experiment plan

### Baseline

Record current behavior in the existing xyflow-derived DOM renderer:

- 100 nodes,
- 500 nodes,
- 1,000 nodes,
- 2,500 nodes,
- highest realistic internal graph size.

Measure:

- frame rate during pan,
- frame rate during zoom,
- scripting time,
- style/layout time,
- paint time,
- composite time,
- input latency,
- memory usage.

### HTML-in-Canvas prototype

Run the same graph content with Model A.

Measure the same metrics.

Also record:

- cost of `drawElementImage()` per visible node,
- cost of assigning returned transforms,
- whether DOM repaint time disappears or merely moves elsewhere,
- whether input hit testing remains correct,
- whether the browser skips snapshots for any node styles,
- memory cost of many layoutsubtree children.

### Success criteria

The prototype is promising if:

- pan/zoom no longer shows large DOM repaint cost,
- frame rate is stable at target graph sizes,
- nested HTML controls still work acceptably,
- transform synchronization does not dominate frame time,
- no major visual mismatches appear between DOM rendering and canvas drawing.

## 12. Known constraints and risks

### Experimental API

The API is experimental and currently behind a Chromium flag. Names and behavior may change. The feature has already had naming changes in Chromium comments, so do not treat the current API as stable.

### Direct-child requirement

`drawElementImage()` requires the element being drawn to be a direct child of the `<canvas layoutsubtree>`.

This affects component structure. For graph nodes, the outer node wrapper should be the direct child:

```tsx
<canvas layoutsubtree>
  <div className="graph-node-source">...</div>
  <div className="graph-node-source">...</div>
</canvas>
```

Not:

```tsx
<canvas layoutsubtree>
  <div className="nodes-layer">
    <div className="graph-node-source">...</div>
  </div>
</canvas>
```

### Element must generate boxes

The source element cannot be `display: none`. For Model A, this should not be an issue because the source elements are real canvas children.

### CSS transform semantics

The canvas current transform affects drawing. CSS transforms on the source element are ignored for canvas drawing but still affect hit testing/accessibility. This is central to Model A.

### Paint timing

Drawing commands made during the `paint` event appear in the current frame. DOM changes made during that event may not be visible until a subsequent frame. Because Model A applies transforms to keep hit testing synchronized, this timing should be tested carefully.

### React update discipline

Pan/zoom must not cause React to re-render every node.

Use refs/external stores for viewport state during high-frequency interaction:

```text
pointer/wheel event
  -> update viewportRef
  -> canvas.requestPaint()
```

Avoid:

```text
pointer/wheel event
  -> setReactState(viewport)
  -> re-render graph tree
```

React state can still be updated after interaction settles if needed for persistence/debug UI.

## 13. Suggested milestone breakdown

### Milestone 1: Static draw

- Render a canvas with `layoutsubtree`.
- Add 5–10 real graph nodes as direct children.
- Draw them with `drawElementImage()`.
- Apply returned transforms.
- Confirm click/input interaction.

### Milestone 2: Pan/zoom viewport

- Add viewport state: `{ x, y, zoom }`.
- Draw edges and nodes under the canvas transform.
- On pointer drag/wheel, update viewport refs and call `requestPaint()`.
- Confirm no React node re-render during pan/zoom.

### Milestone 3: Real node components

- Replace simple demo nodes with production node components.
- Verify nested controls, hover states, focus, and dynamic content.
- Test expensive CSS styles: shadows, filters, gradients, text, images.

### Milestone 4: Scale test

- Add realistic graph sizes.
- Compare against current DOM renderer.
- Profile `drawElementImage()`, transform synchronization, and paint cost.

### Milestone 5: Culling

- Add spatial index.
- Draw only visible nodes.
- Then mount only visible + overscan nodes if needed.

### Milestone 6: Decision point

Choose one:

1. **Model A works:** continue hardening it.
2. **Model A visual drawing is fast but DOM transform sync is expensive:** move toward Model B.
3. **`drawElementImage()` itself is expensive at visible-node counts:** investigate WebGL/WebGPU texture paths or LOD rendering.
4. **API behavior is too unstable:** use the prototype as evidence, but delay production dependency.

## 14. Open questions for the prototype

- How expensive is `drawElementImage()` for our actual node DOM/CSS?
- Does transform synchronization for hundreds/thousands of visible nodes stay cheap?
- Are nested interactive controls reliable when the node is drawn through canvas?
- Do hover/focus/active CSS states invalidate the canvas at acceptable times?
- Does the API preserve text rendering quality at different zoom levels?
- Does changing zoom require redrawing at a different resolution to avoid blur?
- How much memory is used for layout snapshots of many complex nodes?
- Can we keep React entirely out of the pan/zoom hot path?

## 15. Minimal smoke-test HTML

Use this to verify the browser flag before integrating with the app:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>HTML-in-Canvas smoke test</title>
    <style>
      canvas {
        width: 600px;
        height: 300px;
        border: 1px solid #ccc;
      }

      form {
        width: 220px;
        padding: 16px;
        border: 1px solid #999;
        border-radius: 8px;
        background: white;
        transform-origin: 0 0;
      }
    </style>
  </head>
  <body>
    <canvas id="canvas" layoutsubtree>
      <form id="card">
        <label>
          Name
          <input value="HTML node" />
        </label>
        <button type="button">Click me</button>
      </form>
    </canvas>

    <script>
      const canvas = document.getElementById('canvas');
      const card = document.getElementById('card');
      const ctx = canvas.getContext('2d');

      if (!ctx.drawElementImage) {
        throw new Error('drawElementImage is unavailable. Enable chrome://flags/#canvas-draw-element and relaunch Chrome Canary.');
      }

      canvas.onpaint = () => {
        ctx.reset();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const transform = ctx.drawElementImage(card, 160, 80);
        card.style.transform = transform.toString();
      };

      const observer = new ResizeObserver(([entry]) => {
        if (entry.devicePixelContentBoxSize?.[0]) {
          canvas.width = entry.devicePixelContentBoxSize[0].inlineSize;
          canvas.height = entry.devicePixelContentBoxSize[0].blockSize;
        } else {
          const rect = canvas.getBoundingClientRect();
          canvas.width = Math.round(rect.width * devicePixelRatio);
          canvas.height = Math.round(rect.height * devicePixelRatio);
        }
        canvas.requestPaint();
      });

      observer.observe(canvas, { box: 'device-pixel-content-box' });
    </script>
  </body>
</html>
```

## 16. Documentation links

- [WICG HTML-in-Canvas explainer](https://github.com/WICG/html-in-canvas)
- [Blink intent to experiment: HTML-in-canvas](https://groups.google.com/a/chromium.org/g/blink-dev/c/t_nGEmJ_v4s)
- [Chrome Platform Status: HTML-in-canvas](https://chromestatus.com/feature/5172548013916160)
- [Chromium RuntimeEnabledFeatures entry for `CanvasDrawElement`](https://chromium.googlesource.com/chromium/src.git/+/HEAD/third_party/blink/renderer/platform/runtime_enabled_features.json5)
- [HTML-in-Canvas browser support/setup guide](https://html-in-canvas.dev/docs/browser-support/)
- [HTML-in-Canvas demo gallery](https://html-in-canvas.dev/)
- [WHATWG HTML pull request for HTML-in-Canvas](https://github.com/whatwg/html/pull/11588)
