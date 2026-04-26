# GPU Flow Live Active Node DOM Plan

## Goal

Restore native-feeling node controls while keeping pan and zoom on the WebGPU path.

The target architecture is:

- Use cached WebGPU textures for passive nodes.
- Use real browser-rendered DOM for the single node or control the user is actively manipulating.
- Stop trying to make switches, text carets, sliders, CodeMirror, terminals, and CSS transitions feel live by repeatedly recapturing a full node texture.
- Refresh the GPU texture after the interaction settles, then return the node to the texture path.

This plan replaces the current active-node texture-upload feedback loop with a live DOM interaction layer.

## Current Status

As of 2026-04-29, this plan is partially executed and should not be run as a purely linear plan from Phase 1.

- Strategy A1, CSS-promoting a canvas layoutsubtree child so it visually paints above the canvas, is provisionally ruled out by local Chromium probes. Hit testing worked; visual compositing did not.
- Strategy A2, same-instance active DOM teleport, has an initial prototype. It temporarily moves the existing React-owned node DOM into an outside overlay while active, restores it under the canvas before capture, and defers uploads while the node is teleported.
- Strategy B, duplicate live overlay render, remains a fallback only if A2 fails for important components such as CodeMirror, terminal, or other stateful section types.

A1 is still worth external/browser-model review because it would be the cleaner architecture if possible. Do not re-open A1 based on hit testing alone. Re-open it only with a minimal repro showing the same canvas-child DOM element both:

1. visibly composites above the canvas as normal DOM during interaction, and
2. remains eligible for the intended WebGPU/html-in-canvas capture path without a restore/repaint step.

If new browser flags, Chrome channels, origin trials, or API usage patterns make that repro pass, update this plan before changing the implementation direction.

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

## Relevant Example References

Use these examples from `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as concrete implementation references.

Primary references:

- `html-in-canvas/plugins/html-cloth.mjs`
  - Use for understanding why smooth interaction is possible in the reference: one fixed-size source DOM element, direct texture upload, explicit paint invalidation, and a deliberate interaction bridge.
  - Key sections: `_createSourceElement`, `_wireInteractions`, `_updateSliderFromClient`, `_drawVideoFrame`, `_uploadTexture`, `_refreshTexture`, and `_handlePointer`.
  - Most relevant lesson: it does not rely on repeatedly recapturing many large independently dirty UI trees. It maps the user's pointer to the DOM/control that should behave live, then refreshes one texture.

- `html-in-canvas-room/extension/entrypoints/content.ts`
  - Use for Strategy A probing. `applyScreenTransform()` projects the 3D screen to viewport coordinates and applies a CSS transform to the real DOM wrapper so native browser events hit its children.
  - Key sections: `getScreenBounds`, `applyScreenTransform`, `onClick`, `onWheel`, `uploadPageTexture`, and `renderLoop`.
  - Most relevant lesson: transformed layout-subtree DOM can handle native hit testing while texture capture remains stable. This is the closest example for promoting an existing source element instead of duplicating it.

- `three-html-render/src/interactionManager.ts`
  - Use for active DOM transform math. It positions each HTML texture's source element with one CSS `matrix3d(...)` per frame so the browser dispatches pointer events to real HTML.
  - Key sections: `InteractionManager.update()` and the `viewport x projection x view x world x pixelToLocal` matrix path.
  - Most relevant lesson: keep the GPU mesh and real DOM presentation aligned, then let the browser handle hover, focus, selection, and clicks.

- `three-html-render/src/raycastInteractionManager.ts`
  - Use for fallback interaction handoff when a direct screen transform is not enough. It raycasts, reads UVs, and moves the source element so the relevant texture pixel sits under the pointer.
  - Key sections: `_onPointer`, `_parkElement`, and `_getElement`.
  - Most relevant lesson: when the displayed surface and DOM layout do not naturally overlap, route the pointer to the correct DOM coordinates before native hit testing.

Supporting references:

- `three-html-render/src/threeHTMLRenderer.ts`
  - Use for paint/upload sequencing and event isolation. It requests paint for animated HTML textures, stops control events from leaking into canvas controls, and uploads only managed HTML texture elements.

- `three-html-render/src/htmlTexture.ts`
  - Use for separating the texture image from the real source element. The fallback keeps `_sourceElement` even when the texture image is a captured canvas snapshot, which is the same distinction Setta needs between passive texture source and active DOM presentation.

- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Use as the WebGPU `copyElementImageToTexture` reference. It captures a small value element into a WebGPU texture and keeps the shader/render loop separate from DOM paint updates.
  - Important limitation: this is a small, purpose-built element, not a full Setta node tree.

- `hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html`
  - Use as a control-level reference. `MeshButton.paint()` calls `drawElementImage()` and applies the returned transform to the real button, which is useful when evaluating whether simple params can be handled at control granularity.

## Design Principle

Textures are snapshots. Active interaction is live DOM.

For the active node:

1. Put a real DOM presentation of the active node above the WebGPU canvas.
2. Route pointer and keyboard interaction to that live DOM.
3. Hide or suppress the matching GPU quad so the user sees one node, not two.
4. Defer texture refresh until the interaction pauses or ends.
5. Upload one final texture snapshot and return to the normal GPU path.

## Phase 1: Baseline And Probes

Status: partially complete. See:

- `perf/reports/frontend/2026-04-29_strategy-a-investigation.md`
- `perf/reports/frontend/2026-04-29_strategy-a2-active-teleport-prototype.md`

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
   - Model this probe after `html-in-canvas-room/extension/entrypoints/content.ts` `applyScreenTransform()` and `three-html-render/src/interactionManager.ts` `update()`.

2. Verify whether `copyElementImageToTexture` can capture an element outside the canvas layout subtree.
   - If yes, the live overlay can be the capture source after settle.
   - If no, keep a canvas-child source element for capture and a separate outside-canvas live layer for interaction.
   - Compare against `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`, which uses WebGPU `copyElementImageToTexture` for a small element.

3. Measure whole-node capture cost for representative nodes:
   - small settings node
   - large settings node
   - CodeMirror node
   - terminal node
   - chat node

Do not start broad follow-up implementation until any missing results are recorded. Existing A2 prototype work may continue, but any decision to abandon A2 or return to A1 must be backed by a new report in `perf/reports/frontend/`.

## Phase 2: Active DOM Layer Architecture

Status: implemented differently for the current A2 path.

The original Phase 2 described a duplicate-render active DOM layer. The current preferred architecture is same-instance teleport: the existing node DOM is moved into an active overlay while the user interacts, then restored before final capture. Do not introduce a second React-owned node tree unless Strategy B becomes necessary.

For A2, keep an active teleport layer outside the WebGPU canvas:

- mounted as a sibling of `GpuSurface`, above the canvas and below global popovers
- `position: absolute; inset: 0; pointer-events: none`
- one teleported active node with `pointer-events: auto`
- lifecycle support for preserving focus and selection across the move
- upload deferral while the active node is outside the canvas layout subtree
- restore-before-capture ordering on settle

The layer needs:

- `activeNodeId`
- active node layout
- current GPU viewport
- current canvas/source DOM node for that node id
- lifecycle callbacks for teleported, restored, and paint-ready states

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

If Strategy B becomes necessary, this same layer may become a separate active `SectionContainer` renderer. That fallback must first pass the component safety audit because duplicate mounting can create duplicate subscriptions, editors, terminals, observers, and local state.

## Phase 3: Choose Promotion Strategy

Status: A2 is the current implementation path. A1 remains under external review; B remains fallback.

Use the Phase 1 probe results to choose one strategy.

The initial Phase 1 probe ruled out CSS-only promotion of a canvas child. A deeper follow-up investigation is recorded in `perf/reports/frontend/2026-04-29_strategy-a-investigation.md`. That investigation splits Strategy A into two variants:

- Strategy A1: CSS-promote an existing canvas child. This is not viable in the local Chromium build.
- Strategy A2: temporarily move the same React-owned DOM node into an outside active overlay, then move it back before final texture capture. This is plausible enough to prototype before falling back to duplicate-render Strategy B.

### Strategy A1: CSS-Promote Existing Source DOM

Use this only if canvas layout subtree children can be visually promoted above the canvas without breaking capture.

Primary examples:

- `html-in-canvas-room/extension/entrypoints/content.ts` for CSS-transforming the same DOM wrapper used for capture.
- `three-html-render/src/interactionManager.ts` for maintaining alignment between GPU surface and DOM source element.

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

Current investigation result:

- Not viable in Chrome 147 with the local html-in-canvas/WebGPU flags.
- Layout-subtree children hit-test but do not visually composite above the canvas.
- CSS `z-index`, `position: fixed`, 3D transforms, and nested wrappers did not change that.

### Strategy A2: Same-Instance Active DOM Teleport

This is the current implementation path. Harden it before Strategy B.

Approach:

- Keep one React-owned `SectionContainer` instance.
- On active interaction, move the existing canvas-child node DOM into an outside active overlay under the same React root.
- Apply the same screen transform as the GPU quad.
- Stop active texture uploads while the node is outside the canvas.
- Let the moved DOM receive real pointer, keyboard, focus, caret, CSS transition, editor, and terminal behavior.
- Keep the previous GPU texture underneath until the moved DOM is visible; then optionally suppress the GPU quad.
- On settle, move the same DOM node back under the canvas as an immediate canvas child.
- Request one paint, upload the final texture, then return to the passive texture path.

Advantages:

- No duplicate React tree.
- Preserves local component state, editor instances, terminal instances, focus, and selection.
- Matches the examples' key rule that active interaction is real DOM while texture pixels are snapshots.

Risks:

- Imperatively reparenting React-owned DOM is fragile and must be tightly contained.
- React updates while the node is moved need browser testing.
- Texture upload must be explicitly suppressed while the node is outside the canvas or `copyElementImageToTexture` will throw.
- The node must be restored to an immediate canvas child before final capture.
- Complex components may perform layout or observer work that assumes the original parent.

Required prototype checks:

- Switch first-click handoff while teleported. Initial check passed; keep regression coverage.
- Text input focus/caret while teleported. Initial check passed; keep regression coverage.
- Input-driven React rerender while teleported. Still needs broader component coverage.
- Reattach-before-final-capture ordering. Initial check passed for basic settings nodes; keep regression coverage.
- No `copyElementImageToTexture` calls for the active node while teleported. Initial check passed; keep regression coverage.
- CodeMirror and terminal behavior before enabling broadly.

### Strategy B: Separate Live Overlay Render

Use this if Strategy A2 fails on React reconciliation or component behavior.

Primary examples:

- `three-html-render/src/htmlTexture.ts` for retaining the source element separately from the uploaded texture image.
- `three-html-render/src/threeHTMLRenderer.ts` for managing a small set of active HTML texture elements and isolating their events from canvas controls.

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

Use `html-in-canvas/plugins/html-cloth.mjs` `_handlePointer()` and `three-html-render/src/raycastInteractionManager.ts` `_onPointer()` as references for the fallback path where the first pointer event lands on the texture/canvas path and must be handed to the live DOM target.

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

Use `html-in-canvas/plugins/html-cloth.mjs` `_refreshTexture()` as a reference for one-shot paint/upload scheduling, but do not copy its every-frame refresh cadence for Setta nodes. Use `html-in-canvas-room/extension/entrypoints/content.ts` `dirty` plus `uploadPageTexture()` as the closer model for uploading only when the DOM source is dirty.

## Phase 6: Component Safety Audit

Before enabling A2 broadly for all node types, audit these component families:

- Param inputs
- Switch inputs
- Combobox/dropdowns
- CodeMirror sections
- Terminal sections
- Chat sections
- Spreadsheet sections
- Browser/iframe/image/media sections

For each, decide:

- safe to teleport with existing DOM
- safe to duplicate only if Strategy B is needed
- would become simpler if A1 is proven by a browser repro
- needs a dedicated active presentation mode
- should stay texture-only temporarily

Document any teleport or duplication exception near the implementation. Do not add silent compatibility shims.

## Phase 7: Tests

Unit tests:

- active node snapshot resolves screen position correctly
- active DOM layer uses the same transform math as GPU node quads
- active node GPU quad is skipped while live DOM is mounted
- texture upload is deferred during active interaction
- final texture upload happens before live DOM unmount
- teleported node is restored before final capture
- upload attempts are deferred while a node is outside the canvas layout subtree
- focus and selection survive teleport for text inputs
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

- Can a canvas layoutsubtree child be visually promoted above the canvas on any current Chromium build or flag set while remaining capture-eligible?
- Can WebGPU `copyElementImageToTexture` capture outside-canvas DOM elements?
- Can same-instance active DOM teleport survive large React updates, CodeMirror, and terminal behavior without duplicate mounting?
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
