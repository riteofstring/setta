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

Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as the
local reference root. The highest-signal examples are:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas/plugins/html-cloth.mjs`
  - Keeps a real HTML source element, uploads it with `texElementImage2D`,
    raycasts the rendered mesh to UV, maps UV back to source HTML coordinates,
    forwards interaction, and refreshes the texture without switching to a
    visible DOM rendering.
  - Key sections: `_createSourceElement`, `_wireInteractions`,
    `_drawVideoFrame`, `_uploadTexture`, `_refreshTexture`, `_handlePointer`,
    `_updateSliderFromClient`.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/random-stuff/apps/curved-markup/src/App/index.tsx`
  - A compact proof for curved interactive markup. It injects a
    `texElementImage2D`-backed texture into Three.js, maps a layout-subtree DOM
    child onto a curved subdivided plane, raycasts to UV, then translates the
    real DOM source so native text selection, links, buttons, range input, and
    select focus hit the same source pixel that is visually under the pointer.
  - This is the clearest reference for the target Setta interaction projector:
    the visual can be non-affine while the source DOM stays real and native.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html`
  - Uses `drawElementImage` to capture styled buttons, applies the returned
    transform back to the source element, copies the result into an intermediate
    source canvas, and redraws it through a triangle mesh for pointer-driven
    ripple distortion.
  - Treat the mesh/distortion technique as relevant, but do not copy its
    every-frame `requestPaint` pattern into Setta pan/zoom. Setta must animate
    effect uniforms or mesh vertices without recapturing HTML unless content
    actually changed.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Uses `canvas.requestPaint`, `canvas.onpaint`, and
    `GPUQueue.copyElementImageToTexture` to use HTML as a WebGPU texture source
    inside a shader-rendered scene.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/raycastInteractionManager.ts`
  - Shows the core interaction trick for non-flat surfaces: raycast to UV, move
    the real source element so the texture pixel under the pointer is also under
    the browser pointer, then let native DOM hit testing identify the target.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/interactionManager.ts`
  - Shows matrix-based alignment for affine/3D planar surfaces.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-room/extension/entrypoints/content.ts`
  - Documents the important browser behavior: source element CSS transforms
    affect hit testing but are ignored by texture capture, so the same DOM can be
    positioned for interaction without changing the uploaded bitmap.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/3d-room-live-content/demo.html`
  - Shows multi-surface HTML textures in a Three.js room and documents hard
    browser constraints: layout-subtree sources must remain laid out and painted,
    `display: none`, `visibility: hidden`, `opacity: 0`, `left: -9999px`, and
    `clip-path` can produce blank/no cached paint records, and a 1x1 clipped
    in-viewport staging container is a reliable hiding pattern when staging is
    unavoidable.
  - Also shows UV-to-form interaction for a 3D surface, including cases where
    `elementFromPoint` is unusable because the staged source is clipped, so the
    projector must be able to map UV/local coordinates to stable interactive
    descendants directly.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/css-to-shader/demo.html`
  - Demonstrates a live DOM source rendered through a WebGL shader while the DOM
    remains the native interaction target. It reinforces the split Setta needs:
    shader/effect uniforms can change every frame, but HTML recapture should be
    tied to content, size, and style invalidation.
  - It also shows interaction-triggered CSS animations and transitions such as
    click ripples, hover transitions, clocks, and animated visual content. Those
    require explicit capture-frame scheduling while the source animation is
    active; GPU-only shader time uniforms should animate independently without
    forcing DOM recapture.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/elastic-bulge/demo.html`
  - Minimal WebGL2 `texElementImage2D` displacement shader over a
    layout-subtree element. Use it to compare direct element-to-GL upload
    behavior against Setta's WebGPU `copyElementImageToTexture` path.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/multi-element-composition/demo.html`
  - Uses one layout-subtree canvas with multiple children, draw-order-controlled
    z stacking, returned transforms applied back to each source element,
    `paint.changedElements`, and direct manipulation of draggable child state.
    This is the best local reference for multiple Setta node sources sharing one
    canvas and for dirtying only the surfaces whose child DOM changed.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official/README.md`
  - Source for API constraints: captured elements must be direct canvas
    children, must generate boxes, CSS transforms are ignored for drawing, and
    `paint.changedElements` is the authoritative dirty signal.

Secondary references in the same root are useful for specific implementation
questions:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/htmlTexture.ts`
  - Texture lifecycle, paint-event recapture, and retaining the original source
    element for interaction managers.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/threeHTMLRenderer.ts`
  - Assigning HTML-derived textures to scene objects and requesting repaint for
    animated HTML sources.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-cracks/src/main.js`
  - WebGPU-style HTML texture upload and shader/effect rendering over captured
    HTML.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`
  - WebGL2 `texElementImage2D` upload, shader transitions, and texture
    invalidation around interactive HTML.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-demo/demos/water-drop/README.md`
  - Compact effect demo pointer for water-drop-style shader treatment over HTML.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas/demos/wicg/tearable-cloth-buttons.html`
  - Additional button-specific 2D mesh, tear, shatter, and hover-effect patterns
    driven from real DOM button sources.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas/demos/wicg/sphere-html-three.html`
  - Raw-HTML version of the Three.js sphere mapping and UV-to-source transform
    pattern.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas/demos/wicg/sphere-html-three-ripple.html`
  - Variant that keeps the HTML texture source and drives a GPU ripple effect
    over the sphere from pointer-derived UVs.
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/src/content/demos/offscreen-canvas-worker/demo.html`
  - Documents the proposed `captureElementImage`/worker shape and current
    Chromium gaps: `captureElementImage` is not implemented there, and
    `createImageBitmap(layoutsubtreeCanvas)` can crash, so worker offload must
    be probe-gated rather than assumed.

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
  - Tracks dirty bytes and active animation leases so transition/animation
    recapture is bounded to the affected surface or tile.
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
  - Owns the frame scheduler bridge for animated HTML sources: interaction
    events and animation lifecycle events may request capture frames for a
    specific surface, while viewport-only frames remain upload-free.

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

Treat the `3d-room-live-content` demo and
`three-html-render/src/threeHTMLRenderer.ts` as the canonical source-visibility
evidence. Native capture needs the source to remain visible enough for Chromium
to record paint; this is a correctness requirement, not a cosmetic detail. A
production source host that uses `nodeVisibility="hidden"`,
`sourceVisibility="hidden"`, `visibility: hidden`, `opacity: 0`, offscreen
parking, or clipping must fail the source-policy gate.

Do not park capture sources far offscreen with `left: -9999px` or hide them with
`clip-path`. The `3d-room-live-content` demo shows Chromium can skip painting
those sources, leaving no cached paint record. If a non-Setta staging canvas is
ever required for a fixture or probe, keep it in the viewport with real
dimensions and clip it through a tiny visible wrapper; production Setta node
sources should remain direct children of the main layout-subtree canvas.

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

Treat `html-in-canvas-dot-dev/src/content/demos/multi-element-composition/demo.html`
as the canonical dirty-ownership example. When `paint.changedElements` is
available, map each changed element to the owning Setta surface or tile and dirty
only that owner. Do not widen a browser-reported child change into all visible
sources or all surfaces sharing the canvas. If a probe shows `changedElements`
is not usable, rely on explicit Setta source-owned dirty events and fail the
probe loudly instead of guessing dirty regions from DOM selectors or text.

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

Avoid framework texture abstractions that do not understand layout-subtree paint
invalidation. The `3d-room-live-content` demo found Three.js `CanvasTexture`
stalled when handed a `<canvas layoutsubtree>` directly and needed an
intermediate regular canvas. Setta's production path should prefer direct
`GPUQueue.copyElementImageToTexture` from the source element or an explicitly
probe-backed mirror path only where a fixture/library makes that unavoidable.

## HTML Transition And Animation Policy

HTML interactions must preserve source-owned visual motion through the
GPU-rendered surface. A toggle knob sliding to its checked position, hover and
focus transitions, text caret blink, progress indicators, and finite CSS
animations triggered by click or keyboard input must not jump straight to a
final texture or disappear while the DOM source is hidden behind the GPU path.

Treat animated HTML as a texture invalidation problem with a bounded active
animation lease:

1. When an interaction changes visual state or receives `transitionrun`,
   `transitionstart`, `animationstart`, or a source-owned dirty event with an
   animation flag, mark that surface or tile as `interactive` and
   `animated`.
2. Request a paint and upload the first animation frame immediately under the
   interactive upload budget.
3. Continue scheduling capture frames only for the animated surface or tile while
   the lease is active. Use `paint.changedElements` when the browser reports it,
   but do not assume CSS animations will produce useful paint events without a
   requested paint.
4. End the lease after `transitionend`, `transitioncancel`, `animationend`, or
   `animationcancel` plus one settled paint frame, and verify with
   `element.getAnimations({ subtree: true })` where available. If browser events
   are missing, derive a bounded fallback duration from computed
   `transition-*` and `animation-*` timing on the affected target subtree.
5. Enforce per-surface frame, byte, and duration budgets so one animated source
   cannot starve other interactive uploads. If a surface cannot stay inside the
   budget, fail visibly or degrade that source explicitly instead of silently
   dropping animation frames forever.

Finite source animations may recapture HTML at animation cadence; passive
viewport pan/zoom still must not request paint, upload textures, or rewrite
per-node transforms. Infinite or long-running source animations such as a
terminal cursor, text caret, media preview, clock, or plugin-owned activity must
opt into an explicit source-owned animation cadence and may be rate-limited when
the surface is not focused or visible. Shader-only and mesh-only effects should
animate by updating uniforms or vertices and should not recapture HTML unless
the DOM texture content itself changed.

## Interaction Projection

Interaction is a projection problem, not a rendering-mode switch.

Treat `random-stuff/apps/curved-markup/src/App/index.tsx` and
`three-html-render/src/raycastInteractionManager.ts` as the canonical production
interaction model, not merely fixture inspiration. The source DOM may be
temporarily transformed so the source pixel under the pointer is also under the
browser pointer, but the visible surface remains the GPU-rendered texture. This
is not the old DOM teleport overlay path, and it must flow through the generic
`HtmlSurfaceVisualScene`/hit-projector contract for flat, mesh, and effect
surfaces.

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
   visual state, and start an animation lease if the changed state begins a CSS
   transition, CSS animation, caret blink, or source-owned animation cadence.

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
- Sources hidden with `display: none`, `visibility: hidden`, `opacity: 0`,
  `left: -9999px`, or `clip-path` fail loudly if they lose cached paint records.
- Source-subrect uploads work, or fail loudly.
- `getElementTransform` exists and returns usable affine transforms.
- `paint.changedElements` granularity is usable for per-node and per-tile dirty
  marking.
- Interaction-triggered CSS transitions and animations can be captured across
  multiple requested paint/upload frames, and their lifecycle events or
  `getAnimations({ subtree: true })` state are usable to stop the animation
  lease after the final visual frame.
- `drawElementImage` returned transforms keep source hit boxes aligned for
  affine multi-element composition.
- Direct layout-subtree canvas use with any library texture abstraction chosen
  for tests or fixtures does not stall; otherwise use direct element upload or a
  probe-backed mirror.
- `captureElementImage` and worker transfer behavior is documented as available
  or unavailable in the current Chromium; do not depend on it for the initial
  replacement unless the probe proves it usable.

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
10. Add a Setta-local complex-surface fixture based on `html-cloth.mjs`,
    `curved-markup`, and the WICG ripple/cloth button demos: warped mesh or
    curved surface, shader-driven visual deformation, slider, button, text
    input, animated toggle/switch transition, hover state, selection/focus, and
    live texture refresh only when DOM content or source-owned animation frames
    actually change.
11. Run focused unit, integration, and browser performance verification.

Do not keep the old teleport behavior behind a flag. If the new branch breaks
while the replacement is in progress, that is acceptable.

## Performance Baseline And Gates

Record baseline before deleting the old path. Each pan/zoom baseline and final
measurement must include both the isolated renderer hot path and the full
input-driven browser workflow:

- Isolated hot path: update the viewport store directly, then measure frame
  scheduling, renderer work, GPU writes, texture uploads, `requestPaint`, source
  style mutations, and RAF frame intervals. This proves viewport-state changes
  are rendered without HTML recapture.
- End-to-end user workflow: drive real wheel, trackpad-equivalent, pointer-pan,
  and zoom gestures through the browser against the production surface, then
  measure the same counters plus event-handler duration, long tasks, dropped or
  coalesced frames, store updates, and visual smoothness. This proves the input
  controller, event routing, store subscriptions, frame scheduler, and renderer
  work together under actual user interaction.
- Large-project coverage: run the end-to-end pan/zoom workflow over a dense
  Settings -> All Settings-style project or checked-in large-graph fixture with
  visible edges and representative node content. A two-node smoke route is not
  enough to satisfy the pan/zoom performance gate.

Scenarios:

- Settings -> All Settings pan at normal zoom.
- Settings -> All Settings zoom in/out.
- Node drag with edges visible.
- Box selection over a large node set.
- Text input, slider drag, CodeMirror edit, and terminal input if available.
- Texture upload count, upload bytes, frame time, long tasks, and DOM writes per
  viewport frame.

Required performance invariants:

- Both isolated and end-to-end pan/zoom average and p95 frame time must be no
  worse than the corresponding baseline by more than 5%.
- Both isolated and end-to-end pure pan/zoom must perform zero texture uploads.
- Both isolated and end-to-end pure pan/zoom must perform zero per-node DOM
  transform writes.
- Pointer move over a surface may write at most one source transform.
- Active interaction uploads must stay within the configured frame budget.
- Active HTML transition and animation recaptures must stay within the same
  configured count, duration, and byte budgets, and must stop after the source
  animation lease ends.
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
- active animation leases schedule bounded recapture frames, mark only the
  owning surface/tile dirty, and stop after transition/animation completion
- active interaction no longer suppresses GPU quads or creates settling clones

Browser tests:

- pan and zoom large projects at baseline performance
- button hover/click shows through GPU texture without DOM overlay switching
- animated toggle/switch movement remains visible through the GPU texture from
  the first frame to the final settled state
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
- Interaction-triggered HTML transitions and animations, including toggle or
  switch movement, hover/focus transitions, caret blink, and finite CSS
  animations, remain visible through the GPU-rendered surface while staying
  within explicit animation recapture budgets.
- A cloth-style non-affine HTML surface supports interactive controls while
  staying visually warped.
- Dirty uploads are bounded by count, duration, and bytes.
- Performance reports and CDP visual verification are checked before the
  implementation is considered done.
