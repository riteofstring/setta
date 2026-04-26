# GPU Flow Active Node DOM Teleport Plan

## Goal

Restore native-feeling node controls while keeping pan and zoom on the WebGPU path.

Use cached WebGPU textures for passive nodes. When the user interacts with a node, temporarily present that same React-owned DOM node as normal browser DOM above the canvas. After the interaction settles, restore the node to the canvas layout subtree, upload one final texture snapshot, and return it to the passive texture path.

This replaces repeated full-node texture uploads as the mechanism for live switch animations, text carets, sliders, CodeMirror, terminal input, and other native DOM feedback.

## Core Architecture

The active node path uses same-instance DOM teleport:

1. Keep one React-owned node DOM instance.
2. Detect that a node or control is becoming active.
3. Move the existing canvas-child node DOM into an outside active overlay under the same React root.
4. Position it with the same screen transform as the GPU quad.
5. Let the browser handle pointer, keyboard, focus, caret, selection, CSS transitions, editor behavior, and terminal behavior normally.
6. Defer texture uploads for that node while it is outside the canvas layout subtree.
7. On settle, move the node DOM back under the canvas as an immediate canvas child.
8. Request paint, upload the final texture, and restore the normal GPU quad.

Do not render a second React copy of the active node. Duplicate mounting risks duplicate subscriptions, observers, editor instances, terminal instances, and local component state.

## Reference Lessons

Use the examples in `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` for implementation details, not as evidence that full Setta nodes should be recaptured every frame.

- `html-in-canvas/plugins/html-cloth.mjs`
  - Useful for input wiring, explicit invalidation, one-shot texture refresh, and pointer-to-DOM interaction discipline.
  - Key sections: `_createSourceElement`, `_wireInteractions`, `_updateSliderFromClient`, `_drawVideoFrame`, `_uploadTexture`, `_refreshTexture`, `_handlePointer`.
  - Main lesson: smooth demos use controlled texture sources and explicit update timing. They do not prove that many large independent React node trees can be recaptured at live-control cadence.

- `three-html-render/src/interactionManager.ts`
  - Useful for keeping a real DOM element aligned with a rendered surface using CSS matrix transforms.
  - Key section: `InteractionManager.update()`.

- `three-html-render/src/raycastInteractionManager.ts`
  - Useful for pointer handoff when the initial pointer event lands on a rendered texture/canvas path.
  - Key sections: `_onPointer`, `_parkElement`, `_getElement`.

- `three-html-render/src/threeHTMLRenderer.ts` and `three-html-render/src/htmlTexture.ts`
  - Useful for paint/upload sequencing, event isolation, and keeping source DOM concerns separate from uploaded texture concerns.

- `html-in-canvas-official/Examples/webgpu-jelly-slider/src/index.ts`
  - Useful as the WebGPU `copyElementImageToTexture` reference for small purpose-built DOM texture sources.

- `hot-tips/html-in-canvas/demos/wicg/ripple-buttons.html`
  - Useful as a control-level `drawElementImage()` reference.

Important constraint: canvas layout-subtree children can participate in layout, hit testing, focus, editing, and accessibility, but their normal DOM paint is not visually composited above the canvas. Visible output from an in-canvas source comes from explicit draw/copy APIs. That model is still useful for passive snapshots and small bounded texture sources, but it is not the live full-node interaction mechanism in this plan.

## Active Overlay

Keep an active teleport layer outside the WebGPU canvas:

- mounted as a sibling of the GPU surface, above the canvas and below global popovers
- `position: absolute; inset: 0; pointer-events: none`
- one teleported active node with `pointer-events: auto`
- lifecycle support for preserving focus and selection across the move
- upload deferral while the active node is outside the canvas layout subtree
- restore-before-capture ordering on settle

The teleported element uses the same transform as the GPU quad:

```ts
transform: translate(screenX, screenY) scale(zoom)
transform-origin: 0 0
width: node.width
height: node.height
z-index: node.zIndex
```

While a node is teleported, suppress its GPU quad once the live DOM is mounted. Avoid double-render artifacts during switch transitions and text input.

## Interaction Handoff

The first click matters. Activation must happen early enough that switches, sliders, text inputs, editors, and terminals receive the user's first meaningful event.

Implement activation in the interaction controller:

- On pointer hover or pointer move over an interactive target, pre-arm teleport for that node when practical.
- On pointerdown inside an interactive target:
  - resolve the node id
  - resolve a stable target descriptor for the control
  - synchronously activate teleport
  - route the pointerdown to the matching live DOM control if the event landed on the texture/canvas path

Target descriptors should use stable attributes already present on params and sections. Avoid visible text labels as primary target identity.

Control behavior:

- Switch/button: preserve first-click behavior and allow the native CSS transition to run in live DOM.
- Range/slider: ensure pointer capture and drag movement go to the live DOM control.
- Text input/textarea/contenteditable: preserve focus, caret, selection, and typed text through teleport and restore.
- CodeMirror/terminal: prefer activating before focus or on focus so the real editor/terminal receives input directly.

## Texture Refresh Policy

Do not upload the active node texture every frame during live interaction.

During active interaction:

- keep passive node texture uploads budgeted
- suppress or hide the active node GPU quad after the live DOM is visible
- defer active node texture uploads while the node is outside the canvas layout subtree

On settle:

1. Restore the node DOM under the canvas as an immediate canvas child.
2. Mark the node texture dirty with interactive priority.
3. Request one paint.
4. Wait for a valid paint/capture point.
5. Upload the final snapshot.
6. Restore the GPU quad and deactivate the live overlay.

Settle triggers:

- pointerup or pointercancel for pointer controls
- blur or focusout for text inputs and editors
- debounce after input events, initially 150-250ms
- explicit dirty events from editor/terminal owners after their update cycle

Do not hide the live DOM before the final GPU texture has been uploaded. That prevents a stale texture flash.

## Component Safety Audit

Verify teleport behavior for these component families:

- Param inputs
- Switch inputs
- Combobox/dropdowns
- CodeMirror sections
- Terminal sections
- Chat sections
- Spreadsheet sections
- Browser/iframe/image/media sections

For each family, check:

- focus and selection survive teleport and restore
- React updates while teleported do not break reconciliation
- observers, layout effects, portals, popovers, and event listeners still behave correctly
- final capture succeeds after restore
- pan/zoom remains smooth while the node is active

If a component family cannot safely teleport, document the concrete failure and do not enable teleport broadly for that family until the component owner behavior is fixed. Do not add silent compatibility shims or broad implicit behavior.

## Tests

Unit tests should cover:

- active node screen transform matches the GPU quad transform
- teleported node is marked live and its GPU quad is suppressed
- active node uploads are deferred while the node is outside the canvas
- teleported node is restored before final capture
- final upload happens before live DOM deactivation
- focus and selection survive teleport for text inputs
- first-click handoff routes switch/button interaction to live DOM
- slider pointer capture continues after pointerdown
- target descriptors resolve without visible-text selectors

Integration or browser tests should cover:

- switch toggles and CSS transition completes at native duration
- typing in a param input shows characters immediately
- slider drag updates smoothly
- CodeMirror caret and selection remain responsive
- terminal cursor and input remain responsive
- zoom and pan remain smooth while a node is active

Avoid tautological tests. Assert user-visible behavior or concrete lifecycle ordering.

## Browser Verification

Use Chrome DevTools MCP. Required checks:

- Settings -> All Settings at normal zoom
- Settings -> All Settings after zoom in/out
- switch click transition
- text input typing
- slider drag
- CodeMirror editing if available
- terminal input if available
- pan/zoom while an active node is teleported

Record before/after evidence in `perf/reports/frontend/`:

- apparent switch transition duration
- input visible latency
- active interaction texture upload count
- long tasks
- frame rate while dragging slider
- screenshot or trace artifact path

## Cleanup

After active DOM teleport is verified:

- Remove or narrow the old active-node clone overlay code.
- Remove the short repeated active texture upload loop.
- Keep dirty texture uploads for final snapshots and passive updates.
- Keep upload budget controls for passive nodes.
- Update `docs/plans/webgpu-html-texture-pan-zoom-plan.md` with the active-interaction architecture if it still describes repeated live uploads.

## Success Criteria

The implementation is done when:

- switch animation is indistinguishable from normal DOM
- text input and caret feedback are immediate
- slider drag feels native
- CodeMirror and terminal input remain responsive
- no active interaction relies on uploading a full node texture every frame
- final texture upload after restore is reliable
- GPU pan/zoom performance does not regress
- before/after performance reports are checked in
- CDP visual verification is recorded in the final implementation response
