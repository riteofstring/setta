# GPU Flow Live Active Node DOM Plan

## Goal

Restore native-feeling node controls while keeping pan and zoom on the WebGPU path.

The target architecture is:

- Use cached WebGPU textures for passive nodes.
- Use real browser-rendered DOM for the single node or control the user is actively manipulating.
- Stop trying to make switches, text carets, sliders, CodeMirror, terminals, and CSS transitions feel live by repeatedly recapturing a full node texture.
- Refresh the GPU texture after the interaction settles, then return the node to the texture path.

This plan replaces the current active-node texture-upload feedback loop with a live DOM interaction layer.

## Why The Current Patch Is Not Enough

The current WebGPU node path captures a whole node element into a texture:

- `NodeTextureManager.markNodeTextureDirty()` queues a node and calls `canvas.requestPaint()`.
- `NodeTextureManager.uploadRecord()` calls `GPUQueue.copyElementImageToTexture(record.element, record.pixelWidth, record.pixelHeight, ...)`.
- `GpuProjectSurface` caps uploads at `maxUploads: 2` and `maxDurationMs: 4`.

That is the right model for passive snapshots. It is the wrong model for live controls.

A switch animation needs many visual samples during its transition. If each sample requires recapturing an entire Setta node, then the switch animation speed depends on full-node capture cost. That is why the switch can still animate slowly even after repeated active uploads.

The `html-cloth.mjs` reference is fundamentally different:

- It has one stable `1024x1024` source DOM texture.
- It refreshes that one texture as part of the normal app update loop.
- It uses `texElementImage2D` directly into an existing WebGL texture.
- It manually bridges interaction from mesh UV coordinates to DOM events.
- Its GIF is a hidden video drawn into a nested canvas, with explicit invalidation every frame.

Setta has many large, independently dirty, React-owned node trees. Re-uploading a whole node at animation cadence is not equivalent.

## Design Principle

Textures are snapshots. Active interaction is live DOM.

For the active node:

1. Put a real DOM presentation of the active node above the WebGPU canvas.
2. Route pointer and keyboard interaction to that live DOM.
3. Hide or suppress the matching GPU quad so the user sees one node, not two.
4. Defer texture refresh until the interaction pauses or ends.
5. Upload one final texture snapshot and return to the normal GPU path.

## Phase 1: Baseline And Probes

Record a baseline before implementation and store it in `perf/reports/frontend/`.

Required baseline actions on Settings -> All Settings:

- Click a visible switch and measure:
  - time from pointerdown to first visible state change
  - apparent transition duration
  - `requestPaint` count
  - `copyElementImageToTexture` count
  - any long tasks during the transition
- Type into a visible node-local text input and measure:
  - keydown/input to visible character latency
  - caret responsiveness
  - texture upload count
- Drag a range/slider input if available.

Required probes:

1. Verify whether a `<canvas layoutsubtree>` child can be visually promoted above the canvas with CSS alone.
   - If yes, prefer promoting the existing node element.
   - If no, use an outside-canvas live DOM layer.

2. Verify whether `copyElementImageToTexture` can capture an element outside the canvas layout subtree.
   - If yes, the live overlay can be the capture source after settle.
   - If no, keep a canvas-child source element for capture and a separate outside-canvas live layer for interaction.

3. Measure whole-node capture cost for representative nodes:
   - small settings node
   - large settings node
   - CodeMirror node
   - terminal node
   - chat node

Do not start implementation until these results are recorded. They determine whether the active layer can reuse the source DOM or must duplicate it.

## Phase 2: Active DOM Layer Architecture

Add a new active DOM layer outside the WebGPU canvas:

- `frontend/src/gpuFlow/GpuActiveNodeDomLayer.tsx`
- mounted as a sibling of `GpuSurface`, above the canvas and below global popovers
- `position: absolute; inset: 0; pointer-events: none`
- one child for the active node with `pointer-events: auto`

The layer receives:

- `activeNodeId`
- active node layout
- current GPU viewport
- active target descriptor, if known
- node renderer
- lifecycle callbacks

The active node element uses the same screen transform as the GPU quad:

```ts
transform: translate(screenX, screenY) scale(zoom)
transform-origin: 0 0
width: node.width
height: node.height
z-index: node.zIndex
```

While active, `GpuNodeLayer` should mark that node as live-DOM-active. The GPU renderer should either:

- skip drawing that node quad, or
- draw it underneath the live DOM only until the live DOM has mounted.

Prefer skipping the active quad once the live layer confirms mount. That avoids double-render artifacts during switch transitions.

## Phase 3: Choose Promotion Strategy

Use the Phase 1 probe results to choose one strategy.

### Strategy A: Promote Existing Source DOM

Use this only if canvas layout subtree children can be visually promoted above the canvas without breaking capture.

Approach:

- Keep one React-owned `SectionContainer` instance.
- When active, apply a live-active style/class to the existing node wrapper.
- Ensure it visually appears above the WebGPU canvas.
- Continue using the same element as the texture source after settle.

Advantages:

- No duplicate React tree.
- Best for CodeMirror, terminals, focus, and local state.

Risks:

- Browser may not composite canvas fallback/layoutsubtree children as normal DOM.
- CSS stacking may not escape the canvas rendering model.

### Strategy B: Separate Live Overlay Render

Use this if source DOM cannot be promoted.

Approach:

- Keep the canvas-child node DOM as the texture source.
- Render a second active `SectionContainer` instance outside the canvas for interaction.
- Suppress pointer events on the canvas-child source node while the live overlay is active.
- Suppress the GPU quad for that node while the live overlay is active.
- On settle, upload a texture from the source element after project state has converged.

Advantages:

- Works with normal DOM composition.
- Browser renders switch transitions, text inputs, caret, CodeMirror selection, and terminal cursor natively.

Risks:

- Duplicate `SectionContainer` mounting may create duplicate subscriptions, observers, editors, terminal instances, or effects.
- Must audit section types that cannot tolerate duplicate mounting.

If duplicate mounting is unsafe for key section types, introduce an owner-supported "active presentation" mode in the relevant component owners instead of a generic duplicate render.

## Phase 4: Interaction Handoff

The first click matters. If the live DOM appears only after the first event, switches and sliders will still feel wrong.

Implement activation in the interaction controller:

- On pointer hover/move over an interactive target, pre-arm the active DOM layer for that node after a short threshold or immediately for controls.
- On pointerdown inside an interactive target:
  - resolve the node id
  - resolve a stable target descriptor for the control
  - synchronously activate the live DOM layer
  - route the pointerdown to the matching live DOM control if the browser event landed on the texture/source path

Target descriptor should avoid brittle CSS selectors when possible:

- use `data-*` attributes already present on params and sections
- otherwise compute a DOM path scoped to the node
- do not use visible text labels as the primary target identity

For controls:

- Switch/button: route pointerdown/up/click to the overlay control if needed.
- Range/slider: use pointer capture on the overlay control; all drag movement must go to live DOM.
- Text input/textarea/contenteditable: focus the overlay control immediately and let browser text input handle caret/selection.
- CodeMirror/terminal: prefer activating on hover/focus and let the real overlay editor receive input directly.

The `html-cloth.mjs` example manually maps raycast UVs to DOM events. Setta should not need UV raycasting, but it does need the same discipline: interaction must be routed to the DOM that is visually presented to the user.

## Phase 5: Texture Refresh Policy

Remove the current "upload every frame for 240ms" behavior once live DOM is in place.

New policy:

- During active interaction:
  - do not upload active node texture every frame
  - keep passive node texture uploads budgeted
  - keep active node GPU quad suppressed
- On settle:
  - mark active node texture dirty with `priority: "interactive"`
  - request one paint
  - upload the final snapshot
  - restore GPU quad
  - unmount or deactivate live DOM

Settle triggers:

- pointerup/pointercancel for pointer controls
- blur/focusout for text inputs and editors
- debounce after input events, initially 150-250ms
- explicit dirty events from CodeMirror/terminal after their own update cycle

Do not hide the live DOM until the final GPU texture upload has completed. This prevents a stale texture flash.

## Phase 6: Component Safety Audit

Before enabling Strategy B broadly, audit these component families:

- Param inputs
- Switch inputs
- Combobox/dropdowns
- CodeMirror sections
- Terminal sections
- Chat sections
- Spreadsheet sections
- Browser/iframe/image/media sections

For each, decide:

- safe to duplicate for active overlay
- must use existing DOM promotion
- needs a dedicated active presentation mode
- should stay texture-only temporarily

Document any duplication exception near the implementation. Do not add silent compatibility shims.

## Phase 7: Tests

Unit tests:

- active node snapshot resolves screen position correctly
- active DOM layer uses the same transform math as GPU node quads
- active node GPU quad is skipped while live DOM is mounted
- texture upload is deferred during active interaction
- final texture upload happens before live DOM unmount
- interaction controller resolves and stores active target descriptors
- first-click handoff routes switch/button interaction to live DOM
- slider pointer capture continues after pointerdown
- text input focus is preserved in live DOM

Integration tests:

- switch toggles and CSS transition completes at native duration
- typing in a param input shows characters immediately
- slider drag updates smoothly
- CodeMirror caret/selection remains responsive
- terminal cursor/input remains responsive

Avoid tautological tests. Tests should assert user-visible behavior or concrete lifecycle ordering.

## Phase 8: Browser Verification

Use Chrome DevTools MCP. Required checks:

- Settings -> All Settings at normal zoom
- Settings -> All Settings after zoom in/out
- switch click transition
- text input typing
- slider drag
- CodeMirror editing if available
- terminal input if available

Record before/after in `perf/reports/frontend/`:

- apparent switch transition duration
- input visible latency
- active interaction texture upload count
- long tasks
- frame rate while dragging slider
- screenshot or trace artifact path

Expected result:

- Active switch animation duration matches normal DOM.
- Typing is visibly immediate.
- Active interaction does not depend on repeated full-node texture uploads.
- Pan/zoom performance remains at the current GPU level.

## Phase 9: Cleanup

After live DOM active interaction is verified:

- Remove or narrow the active-node clone overlay fallback.
- Remove the short repeated active texture upload loop.
- Keep dirty texture uploads for final snapshots and passive updates.
- Keep upload budget controls for passive nodes.
- Update `docs/plans/webgpu-html-texture-pan-zoom-plan.md` with the corrected active-interaction architecture.

## Open Questions

- Can a canvas layoutsubtree child be visually promoted above the canvas on the local Chromium build?
- Can WebGPU `copyElementImageToTexture` capture outside-canvas DOM elements?
- Which Setta section types are unsafe to duplicate?
- Do CodeMirror and terminal need dedicated active presentation wrappers?
- Should active DOM be node-level always, or control-level for simple params?

## Success Criteria

The implementation is done only when:

- switch animation is indistinguishable from normal DOM
- text input/caret feedback is immediate
- slider drag feels native
- no active interaction relies on uploading a full node texture every frame
- GPU pan/zoom performance does not regress
- before/after performance reports are checked in
- CDP visual verification is recorded in the final implementation response
