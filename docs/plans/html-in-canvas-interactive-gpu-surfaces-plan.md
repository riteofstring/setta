# Interactive HTML GPU Surfaces Plan

## Goal

Replace the current active-node DOM teleport/snapshot model with a single
HTML-in-canvas architecture where Setta nodes stay interactive while their
visual representation is always GPU-rendered.

The end state must remove these limitations:

- No switching between "texture view" and "visible DOM overlay" when a node is
  interacted with.
- No assumption that an HTML node is rendered only as a flat affine quad.
- Interactive HTML controls must continue to work when the visual surface is
  warped, meshed, curved, shader-processed, or otherwise rendered like the
  `html-cloth.mjs` example.
- Pan/zoom performance must stay at least as good as the current WebGPU cached
  texture path.

No backward compatibility, legacy mode, transitional adapter, migration path, or
dual renderer is required. This should replace the old architecture on the new
branch, not sit beside it.

## Current Architecture To Replace

Current frontend ownership lives under `frontend/src/gpuFlow/` and is wired
through `frontend/src/components/Pages/Project/GpuProjectSurface/`.

Important pieces:

- `GpuSurface.tsx` creates the `<canvas layoutsubtree>` WebGPU surface and
  listens for `paint`.
- `GpuNodeLayer/nodeLayerFrame.tsx` mounts each node as a direct canvas child,
  computes visible flat quads, syncs DOM transforms, uploads dirty node
  textures, and renders quads.
- `nodeTextures.ts` owns `GPUQueue.copyElementImageToTexture` texture upload and
  memory eviction.
- `GpuNodeQuadRenderer` draws grid, edges, and flat node texture quads.
- `nodeInteractionDirty/` marks interactive nodes dirty and begins active
  interaction.
- `GpuActiveNodeTeleport.ts` moves the same node DOM out of the canvas into a
  visible overlay, suppresses the GPU quad, then restores the DOM and recaptures
  a final texture.

That teleport path is the main limitation. It gives native-looking interaction
for flat nodes by abandoning the GPU visual while active. It cannot preserve the
same visual output for non-affine surfaces, and it makes complex effects fight
against interaction instead of sharing the same source.

## Reference Lessons

Use the examples in
`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as
implementation references:

- `html-in-canvas/plugins/html-cloth.mjs`
  - Keeps a real HTML source element, uploads it with `texElementImage2D`,
    raycasts the rendered mesh to UV, maps UV back to source HTML coordinates,
    forwards interaction, and refreshes the texture without switching to a
    visible DOM rendering.
  - Key sections: `_createSourceElement`, `_wireInteractions`,
    `_drawVideoFrame`, `_uploadTexture`, `_refreshTexture`, `_handlePointer`,
    `_updateSliderFromClient`.
- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Uses `canvas.requestPaint`, `canvas.onpaint`, and
    `GPUQueue.copyElementImageToTexture` to use HTML as a WebGPU texture source
    inside a shader-rendered scene.
- `three-html-render/src/raycastInteractionManager.ts`
  - Shows the core interaction trick for non-flat surfaces: raycast to UV, move
    the real source element so the texture pixel under the pointer is also under
    the browser pointer, then let native DOM hit testing identify the target.
- `three-html-render/src/interactionManager.ts`
  - Shows matrix-based alignment for affine/3D planar surfaces.
- `html-in-canvas-room/extension/entrypoints/content.ts`
  - Documents the important browser behavior: source element CSS transforms
    affect hit testing but are ignored by texture capture, so the same DOM can be
    positioned for interaction without changing the uploaded bitmap.
- `html-in-canvas-official/README.md`
  - Source for API constraints: captured elements must be direct canvas
    children, must generate boxes, CSS transforms are ignored for drawing, and
    `paint.changedElements` is the authoritative dirty signal.

## Target Architecture

Build the new model around "HTML GPU surfaces" instead of "node DOM plus active
teleport".

Each node is represented by three linked objects:

- `HtmlSurfaceSource`: the real React-owned DOM node, always a direct child of
  the layout-subtree canvas, used for layout, accessibility, event targets, and
  texture capture.
- `HtmlSurfaceTexture`: one or more WebGPU textures or tiles uploaded from the
  source only when content or resolution changes.
- `HtmlSurfaceVisual`: GPU draw metadata that maps the texture onto a flat quad,
  mesh, cloth, curved surface, shader effect, or future 3D surface.

The source DOM never becomes the primary visible rendering. The GPU rendering is
always the visible rendering. Interaction moves or projects the source DOM for
hit testing, but it does not swap the node into a visible overlay.

### Pan/Zoom Hot Path

Pan and zoom must remain a pure GPU viewport update:

1. Update viewport state.
2. Write camera/viewport uniforms.
3. Draw grid, edges, and visible surfaces from cached textures.
4. Do not call `requestPaint`.
5. Do not call `copyElementImageToTexture`.
6. Do not force React renders.
7. Do not rewrite every node's DOM transform.

Passive source DOM can keep a stable capture position with `pointer-events:
none`. Only the currently targeted interaction source is moved for hit testing.
That keeps DOM writes O(1) per pointer event and O(0) for wheel/pinch pan/zoom
frames.

## New Frontend Modules

Replace the current active-node stack with these modules:

- `frontend/src/gpuFlow/htmlSurfaces/sourceLayer.tsx`
  - Owns direct canvas-child React portal hosts.
  - Keeps sources mounted, sized, contained, and capture-ready.
  - Does not write per-node viewport transforms during pan/zoom.
- `frontend/src/gpuFlow/htmlSurfaces/textures.ts`
  - Evolves `NodeTextureManager` into a surface texture/tile manager.
  - Supports full-surface textures, tiled large surfaces, dirty subrect uploads
    where Chromium exposes the required overload, and memory-budget eviction.
- `frontend/src/gpuFlow/htmlSurfaces/visualScene.ts`
  - Converts project nodes, edges, and effect metadata into a draw scene.
  - Stores flat surfaces, tiled surfaces, mesh surfaces, and effect surfaces in
    typed buckets.
- `frontend/src/gpuFlow/htmlSurfaces/renderer.ts`
  - Replaces `GpuNodeQuadRenderer`.
  - Keeps the current optimized flat-node pass for normal Setta nodes.
  - Adds mesh/effect passes for non-affine surfaces.
  - Draws all visible output from cached textures.
- `frontend/src/gpuFlow/htmlSurfaces/hitScene.ts`
  - Owns hit testing and projection from screen point to `{ nodeId, u, v,
    localX, localY }`.
  - Uses exact CPU inverse math for flat surfaces.
  - Uses mesh raycast against the same vertices used for rendering for cloth or
    curved surfaces.
  - Uses a GPU picking pass only when a shader effect has no deterministic CPU
    inverse.
- `frontend/src/gpuFlow/htmlSurfaces/interactionProjector.ts`
  - Aligns the real source DOM under the pointer based on projected UV/local
    coordinates.
  - Lets the browser resolve native targets when possible.
  - Dispatches pointer/wheel/focus/selection handoff events only when native
    pre-alignment cannot deliver the event.
- `frontend/src/gpuFlow/htmlSurfaces/frame.ts`
  - Coordinates paint events, dirty surfaces, upload budgets, rendering, and
    interaction state.

Delete the old active overlay files instead of preserving them:

- `GpuActiveNodeTeleport.ts`
- `GpuActiveNodeSnapshot.ts`
- active settling clone logic in `GpuFlow/flowFrame.tsx`
- teleport-specific suppression/deferred-upload branches in
  `GpuNodeLayer/nodeLayerFrame.tsx`

## Source DOM Policy

Every surface source must be an immediate child of the layout-subtree canvas
because `copyElementImageToTexture` requires it. Do not hide sources with
`display: none`, `visibility: hidden`, or `opacity: 0`; those can affect capture.
The source is already not visually composited by the canvas.

Base source style:

```css
.setta-gpu-flow__html-source {
  contain: layout paint style;
  left: 0;
  pointer-events: none;
  position: absolute;
  top: 0;
  transform-origin: 0 0;
}
```

Passive sources remain at stable capture coordinates and do not track viewport
movement. Active or hovered sources are temporarily transformed for hit testing:

```ts
source.style.transform = `translate(${clientX - localX}px, ${clientY - localY}px)`;
source.style.pointerEvents = "auto";
```

For affine/planar surfaces, use `canvas.getElementTransform(element,
drawTransform)` when available. For non-affine surfaces, use raycast/pick UVs
and the "pixel under pointer" alignment from `RaycastInteractionManager`.

## Texture And Upload Policy

Uploads are allowed only when the source content or required resolution changes.
Viewport movement must never dirty textures.

Dirty sources:

- `paint.changedElements` from the layout-subtree canvas.
- Explicit Setta dirty events from CodeMirror, terminal, media, spreadsheet, and
  plugin-owned surfaces.
- Size changes from the node resize observer.
- Theme/style changes that affect rendered output.
- Resolution bucket changes after zoom settles.
- Active animated sources that explicitly request a frame.

Upload priority:

- `interactive`: the currently focused/dragged/typed surface or tile.
- `visible`: visible surfaces that are dirty.
- `prefetch`: near-viewport surfaces.

Keep the current project budget shape as the starting point:

- `maxUploads: 2`
- `maxDurationMs: 4`

Then add byte accounting:

- upload bytes per frame
- upload bytes per interaction
- skipped upload bytes while viewport interaction is active
- per-surface texture memory

Large nodes must be tiled before they become a performance problem. Tiling is
mandatory for CodeMirror, terminal, spreadsheet, browser/iframe-like sections,
and any surface that can exceed a single practical texture budget. The renderer
draws tiles as separate UV regions while the hit projector still maps the
surface as one logical DOM source.

If Chromium exposes source-subrect `copyElementImageToTexture`, use it for dirty
tiles. If it does not, fail the tile-subrect probe loudly and choose between full
tile recapture or smaller source-owned tiles. Do not add heuristic dirty-region
guessing.

## Interaction Projection

Interaction is a projection problem, not a rendering-mode switch.

Pointer flow:

1. Receive pointer move/down/wheel on the canvas container.
2. Resolve a surface hit from the GPU visual scene.
3. Convert the hit to source local coordinates.
4. Align the source DOM so that local coordinate sits under the browser pointer.
5. Enable pointer events only on that source.
6. Resolve the real DOM target from browser hit testing.
7. Let native events happen when pre-alignment already made the source the event
   target.
8. Otherwise perform a narrow handoff to the resolved target and keep pointer
   capture state in the interaction projector.
9. Mark the source or tile dirty only if the interaction changed content or
   visual state.

For flat nodes, this is simple inverse viewport math. For cloth/mesh nodes, the
hit scene must raycast triangles and interpolate UVs. For shader-only effects,
the effect must provide an inverse projection or opt into a picking pass that
returns exact node id and UV. Effects without a deterministic hit projector are
not interactive.

Do not use visible text, labels, or brittle selectors to identify targets. Use
the existing stable node/control metadata and generated DOM descriptors.

## Complex Surface Support

Introduce a typed surface visual contract:

```ts
type HtmlSurfaceVisual =
  | { kind: "flat"; nodeId: string; rect: FlowRect }
  | { kind: "tiled-flat"; nodeId: string; rect: FlowRect; tiles: SurfaceTile[] }
  | { kind: "mesh"; nodeId: string; vertices: SurfaceVertex[]; indices: Uint32Array }
  | { kind: "effect"; nodeId: string; effectId: string; projectorId: string };
```

Each non-flat visual must provide:

- the texture source and UV domain
- render pipeline inputs
- exact hit projection
- dirty/upload policy
- bounds for culling
- accessibility/focus alignment policy

Start with three built-in visuals:

1. `flat`: replacement for the current node quad path.
2. `mesh`: enough to reproduce the `html-cloth.mjs` class of effect with
   interactive controls mapped through UVs.
3. `shader-effect`: a small effect pipeline with explicit hit projector support.

Only expose plugin-authored visual effects after the contracts are Go-owned or
generated from Go-owned metadata. Frontend-local effect registries are acceptable
for internal experiments, but not as a duplicated public contract.

## Rendering Pipeline

Keep the default Setta graph path optimized:

- flat surfaces are culled in flow space
- camera uniform handles pan/zoom
- node geometry buffers are updated only when node layout changes
- texture bind groups update only when texture records change
- edge and grid rendering remain GPU-owned

Add specialized passes after the flat pass:

- tiled flat pass
- mesh/effect pass
- optional picking pass for effects that need it

Do not recapture HTML during render. The renderer only consumes texture records
that already exist.

If draw-call count becomes the bottleneck, implement an atlas for normal flat
nodes before reducing visual fidelity. Atlas work should be data-driven by the
performance baseline, not speculative.

## API Probes

Before replacing code, add one browser probe page or test harness that verifies
the exact Chromium behavior this plan depends on:

- `copyElementImageToTexture` overloads available in this browser.
- Source element must be direct canvas child.
- CSS transforms are ignored for capture.
- CSS transforms affect hit testing.
- Transform-only source movement does not fire `paint`.
- Overlapping passive source children with `pointer-events: none` still capture.
- Source-subrect uploads work, or fail loudly.
- `getElementTransform` exists and returns usable affine transforms.
- `paint.changedElements` granularity is usable for per-node and per-tile dirty
  marking.

Check the probe output into `perf/reports/frontend/` if it includes timing
numbers. Keep functional probe assertions in frontend tests.

## Migration By Replacement

Because no compatibility is required, implement in this order:

1. Baseline current branch performance.
2. Add API probes and fail loudly on missing required APIs.
3. Replace `GpuNodeLayer` host mounting with `HtmlSurfaceSourceLayer`.
4. Replace viewport DOM transform sync with stable source placement plus
   O(1) interaction source alignment.
5. Replace `NodeTextureManager` with surface/tile texture management.
6. Replace `GpuNodeQuadRenderer` with the new renderer while preserving the
   default flat pass performance path.
7. Add hit scene and interaction projector.
8. Delete active node teleport, settling clones, and texture/DOM switching.
9. Port project surface wiring to the new modules.
10. Add a Setta-local complex-surface fixture based on the `html-cloth.mjs`
    interaction model: warped mesh, slider, button, text input, hover state, and
    live texture refresh.
11. Run focused unit, integration, and browser performance verification.

Do not keep the old teleport behavior behind a flag. If the new branch breaks
while the replacement is in progress, that is acceptable.

## Performance Baseline And Gates

Record baseline before deleting the old path:

- Settings -> All Settings pan at normal zoom.
- Settings -> All Settings zoom in/out.
- Node drag with edges visible.
- Box selection over a large node set.
- Text input, slider drag, CodeMirror edit, and terminal input if available.
- Texture upload count, upload bytes, frame time, long tasks, and DOM writes per
  viewport frame.

Required performance invariants:

- Pan/zoom average and p95 frame time must be no worse than the baseline by more
  than 5%.
- Pan/zoom must perform zero texture uploads.
- Pan/zoom must perform zero per-node DOM transform writes.
- Pointer move over a surface may write at most one source transform.
- Active interaction uploads must stay within the configured frame budget.
- Texture memory must stay within the existing node texture budget unless a
  checked-in report justifies changing it.
- Complex mesh/effect surfaces must not slow the default flat graph path when no
  such surfaces are visible.

Store before/after reports in `perf/reports/frontend/` as append-only artifacts.

## Tests

Unit tests:

- source elements remain direct canvas children and generate boxes
- pan/zoom does not call `requestPaint`
- pan/zoom does not call `copyElementImageToTexture`
- pan/zoom does not rewrite every source transform
- paint changed elements dirty only owning surfaces/tiles
- flat hit projection maps screen coordinates to exact local coordinates
- mesh hit projection interpolates UVs from triangle hits
- shader effects without a projector cannot be interactive
- interaction alignment positions the source pixel under the pointer
- pointer capture keeps drag events routed to the resolved source target
- dirty uploads obey upload count, duration, byte, and priority budgets
- active interaction no longer suppresses GPU quads or creates settling clones

Browser tests:

- pan and zoom large projects at baseline performance
- button hover/click shows through GPU texture without DOM overlay switching
- text input caret and typing update through texture refresh
- slider drag remains responsive while rendered through a warped surface
- CodeMirror edit remains usable
- terminal input remains usable
- combobox/dropdown path uses the shared combobox system and remains usable
- complex fixture reproduces cloth-style mesh interaction with controls
- no texture upload occurs during pure pan/zoom

Avoid tests that only restate implementation logic. Assert user-visible behavior,
event routing, lifecycle ordering, and performance counters.

## Cleanup

After the replacement lands:

- Keep this plan as the active source for HTML-in-canvas interaction work. The
  older active DOM teleport and WebGPU texture pan/zoom plans have been removed
  because they described the architecture this plan replaces.
- Remove teleport-specific CSS:
  - `.setta-gpu-flow__active-node-teleport-layer`
  - `.setta-gpu-flow__node--teleported`
  - `.setta-gpu-flow__node--settling-clone`
- Remove tests that exist only for active teleport/settling clone behavior.
- Keep or rename texture, renderer, and interaction tests that still cover the
  new source/texture/projection model.

## Success Criteria

The architecture is complete when:

- Setta never switches an active node from GPU texture rendering to visible DOM.
- All visible node content is rendered through the GPU path, active or passive.
- Flat nodes match or beat the current pan/zoom performance baseline.
- Pure pan/zoom triggers no HTML capture, texture upload, React render, or
  per-node DOM transform sync.
- Buttons, sliders, text inputs, CodeMirror, terminal, and shared comboboxes
  remain interactive through the GPU-rendered surface.
- A cloth-style non-affine HTML surface supports interactive controls while
  staying visually warped.
- Dirty uploads are bounded by count, duration, and bytes.
- Performance reports and CDP visual verification are checked before the
  implementation is considered done.
