# GPU Flow DOM-Owned Retained Controls Refactor Plan

## Problem

Retained text-like settings controls currently have more than one visual owner:

- inactive text-like values are intended to come from `DummyCodeMirror` DOM snapshots copied into retained page textures
- active values come from real CodeMirror mounted as a viewport DOM island
- a manual retained-canvas text fallback also draws values with `ctx.fillText`

That third owner regressed the old alignment guarantee. The fallback does not share CodeMirror layout, font metrics, line boxes, or clipping, and it can remain visible under the active DOM editor. The result is duplicate, misaligned text during activation. The same activation path also publishes partially coherent frames, briefly misroutes wheel/pan gestures to the active editor, and enqueues too much retained texture work, degrading scroll cadence after an input click.

We should fix this by making browser DOM the only visual and interaction owner for retained controls that need browser text/input behavior. No backward compatibility, transitional dual paths, or canvas text approximation should remain.

## External Ideas To Borrow

- WICG `html-in-canvas` examples keep the real form DOM as the source of text, focus, caret, selection, and hit testing, then synchronize the DOM transform to the drawn canvas position after `drawElementImage`.
- `three-html-render` keeps one real HTML element aligned with the rendered surface so native DOM events flow through normal browser semantics. Its raycast manager also parks non-target elements to avoid stale hover and misrouted clicks.
- `three-html-render`'s polyfill tracks input, change, selection, focus, hover, active state, and caret blink as dirty reasons. That is a better invalidation model than broad retained-page churn.
- `html-in-canvas-cracks` treats DOM texture size, CSS-pixel geometry, scroll, and resize as one coherent paint transaction, and gates display until the first real texture paint exists instead of showing a fake placeholder.
- `html-in-canvas.dev` uses Playwright smoke tests that assert observable behavior: canvas paints non-blank pixels and produces no console errors. We should extend that style with visual and cadence assertions for retained controls.

## Target Architecture

Introduce a generic retained DOM control surface model:

- Retained rows keep canvas ownership only for structural visuals: row backgrounds, labels, borders, non-text primitives, focus outlines, scrollbars, hover, selection, and layout chrome.
- Text-like values, CodeMirror content, native text inputs, password text, date/time text fields, and other browser-owned controls are rendered by direct DOM source elements under the `<canvas layoutsubtree>` source layer.
- A retained DOM control source has one descriptor: source id, row id, surface id, `sourceRectCssPx`, `controlRectSurfaceCssPx`, `clipRectSurfaceCssPx`, `worldRectFlowPx`, `viewportRectCssPx`, `textureRectDevicePx`, layer slot, z order, control role, value/style key, and interaction policy.
- Passive rendering copies those source elements into retained DOM-control textures. Active rendering projects the same source element to the drawn viewport position and enables pointer events only for gestures it owns.
- The compositor treats structural retained pages, DOM-control textures, and active projected source state as one transaction. A frame cannot publish an active editor over stale value pixels.
- If a required DOM-control snapshot is unavailable during activation, detach, scroll, pan, zoom, or any warm interaction, the previous coherent frame is held and follow-up work is scheduled. It must not draw an approximate canvas text fallback.
- A blank DOM-control value hole is allowed only for a cold first render with no previous coherent frame, and only when it is explicitly represented in transaction diagnostics. It is not allowed as a steady-state activation, scroll, pan, or zoom behavior.

## Production Slice

The first production slice is retained text-like and CodeMirror-backed settings controls.

The generic retained DOM-control contracts may be shaped to support password text, date/time fields, native text inputs, and other browser-owned controls, but those control families are not part of the first migration unless they are required to remove text-like compatibility code. After the text-like slice proves the source contract, transaction behavior, gesture ownership, and performance budget, later slices can migrate the remaining browser-owned control families with their own observed-behavior tests.

Do not turn this pass into another broad compositor rewrite. The first slice is complete only when the retained text-like value has one DOM-owned visual source in passive and active states, and the old text-like canvas fallback and active viewport DOM-island path no longer participate in production rendering.

## Control Ownership Matrix

The project retained row adapter must declare control ownership from owner-defined row/control metadata, not from frontend-only heuristics or hard-coded downstream inventories.

Initial classifications:

| Control family | Initial owner | First-slice action |
| --- | --- | --- |
| text-like, CodeMirror-backed text, multiline code/text | DOM-owned | migrate in this refactor |
| password visible text and native password editing | DOM-owned target | keep existing behavior unless needed for text-like contracts |
| date/time text fields | DOM-owned target | keep existing behavior unless needed for text-like contracts |
| file/dropzone native input affordances | DOM-owned target | keep existing behavior unless needed for text-like contracts |
| switch, slider, rotary, button, dropdown closed chrome, color swatch chrome, nested rows | canvas-owned or GPU-native according to existing owner metadata | do not migrate in this refactor |
| row labels, section labels, dividers, backgrounds, focus/hover/selection chrome, scrollbars | structural canvas/GPU-owned | remain structural retained visuals |

If a control family does not fit this table, stop and classify it in owner metadata before adding rendering logic.

## Retained DOM-Control Model

The retained DOM-control path needs explicit state, layer, coordinate, source, and accessibility contracts before implementation starts. These contracts are part of the architecture, not optional diagnostics.

Lifecycle state:

- `unmounted`: no source host exists.
- `mounted-paint-pending`: the source host exists, but CSS size, style, or first paint is not ready.
- `passive-texture-pending`: the source host is paint-ready and waiting for DOM-control texture capture/upload.
- `passive-committed`: the source has committed passive texture coverage in the retained DOM-control page/atlas.
- `active-preparing`: activation has been requested, gesture ownership is being resolved, and active occlusion/projection coverage is not yet coherent.
- `active-projected`: the source is projected to the drawn viewport rect, stale passive ink is occluded, and pointer/focus policy is ready.
- `active-editing`: the projected source owns browser focus, selection, IME, paste, keyboard editing, and text-selection gestures.
- `detaching`: the active source is returning to passive capture and cannot publish mixed active/passive visuals.
- `parked`: a non-active source is mounted but outside hit testing, pointer disabled, and absent from focus/accessibility order.

Implement this as a transition resolver with explicit inputs and diagnostics, not as a decorative enum. Each transition must declare the stage that owns it:

- React/source-layer mount owns source host presence and component mode.
- Source measurement owns CSS size, font metrics, line boxes, source-local scroll, and clip readiness.
- Paint observation owns first real paint and dirty reasons: input, change, beforeinput, composition, selection, caret blink, focus, hover, scroll, resize, animation, and transition.
- Texture paging owns passive DOM-control texture capture/upload readiness.
- Display transaction owns structural coverage, DOM-control coverage, active occlusion, active projection, held previous frame, and cold blank reason.
- Gesture arbiter owns wheel, pan, click-to-edit, text selection, and focus handoff before pointer events are enabled.

Layer stack:

- `structural-base`: row backgrounds, dividers, labels, non-browser-owned control chrome, and base clipping.
- `passive-dom-control`: text-like value ink, passive CodeMirror content, placeholder text, and source-local browser text clipping.
- `structural-foreground`: focus rings, error rings, hover/selection adorners, validation states, and foreground chrome that must sit above value ink.
- `active-occlusion`: the exact active control rect coverage that hides stale passive value pixels when live DOM is projected.
- `active-projected-source`: the real editor/input/caret/selection source projected to the drawn viewport rect.
- `native-overlay`: scrollbars, popups, drag previews, portals, and other native retained overlays.

If the current structural retained page cannot express `structural-base` and `structural-foreground` separately, split it. Do not rely on incidental z order or duplicate drawing to make focus, hover, validation, or active editing look correct.

Descriptor coordinate spaces:

- `sourceRectCssPx`: local DOM source coordinates.
- `controlRectSurfaceCssPx`: retained surface-local control coordinates.
- `clipRectSurfaceCssPx`: retained surface-local clip coordinates.
- `worldRectFlowPx`: flow/world coordinates before viewport transform.
- `viewportRectCssPx`: final viewport CSS-pixel rect after `screen = viewport + flow * zoom`.
- `textureRectDevicePx`: device-pixel rect inside the DOM-control texture page/atlas.

Descriptor fields must use named coordinate-space suffixes. Avoid unqualified names like `rect`, `sourceRect`, or `drawnRect` in new DOM-control contracts unless the containing type makes the coordinate space unambiguous.

Texture strategy:

- DOM-control textures must be paged or atlased per retained surface/window. Do not create one WebGPU texture per text-like control.
- Track per-control source rects inside DOM-control pages, per-control dirty rects, value/style keys, measured geometry keys, and source-local scroll keys.
- Structural retained pages and DOM-control pages have separate invalidation and upload lifecycles. Activating one input may dirty the active source and the affected structural/control rects only.
- Diagnostics must report DOM-control texture count, upload count, uploaded bytes, active paint latency, active upload latency, structural upload count, passive refinement backlog, held transaction count, and cold blank count.

Source implementation rule:

- Prefer one mounted source component with mode changes: passive capture/read-only/pointer-disabled and active focused/editable/projected.
- A text-like retained control may not use different passive and active DOM implementations unless visual-parity tests prove baseline, clipping, padding, font metrics, placeholder/empty state, selection/caret state, and source-local scroll state match within the allowed tolerance.
- `DummyCodeMirror` may remain only if it satisfies that parity contract against active CodeMirror. Otherwise the passive and active paths must converge on the same component family.

Accessibility and focus:

- Passive retained DOM-control sources are not tabbable.
- Passive retained DOM-control sources use `inert` where supported and `aria-hidden="true"` while passive or parked; remove those only for the active projected source.
- Pointer-events disabled is not sufficient for passive accessibility/focus behavior.
- Only the active retained DOM control participates in browser focus order.
- Activation must restore normal browser focus, selection, IME, paste, undo/redo, and keyboard behavior.

Active rect compositor selection:

- For every active text-like control rect in a published frame, the compositor chooses exactly one of: previous coherent retained frame, passive DOM-control texture, live projected source with active occlusion, or diagnosed cold blank.
- It must never show passive value ink and active live DOM simultaneously.
- A diagnosed cold blank is allowed only for cold first render with no previous coherent frame, never for warm activation, detach, pan, zoom, or retained section scroll.

## Invariants

- A control value has exactly one visual owner in any published frame.
- Browser-owned text is never drawn with `ctx.fillText`.
- Passive and active text-like states use the same geometry descriptor and source component contract.
- New descriptor fields name their coordinate space.
- Browser-owned text-like DOM-control textures are paged/atlased, not one texture per control.
- Passive DOM-control sources are not tabbable or exposed as duplicate accessibility controls.
- Active attach, active detach, scroll, and viewport movement publish only coherent transactions.
- An active text-like rect publishes exactly one visual selection: previous coherent frame, passive texture, live projected source, or diagnosed cold blank.
- Wheel and pan ownership is decided before enabling a DOM source for the event.
- Activating one input invalidates only the active source and its affected structural/control rects, not every retained page or every text-like source.
- Regression protection comes from realistic observed-behavior tests plus running the full GPU Flow-related suite before the refactor is considered complete. Unit tests that only assert implementation shape are not enough.

## Performance Target

Correctness gates and high-refresh performance gates have different jobs:

- Activation correctness must pass in normal CI and local development lanes: no duplicate text, no stale canvas value pixels under the active editor, correct first-wheel ownership, immediate pan availability, no native page scroll leakage, and no visual blanks outside explicitly diagnosed cold first render.
- Strict 120 fps-class evidence is required on measured high-refresh local hardware, or the work must produce the trace-backed fixed fallback budget described below. A 60 Hz or CI-capped browser run cannot close the strict 120 Hz claim, but it still must pass all correctness gates and report the strict deltas.

The performance target for the large retained settings surface is 120 fps-class interaction on high-refresh local hardware:

- p95 frame interval at or below 8.5 ms for viewport panning, viewport zooming, retained-hover zooming, retained section scrolling, and scroll-then-zoom in an All Settings-sized scene
- p99 frame interval at or below 16.7 ms
- no long task above 50 ms during the measured gesture
- slow-frame ratio below 5% in the strict local lane
- no visual blanks or placeholder bands after pan, zoom, or retained section scroll
- no native page scroll during retained section scroll

If a true 120 fps-class result is not achievable after the refactor, the work must prove that with a before/after Chrome trace and an append-only `perf/` report that identifies the bottleneck. The fallback budget must still be a fixed observed-behavior budget in the same range, not an open-ended "best effort" allowance. CI may keep a hardware-tolerant cap, but local strict verification must remain available and documented.

## Phase 1: Add Failing Observable Tests

Create these tests first and verify they fail on the current implementation.

1. `frontend/tests/e2e/settings/settings-retained-input-activation-visual.spec.ts`

   Scenario:
   - Open settings, switch to all settings, center `sectionSizingPolicy`.
   - Locate a visible single-line text-like retained control, preferably `StateMachineStart / Min Width`.
   - Capture a screenshot crop around the control before activation.
   - Click the control and capture crops during the first active frames and after the active editor settles.

   Assertions:
   - The control crop remains non-blank through activation.
   - The active crop does not show duplicate ink. Use image-level metrics such as ink-pixel ratio, dark/light component count, and bounding-box spread compared with the pre-click crop. The assertion should describe user-visible duplicate text, not internal compositor state.
   - The active editor's visual text baseline remains within a small CSS-pixel tolerance of the inactive baseline as measured from screenshots.

2. `frontend/tests/e2e/settings/settings-retained-input-activation-cadence.spec.ts`

   Scenario:
   - Install the existing frame/long-task sampler.
   - Open settings and center a retained settings surface.
   - Capture baseline scroll cadence over a retained section.
   - Click a text-like control, then immediately perform retained-section wheel scroll and hover zoom bursts.

   Assertions:
   - First post-click wheel burst changes retained section scroll, not native page scroll.
   - Frame p95, p99, slow-frame ratio, and long-task duration remain in the same cadence class as baseline retained scroll/zoom.
   - No long task over the existing CI budget is introduced by input activation.

3. `frontend/tests/e2e/settings/settings-retained-input-pan-ownership.spec.ts`

   Scenario:
   - Activate a retained text-like control.
   - Start a canvas pan gesture immediately after activation from the active control area and from adjacent retained content.

   Assertions:
   - The viewport transform changes within the gesture.
   - The active editor does not swallow viewport pan unless the gesture is a real text-selection gesture.
   - The page does not scroll.

4. `frontend/tests/e2e/settings/settings-retained-large-scene-120hz-performance.spec.ts`

   Scenario:
   - Open settings, switch to All Settings, and verify the scene is large and complex: more than 30 nodes, more than 400 retained rows, multiple retained surface ids, and mixed control kinds including text-like, switch, dropdown, nested, and color-picker.
   - Measure baseline requestAnimationFrame cadence on the same browser session.
   - Run gesture bursts for viewport pan, viewport zoom, retained-hover zoom, retained section scroll, and scroll-then-retained-hover-zoom.
   - Capture screenshots or visual stats before and after each gesture.

   Assertions:
   - In strict local mode, each gesture meets the 120 fps-class target in the Performance Target section.
   - In CI mode, each gesture stays within a documented hardware-tolerant cap while still reporting the strict 120 fps deltas in the failure details and perf sample.
   - The visual region remains non-blank and has no large placeholder bands after each gesture.
   - Retained section scrolling changes the retained scroll signature and does not move native page scroll.
   - DOM-control texture count, DOM-control upload count, DOM-control uploaded bytes, retained structural upload count, passive refinement backlog, held transaction count, cold blank count, active paint latency, and active upload latency stay within explicit budgets. These diagnostics are secondary to observed cadence/visual assertions, but they must catch the "400 tiny uploads" failure mode.

5. `frontend/tests/e2e/settings/settings-retained-input-edit-commit.spec.ts`

   Scenario:
   - Activate a retained text-like control.
   - Type a character or replace the value.
   - Verify the live active editor updates.
   - Commit with Enter or blur according to existing `ParamInput` behavior.
   - Verify the passive retained value matches the committed edit.
   - Reactivate the same control.

   Assertions:
   - No duplicate ink appears while typing, committing, blurring, or reactivating.
   - The passive retained texture never flashes the stale pre-edit value after commit.
   - The active and passive baselines remain within tolerance before and after commit.

6. `frontend/tests/e2e/settings/settings-retained-input-focus-keyboard.spec.ts`

   Scenario:
   - Traverse settings with Tab before activating a retained text-like control.
   - Activate the control with click and with keyboard where supported.
   - Exercise Escape, Enter, blur, and normal typing.

   Assertions:
   - Passive retained DOM-control sources are not tab stops.
   - Passive retained DOM-control sources are not exposed as duplicate accessibility controls.
   - After activation, keyboard input goes to the active source.
   - Escape, Enter, and blur semantics match existing `ParamInput` behavior.

7. `frontend/tests/e2e/settings/settings-retained-input-composition-paste.spec.ts`

   Scenario:
   - Activate a CodeMirror-backed retained text-like control.
   - Exercise paste, undo/redo, `beforeinput`, and composition event smoke coverage where the browser/test harness supports it.

   Assertions:
   - Dirty tracking updates active and passive visual output without duplicate ink.
   - Composition and paste do not publish stale passive textures under live active DOM.
   - Undo/redo produces the same committed value and visual result as the existing non-retained input path.

8. Extend Chrome recording assertions where practical:

   - Record activation-to-first-stable-frame duration.
   - Record first post-click wheel ownership.
   - Record visual crop stats for the active control.
   - Record pan, zoom, retained section scroll, and mixed gesture frame p95/p99/slow-frame-ratio for the All Settings-sized scene.
   - Record DOM-control texture count, upload count, uploaded bytes, held transaction count, cold blank count, active paint/upload latency, and passive refinement backlog.

These tests may use debug helpers to locate rows and crop regions, but the pass/fail criteria must be visual, input, scroll, and frame-cadence behavior.

Do not replace these with implementation-detail assertions such as "the compositor emitted mode X" or "function Y was called." Internal state can be captured as diagnostic context when a failure occurs, but the primary assertion must describe what a user or browser frame timeline observes.

Before implementation starts, run and record the current failures for the new tests so the refactor has a clear red-to-green baseline.

Required baseline artifact:

- Add an append-only `perf/` report for the failing baseline or update the phase report that accompanies the first implementation commit.
- Include the exact command, test names, pass/fail result, failure reason, screenshot metric summary for duplicate ink/baseline drift, edit/commit result, focus/tab result, composition/paste result, first-wheel ownership result, pan ownership result, frame p95/p99/slow-frame-ratio, long-task max, upload/texture diagnostics, native page scroll result, browser version, and scene shape.
- If a new test unexpectedly passes before implementation, explain why it is still a meaningful guard or strengthen it before continuing.

## Phase 2: Define Retained DOM Control Contracts

Add owner-defined frontend contracts for retained DOM controls:

- `GpuRetainedDomControlSourceDescriptor`
- `GpuRetainedDomControlTextureDescriptor`
- `GpuRetainedDomControlInteractionPolicy`
- `GpuRetainedDomControlPublicationState`
- `RetainedDomControlLifecycleState`
- `RetainedDomControlLayerSlot`

The descriptor should be derived from retained scene rows and control metadata. Do not maintain parallel handwritten inventories of control kinds. The project retained row adapter should declare whether a control is DOM-owned, canvas-owned, or GPU-native.

Every descriptor rect must use the coordinate-space names from the Retained DOM-Control Model section. The first contract pass should fail type review if it introduces unqualified geometry fields for DOM-control sources, page slots, or projected active rects.

This replaces text-like-only snapshot descriptors with a generic retained DOM-control surface. Text-like controls become one user of that surface.

Deletion checkpoint:

- Remove any new text-like-only descriptor aliases introduced during the migration before Phase 2 is considered complete.
- Keep existing text-like snapshot plumbing only as the source being replaced by the new DOM-control contract; do not add compatibility adapters around it.

## Phase 3: Add Publication-State Scaffolding

Add the minimal retained DOM-control publication model before deleting the old fallback path. This is not a backward-compatibility layer: it must not draw approximate value ink or silently select the old canvas text path as a DOM-control result.

The scaffold should model:

- passive texture ready
- active projection ready
- active occlusion ready
- previous coherent frame available
- cold blank reason
- held transaction reason
- stale passive-under-active prevention

The transition resolver should accept lifecycle state, descriptor keys, coverage readiness, gesture ownership, source paint readiness, texture upload readiness, and previous-frame availability. It should return a publish decision plus diagnostics. Those diagnostics should include held transaction count, cold blank count, active paint latency, active upload latency, passive refinement backlog, and the reason an active rect selected previous frame, passive texture, live projected source, or diagnosed cold blank.

Deletion checkpoint:

- Phase 3 is not complete while active text-like attach can bypass the new publication-state decision.
- Phase 3 is not complete while missing DOM-control coverage can silently fall back to canvas text approximation.

## Phase 4: Split Structural Pages From DOM-Control Texture Pages

Refactor retained page rasterization into the explicit layer stack:

- structural base
- passive DOM-control texture pages/atlases
- structural foreground
- active occlusion
- active projected source
- native overlay

Structural pages must never include browser-owned value ink. They may still draw row labels and non-browser-owned chrome text.

DOM-control texture work should be paged or atlased per retained surface/window:

- Keep per-control source rects inside a DOM-control page/atlas.
- Use per-control dirty rects and value/style/geometry/scroll keys.
- Keep structural retained page invalidation separate from DOM-control page invalidation.
- Treat missing first-visible DOM-control texture coverage as a display coverage problem, not as permission to approximate with canvas text.

Expected replacement:

- Tests asserting structural pages omit browser-owned value ink.
- Tests asserting DOM-control texture pages provide passive value ink.
- Tests asserting focus/error/hover foreground chrome layers correctly above passive value ink.
- Tests asserting active occlusion removes stale passive ink before live DOM projection.

Deletion checkpoint:

- Phase 4 is not complete while browser-owned text-like ink is still structurally coupled to retained page rasterization.
- Phase 4 is not complete while DOM-control textures are allocated one texture per visible text-like control.
- Phase 4 is not complete while foreground chrome, active occlusion, or native overlays rely on incidental z order.

## Phase 5: Delete Text-Like Canvas Value Fallback

Remove manual retained-canvas value drawing for browser-owned text-like controls.

Expected deletion:

- Canvas text layout constants for retained text-like values.
- Canvas fallback tests that assert passive CodeMirror-backed values are drawn with `fillText`.
- Any production retained text-like value path that calls `ctx.fillText`.

Expected replacement:

- Observed-behavior tests for passive DOM-control texture ink.
- Observed-behavior tests for activation without duplicate active/passive ink.
- Unit tests only where they support production invariants such as no browser-owned value ink in structural pages.

Deletion checkpoint:

- Phase 5 is not complete while any production retained text-like value path still calls `ctx.fillText`.
- Phase 5 is not complete while tests still assert passive text-like values are drawn by retained canvas fallback.
- Phase 5 is not complete while deleting the fallback creates warm activation blanks instead of holding the previous coherent transaction.

## Phase 6: Replace Active DOM Islands For Text-Like Controls

Move text-like active controls from viewport sibling DOM islands to projected source-layer DOM controls.

- Mount the source as a direct child of the `<canvas layoutsubtree>` source layer.
- During passive state, it is capture material with pointer events disabled.
- During active edit, synchronize its transform to the drawn viewport position and enable pointer events according to the interaction policy.
- Park non-active DOM controls outside the hit-test area or keep pointer events disabled, borrowing the `three-html-render` pattern.
- Keep CodeMirror tooltips and validation UI in their existing portal coordinate spaces, but anchor them to the projected source geometry.
- Preserve focus, selection, IME, paste, undo/redo, and keyboard behavior for the active projected source.

This removes the passive snapshot vs active island geometry split for text-like controls. There is one geometry descriptor and one DOM source contract.

Deletion checkpoint:

- Phase 6 is not complete while text-like active editing is mounted through the viewport sibling DOM-island layer.
- Non-text-like active DOM islands can remain until their own migration slice, but text-like active editing must use the retained DOM-control source contract.
- Tests that assert text-like active controls are derived as viewport DOM islands must be replaced with tests that assert projected source-layer ownership and user-visible interaction behavior.
- Passive retained DOM-control sources must be inert, `aria-hidden`, and not tabbable while non-active.

## Phase 7: Gesture Ownership Arbiter

Introduce a retained gesture ownership arbiter before DOM source projection:

- Pointer click for text edit: project the DOM control and focus it.
- Keyboard/editing: owned by the active DOM control.
- Wheel over a single-line text input: retained section scroll owns from event 1.
- Wheel over a multiline editor with scrollable content: editor owns only if it can consume scroll in that direction; otherwise retained section scroll owns.
- Ctrl/meta wheel: viewport zoom owns.
- Pointer drag from inactive text-like control: click-to-activate if below drag threshold; viewport pan if the pan threshold is crossed before text-selection intent.
- Pointer drag from active editor: editor owns only if classified as text selection/caret gesture; viewport pan owns otherwise.
- Pointer drag from active editor with selection modifier or a known text-selection target: editor owns.

A real text-selection gesture must be a deterministic predicate, not an after-the-fact browser fallback. Define it from active editor state, pointer down location within an editable text/caret region, movement direction/distance, platform selection modifiers, and editor scrollability. The arbiter should decide before enabling pointer events on a DOM source for wheel or pan. This avoids relying on late CodeMirror wheel handoff after the browser has already targeted the editor.

Deletion checkpoint:

- Phase 7 is not complete while first post-click wheel or pan ownership depends on late CodeMirror/browser event fallback after the active source has already captured the event.
- Phase 7 is not complete while "real text-selection gesture" is undefined or only described in comments.

## Phase 8: Active-First Scheduling

Refactor retained texture scheduling around active-first priorities:

- Active control source paint and upload always outrank passive LOD refinement.
- Activation invalidates only the active DOM control texture and the structural row/control coverage it affects.
- Passive refinement is deferred during input activation, active wheel, pan, and zoom.
- Texture upload budgets should reserve a small active-control lane so caret/input feedback cannot be starved by page refinement.
- The scheduler should report active-control paint latency, active-control upload latency, active uploaded bytes, DOM-control texture count, DOM-control upload count, retained structural upload count, held transaction count, cold blank count, and passive refinement backlog separately.

The expected observable result is that clicking an input does not create a long burst of unrelated retained-page uploads.

Deletion checkpoint:

- Phase 8 is not complete while text-like activation schedules broad passive retained-page or all-text-like-source refresh work unrelated to the active control and its affected structural/control rects.
- Phase 8 is not complete while the large-scene performance test cannot report DOM-control texture/upload counts and active paint/upload latency.

## Phase 9: Remove Legacy Paths And Update Architecture Docs

Because no backward compatibility is required:

- Delete text-like-only snapshot plumbing after generic DOM-control sources replace it.
- Delete text-like active DOM-island paths once projected source-layer controls own active editing.
- Delete tests that encode old implementation details.
- Update `docs/reference/html-in-canvas-architecture.md` to describe retained DOM-control surfaces as the canonical path.

The architecture doc update must say:

- Retained browser-owned controls are direct canvas-child DOM-control sources.
- Passive state captures them into retained DOM-control texture pages/atlases.
- Active state projects the same source-layer control to the drawn viewport rect.
- Text-like retained controls no longer use viewport sibling DOM islands.
- Retained structural pages do not draw browser-owned value ink.
- DOM islands may remain for non-text-like families that have not migrated yet, but text-like controls are explicitly excluded from that old active island path.

Deletion checkpoint:

- Phase 9 is not complete while text-like snapshot, active DOM-island, or canvas fallback compatibility paths remain in production code.
- Phase 9 is not complete while architecture docs still describe viewport sibling DOM islands as the text-like active editing path.

## Phase 10: Verification

Run focused verification after each major phase:

- `pnpm -C frontend exec vitest run src/gpuFlow/<focused-tests>`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-activation-visual.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-activation-cadence.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-pan-ownership.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-edit-commit.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-focus-keyboard.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-composition-paste.spec.ts`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-large-scene-120hz-performance.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`

Before landing the refactor, run the full GPU Flow-related regression suite, not only the new focused tests:

- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run tests/e2e/gpuFlowPerformanceProbe.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowInteractionLatencyProbe.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts frontend/tests/e2e/settings/settings-retained-large-scene-120hz-performance.spec.ts`
- `./scripts/quality/check.sh`

If any of these commands are too broad or too slow in CI, split them into documented shards, but do not drop coverage. A failure must be fixed or explicitly reclassified with evidence that it is unrelated to GPU Flow.

Manual/recording verification:

- Create a Chrome recording for the original repro.
- Confirm no duplicate text during active input.
- Confirm edit, commit, blur, reactivation, paste, composition, undo/redo, and keyboard focus behavior match the new tests.
- Confirm first post-click wheel scrolls retained content.
- Confirm panning is available immediately after activation.
- Confirm frame p95, long-task stats, texture/upload counts, active paint/upload latency, held transaction count, cold blank count, and passive refinement backlog match the new tests.
- Confirm pan, zoom, retained-hover zoom, retained section scroll, and mixed scroll/zoom are 120 fps-class on the large All Settings-sized scene, or attach the required `perf/` report explaining the fixed fallback budget.

## Success Criteria

- The failing tests from Phase 1 pass without loosening their visual or cadence budgets.
- There is no retained canvas `fillText` path for browser-owned text-like values.
- Retained text-like DOM-control lifecycle transitions are explicit, diagnosed, and gate publication.
- Structural base, passive DOM-control texture, structural foreground, active occlusion, active projected source, and native overlay layers have deterministic ordering.
- DOM-control descriptor geometry names its coordinate spaces.
- Browser-owned text-like textures are paged/atlased and do not allocate one WebGPU texture per visible control.
- Active and inactive text-like controls are aligned because they share a DOM-owned geometry/source contract.
- Passive DOM-control sources are not tabbable or exposed as duplicate accessibility controls.
- Input activation does not publish mixed stale canvas value pixels plus active CodeMirror.
- Edit/commit, focus, paste/composition, undo/redo, and reactivation do not flash stale passive values or duplicate active/passive ink.
- Immediate post-click wheel and pan gestures route correctly.
- Input activation produces bounded, active-scoped texture work, upload counts stay within budget, and retained scrolling cadence does not degrade.
- Large All Settings-sized pan, zoom, retained-hover zoom, retained section scroll, and mixed scroll/zoom meet the 120 fps-class target in strict local verification, or have a documented fixed fallback budget backed by Chrome trace evidence.
