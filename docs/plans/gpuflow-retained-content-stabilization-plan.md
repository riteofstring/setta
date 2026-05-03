# GpuFlow Retained Content Stabilization Plan

## Goal

Fix the current canvas-owned retained-content regressions before moving more UI
into canvas. This is a checkpoint plan for the
`go-rewrite-canvas-replace-xyflow-2-html-gpu-surfaces-plan-full-scene` branch.

The branch should not continue broader retained-content migration until the
issues below are fixed and verified:

- Overflow sections scroll smoothly.
- Overflow sections show usable scrollbars.
- Switches animate when toggled.
- Text fields can be focused and edited reliably.
- Long text and textarea values render with wrapping instead of horizontal
  distortion.

If this checkpoint cannot be made stable without broad special cases, keep the
GPU/canvas work for graph layout, edges, culling, and dense read-mostly content,
but stop moving form-heavy retained content out of DOM.

## Latest Recording Evidence

The latest Chrome recording reviewed for this plan was captured on
2026-05-06 around the Settings route.

Relevant observations:

- The console recorded repeated uncaught errors:
  `retained content scroll x must be a finite non-negative number` from
  `frontend/src/gpuFlow/retainedContentScroll.ts`.
- The error is caused by negative wheel `deltaX` values being added to the
  current scroll offset before clamping. The current clamp asserts
  non-negative input first.
- The recording included 400 wheel events over retained canvas content.
- During the scroll window, `gpu-flow-frame` render work averaged about
  `0.34ms`, but frame cadence averaged about `47fps` and there were repeated
  texture upload frames. The draw itself is not the only bottleneck.
- Switch rendering is final-state drawing only; no transition state is present.
- Text-like retained controls render with one `ctx.fillText(..., maxWidth)`,
  which can horizontally squeeze long text instead of wrapping it.
- Active native DOM islands exist, but click/focus handoff is not reliable
  enough for text editing in the recorded UI.

## Stabilization Rules

- Do not move any additional Settings or project param controls to canvas until
  this plan is complete.
- Do not add hidden compatibility paths, old/new render switches, or silent DOM
  fallbacks. If a control must remain DOM-owned because it needs browser-native
  editing, make that ownership explicit.
- Prefer deterministic renderer state, typed descriptors, measured geometry,
  and explicit hit records over event heuristics.
- Keep active DOM islands only for controls that need native behavior:
  CodeMirror, text/textarea/IME editing, native file/drop targets, and native
  OS picker controls when required.
- Use the existing retained scene and param renderer metadata paths. Do not add
  parallel TypeScript mirrors of Go-owned contracts.

## Phase 1: Stop The Scroll Exceptions

Files likely involved:

- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentScroll.test.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.test.ts`

Work:

- Change retained-content scroll clamping so raw negative deltas are allowed as
  input and are clamped to `[0, maxOffset]` without throwing.
- Preserve the existing fail-loud behavior for non-finite values and invalid
  content/viewport dimensions.
- Add tests for:
  - wheel up at the top of a scrollable surface
  - small negative `deltaX` with no horizontal scroll range
  - shift-wheel horizontal scroll clamping
  - current offsets that are already at a boundary

Acceptance:

- No page errors from wheel events in `/settings`.
- Wheel input at scroll boundaries is ignored or clamped, not thrown.

## Phase 2: Move Hot Scroll State Out Of The React Rebuild Path

Files likely involved:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuSurface.tsx`
- Settings-project layout paths that reuse retained content surfaces
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`

Current problem:

- Retained content scroll offsets are stored in React state.
- Every wheel update can rebuild the project/settings scene and redraw retained
  source canvases.
- The recording shows draw time is small, but scene churn and texture upload
  cadence still drag perceived scrolling below target.

Work:

- Introduce a retained-content scroll store owned by the renderer path, with
  rAF-coalesced updates.
- Keep React state only for durable or semantic scroll changes that must affect
  layout, search reveal, keyboard navigation, or active target ownership.
- During wheel scrolling, update only the affected retained surface and request
  a frame once per animation frame.
- Avoid redrawing unaffected retained surfaces.
- Ensure active DOM island geometry follows scroll offsets without remounting
  unless the active row leaves the clipped area.
- Keep keyboard reveal and search reveal APIs deterministic by reading from the
  same scroll store.

Acceptance:

- Repeating the Settings scroll repro shows no sustained frame cadence below
  55fps on the same machine and viewport.
- A scroll gesture does not produce full scene rebuilds for every wheel event.
- Texture uploads during scroll are limited to affected retained surfaces.

## Phase 3: Add Retained Scrollbars

Files likely involved:

- `frontend/src/gpuFlow/retainedContentScene.ts`
- `frontend/src/gpuFlow/retainedContentDrawCommands.ts`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/retainedContentHitTest.ts`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- `frontend/src/gpuFlow/retainedContentScroll.ts`

Work:

- Add explicit retained scrollbar draw commands for scrollable surfaces.
- Render vertical scrollbars for vertical overflow and horizontal scrollbars
  only when horizontal overflow exists.
- Add hit records for scrollbar track and thumb.
- Support:
  - thumb dragging
  - track click/page scroll
  - hover and active visual states
  - correct thumb size from viewport/content ratio
  - clipped placement inside the retained surface
- Keep scrollbars visible enough to communicate overflow without adding noisy
  borders.

Acceptance:

- Overflow areas visibly communicate scroll position and scroll range.
- Dragging the thumb updates the retained content offset.
- Scrollbars remain correctly aligned while zooming and panning.

## Phase 4: Make Text Editing Handoff Reliable

Files likely involved:

- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuParamContentAdapter.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuDomIslandActivation.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamDomIslandRenderer.tsx`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuActiveParamDomIslandDeactivation.ts`
- `frontend/src/gpuFlow/GpuFlow/domIslandLayer.tsx`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`

Work:

- Treat text-like controls with `commitPolicy: "native-island"` as explicit
  native editor islands when active.
- Make activation deterministic:
  - pointer down on canvas hit creates the island synchronously
  - the active editor receives focus on mount
  - the caret/selection is placed in the intended control
  - replayed click/focus does not get swallowed by canvas event capture
- Ensure active editor islands are not hidden by canvas overlays or clipped
  incorrectly.
- Add tests for text input, textarea, code input, and param name editing.
- Verify deactivation rules do not close the editor while interacting with its
  CodeMirror/validation/combobox portals.

Acceptance:

- Clicking a retained text field allows immediate editing.
- Typing, selection, blur commit, Escape behavior, and portal interaction match
  the DOM implementation.

## Phase 5: Wrap Long Text And Textareas In Canvas Preview

Files likely involved:

- `frontend/src/gpuFlow/retainedContentTextLikeCanvas.ts`
- `frontend/src/gpuFlow/retainedContentTextLikeCanvas.test.ts`
- `frontend/src/gpuFlow/retainedContentRowLayout.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuParamTextLikeRowDescriptor.ts`

Work:

- Stop using single-line `ctx.fillText` for textarea and long text previews.
- Add measured line wrapping for retained text-like previews:
  - preserve explicit newlines
  - wrap by available control width
  - clip to the control rect
  - use stable line height
  - show an ellipsis or fade only at the final visible line if content exceeds
    the preview height
- Keep single-line behavior only for true single-line text inputs where
  truncation is intended.
- Do not duplicate CodeMirror behavior. This is preview rendering only; active
  editing remains DOM-owned.

Acceptance:

- Long textarea values are readable as wrapped preview text.
- Long single-line text is clipped or ellipsized without horizontal squeezing.
- No text overlaps neighboring rows or controls.

## Phase 6: Add Switch Animation State

Files likely involved:

- `frontend/src/gpuFlow/retainedContentSwitchCanvas.ts`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamSwitchAdapter.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuRetainedParamInteractionAdapter.tsx`
- existing animation lease utilities under `frontend/src/gpuFlow/htmlSurfaces/`
  if they fit this retained-content path

Work:

- Record a transition start value and timestamp when a switch toggles.
- Draw the switch thumb at an interpolated position until the transition ends.
- Request frames during the transition without forcing unrelated retained
  surfaces dirty.
- Respect reduced-motion preferences by snapping immediately when required.
- Keep keyboard toggles and pointer toggles on the same animation path.

Acceptance:

- A clicked switch changes value and visually animates the thumb.
- The animation does not cause repeated full-scene texture uploads.

## Phase 7: Verification And Regression Guardrails

Required automated checks:

- Focused Vitest suites for retained scroll, retained text rendering, switch
  rendering, and DOM island activation.
- Existing project GPU retained param interaction tests still pass.
- Add targeted tests for the exact failure modes from the recording.

Required browser verification:

- Use `./scripts/record-chrome-repro.sh` to capture a fresh Settings repro.
- Use Chrome DevTools visual verification for:
  - Settings scroll overflow
  - scrollbar visibility and thumb drag
  - switch animation
  - text field activation/editing
  - long textarea preview wrapping
- Use the same viewport as the latest repro first: `1200x672`.
- Add at least one larger desktop viewport after the first pass.

Performance acceptance:

- No console/page errors during the repro.
- No sustained retained-content scroll below 55fps on the same machine and
  viewport.
- No individual retained-content scroll frame should require uploading every
  retained surface.
- Record before/after notes under `perf/frontend/` as append-only reports.

Default final verification:

- Run focused frontend tests first.
- Run `./scripts/quality/check.sh` before landing unless the change is still
  explicitly experimental and not intended to merge.

## Decision Checkpoint

Continue the branch only if all of these are true:

- Settings and project retained-content overflow both feel native enough for
  repeated use.
- Text editing is reliable without fragile event replay edge cases.
- Long text preview is legible and bounded.
- Canvas-owned switches, sliders, dropdowns, and scrollbars have deterministic
  hit testing and keyboard paths.
- The retained-content path improves or preserves performance compared with the
  pre-canvas DOM-heavy implementation for large param surfaces.

If any of these fail after the stabilization pass, narrow the canvas ownership:

- keep `GpuFlow` for scene layout, edges, culling, and read-mostly retained
  rows
- keep form-heavy controls as DOM while inactive or active
- document the ownership boundary before doing more migration

