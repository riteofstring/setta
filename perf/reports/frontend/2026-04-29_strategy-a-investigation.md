# GPU Flow Strategy A Investigation

Date: 2026-04-29
Area: frontend GPU flow
Route: `http://127.0.0.1:3019/settings`, Settings -> All Settings
Browser: Chrome 147.0.0.0 on macOS, DPR 2
Chrome flags: `--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`

## Summary

The earlier Strategy A conclusion was too coarse.

Two different approaches were being mixed together:

1. **CSS promotion Strategy A**: keep the source node as an immediate `<canvas layoutsubtree>` child and visually raise that same DOM above the WebGPU canvas with CSS.
2. **Same-instance teleport Strategy A**: temporarily move the same React-owned node DOM instance out of the canvas into an overlay for active interaction, then move it back before final texture capture.

The CSS promotion variant is not viable in this Chromium build. The same-instance teleport variant is technically possible in a narrow Setta probe and should be prototyped before committing to a duplicate-render active overlay.

## Example Semantics Checked

Relevant example and reference findings:

- `hot-tips/html-in-canvas/AGENTS.md` explicitly says `layoutsubtree` opts children into layout and hit testing while keeping them non-visible until explicitly drawn into the canvas.
- `hot-tips/html-in-canvas/demos/wicg/text-input.html` draws the child with `drawElementImage(...)`, then applies the returned transform to the child for native hit testing.
- `html-in-canvas-demo/demos/water-drop/README.md` describes native clickability through the WebGL rendering surface, but the visible card is produced through `texElementImage2D(...)`.
- `html-in-canvas-room/extension/entrypoints/content.ts` uses CSS transforms for native hit testing while the visible UI is still the uploaded texture.
- `html-in-canvas/plugins/html-cloth.mjs` keeps one fixed source DOM texture and manually maps pointer hits to the DOM, then refreshes the texture.

The common pattern is not normal DOM compositing of canvas children. It is: real DOM for layout/events, explicit element-to-canvas/texture drawing for pixels.

## Synthetic Browser Matrix

Artifact: `perf/reports/frontend/strategy-a-synthetic-matrix-2026-04-29.png`

Probe setup:

- Built a local-origin synthetic page so `navigator.gpu` was available.
- Created multiple `<canvas layoutsubtree>` cases with a red canvas and a green child.
- Tested no rendering context, 2D, WebGL, WebGPU, `position: fixed`, high `z-index`, `translateZ(0)`, nested descendants, and an explicit `drawElementImage` snapshot.
- Sampled screenshot pixels inside each child and checked `document.elementFromPoint(...)`.

Result:

| Case | Hit testing | Screenshot pixel | Meaning |
| --- | --- | --- | --- |
| Outside normal DOM sibling | child hit | green `[98, 207, 67]` | normal DOM paints |
| Direct canvas child, no context | child hit | red `[185, 58, 42]` | hit-testable but not painted |
| Direct canvas child, 2D context | child hit | red `[185, 58, 42]` | hit-testable but not painted |
| Direct canvas child, WebGL context | child hit | red `[185, 58, 42]` | hit-testable but not painted |
| Direct canvas child, WebGPU context | child hit | red `[185, 58, 42]` | hit-testable but not painted |
| Direct canvas child, `position: fixed` | child hit | red `[185, 58, 42]` | CSS positioning did not escape painting model |
| Direct canvas child, high z/3D promotion | child hit | red `[185, 58, 42]` | CSS compositing did not promote visually |
| Nested descendant, high z/3D promotion | child hit | red `[185, 58, 42]` | nesting did not change painting model |
| 2D `drawElementImage` snapshot | child hit | green `[98, 207, 67]` | pixels appear only when explicitly drawn |

Conclusion:

CSS promotion of a `<canvas layoutsubtree>` child is not viable. The child can receive native events, but it does not visually composite above the canvas. CSS `z-index`, `position: fixed`, transforms, and nesting did not change that.

## Capture Eligibility Matrix

Probe setup:

- Used `GPUQueue.copyElementImageToTexture(...)` on local-origin elements.
- Tested direct canvas child, nested descendant, outside sibling, the same direct child after reparenting outside, and the same element after moving back.

Result:

| Source element | Result |
| --- | --- |
| Immediate child of configured WebGPU `<canvas layoutsubtree>` | success |
| Nested descendant inside canvas child | failed: only immediate children are accepted |
| Outside normal DOM sibling | failed: only immediate children are accepted |
| Same element while reparented outside canvas | failed: only immediate children are accepted |
| Same element after moving back under the canvas | success |

Conclusion:

The capture source must be an immediate child of the configured canvas at upload time. It does not have to stay there forever, but it must be moved back before final texture capture.

## Setta Same-Instance Teleport Probe

Artifact: `perf/reports/frontend/strategy-a-setta-teleport-2026-04-29.png`

Probe setup:

- Selected the existing source node:
  - `[data-gpu-flow-node="true"][data-id="settings-section__gui"]`
- Confirmed it was an immediate child of the WebGPU canvas.
- Moved that exact DOM node into a high-z outside overlay inside the app's `main` tree.
- Removed the source transform and positioned it at the same screen rect.
- Clicked an existing switch and typed into the node-local filter input.
- Moved the same DOM node back under the canvas and retried texture capture.

Observed:

- The moved node became visibly live outside the canvas.
- `document.elementFromPoint(...)` hit content inside the moved node.
- The switch changed from `aria-checked="true"` to `aria-checked="false"` after clicking while moved.
- The filter input accepted `strategy-a`, remained focused, and retained the value after moving back.
- `copyElementImageToTexture(...)` succeeded before moving.
- `copyElementImageToTexture(...)` failed while moved outside the canvas.
- `copyElementImageToTexture(...)` succeeded again after moving back.

Important failure:

While the node was outside the canvas, the existing GPU texture dirty/upload path emitted repeated uncaught errors:

`Failed to execute 'copyElementImageToTexture' on 'GPUQueue': Only immediate children of the <canvas> element can be passed to copyElementImageToTexture().`

That failure is expected with the current architecture because active-node dirty tracking still attempts repeated full-node uploads during interaction.

## Implications

CSS-promotion Strategy A should be ruled out.

Same-instance teleport Strategy A should not be ruled out yet. It has a real upside:

- no duplicate React tree
- preserves component-local state
- likely better for CodeMirror, terminals, focus, selection, and editor instances than duplicate rendering
- uses real DOM for active interaction
- final capture can still use the same source element after it is reattached to the canvas

But it is not free:

- it requires an explicit active-node lifecycle that suppresses texture uploads while the node is outside the canvas
- it imperatively reparents a React-owned DOM subtree, which is fragile unless tightly contained and tested
- React updates while the subtree is moved need dedicated testing across component families
- the node must be reattached before final capture
- the GPU quad must remain as the stale/passive visual underneath or be suppressed only after the moved DOM is visible

## Recommendation

Do not proceed directly to duplicate-render Strategy B as the only option.

Add a new implementation candidate before Strategy B:

**Strategy A2: same-instance active DOM teleport**

Lifecycle:

1. On active interaction, mark the node as active-teleported.
2. Stop active texture uploads for that node while teleported.
3. Move the existing source DOM node from the canvas to an outside overlay under the same React root.
4. Apply the same screen transform used for the GPU quad.
5. Let the real DOM handle pointer, keyboard, focus, caret, CSS transitions, and editor behavior.
6. Keep the old GPU texture underneath until the teleported DOM is visible, then optionally suppress the quad.
7. On settle, move the DOM node back as an immediate canvas child.
8. Request one paint and upload the final texture snapshot.
9. Restore the normal GPU texture path.

Required prototype tests:

- switch first-click handoff while teleported
- text input focus/caret while teleported
- filter/input-driven React rerender while teleported
- reattach before final capture
- no `copyElementImageToTexture` attempts while teleported
- no React console errors during move, update, and restore
- CodeMirror and terminal behavior before enabling for those section types

If A2 fails on React reconciliation or complex component behavior, fall back to duplicate-render Strategy B with that failure recorded. But based on this investigation, A2 is plausible enough that Strategy B should not be treated as the final architecture yet.
