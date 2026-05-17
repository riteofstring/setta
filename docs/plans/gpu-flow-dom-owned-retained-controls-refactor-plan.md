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
- A retained DOM control source has one descriptor: source id, row id, surface id, source rect, drawn rect, clip rect, z order, control role, value/style key, and interaction policy.
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

## Invariants

- A control value has exactly one visual owner in any published frame.
- Browser-owned text is never drawn with `ctx.fillText`.
- Passive and active text-like states use the same geometry descriptor and source component contract.
- Active attach, active detach, scroll, and viewport movement publish only coherent transactions.
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

5. Extend Chrome recording assertions where practical:

   - Record activation-to-first-stable-frame duration.
   - Record first post-click wheel ownership.
   - Record visual crop stats for the active control.
   - Record pan, zoom, retained section scroll, and mixed gesture frame p95/p99/slow-frame-ratio for the All Settings-sized scene.

These tests may use debug helpers to locate rows and crop regions, but the pass/fail criteria must be visual, input, scroll, and frame-cadence behavior.

Do not replace these with implementation-detail assertions such as "the compositor emitted mode X" or "function Y was called." Internal state can be captured as diagnostic context when a failure occurs, but the primary assertion must describe what a user or browser frame timeline observes.

Before implementation starts, run and record the current failures for the new tests so the refactor has a clear red-to-green baseline.

Required baseline artifact:

- Add an append-only `perf/` report for the failing baseline or update the phase report that accompanies the first implementation commit.
- Include the exact command, test names, pass/fail result, failure reason, screenshot metric summary for duplicate ink/baseline drift, first-wheel ownership result, pan ownership result, frame p95/p99/slow-frame-ratio, long-task max, native page scroll result, browser version, and scene shape.
- If a new test unexpectedly passes before implementation, explain why it is still a meaningful guard or strengthen it before continuing.

## Phase 2: Define Retained DOM Control Contracts

Add owner-defined frontend contracts for retained DOM controls:

- `GpuRetainedDomControlSourceDescriptor`
- `GpuRetainedDomControlTextureDescriptor`
- `GpuRetainedDomControlInteractionPolicy`
- `GpuRetainedDomControlPublicationState`

The descriptor should be derived from retained scene rows and control metadata. Do not maintain parallel handwritten inventories of control kinds. The project retained row adapter should declare whether a control is DOM-owned, canvas-owned, or GPU-native.

This replaces text-like-only snapshot descriptors with a generic retained DOM-control surface. Text-like controls become one user of that surface.

Deletion checkpoint:

- Remove any new text-like-only descriptor aliases introduced during the migration before Phase 2 is considered complete.
- Keep existing text-like snapshot plumbing only as the source being replaced by Phase 3 and Phase 4; do not add new compatibility adapters around it.

## Phase 3: Split Structural Pages From DOM-Control Textures

Refactor retained page rasterization so structural pages never include browser-owned text values.

- Remove manual value text drawing for text-like controls.
- Keep structural canvas drawing for row chrome and non-browser-owned controls.
- Produce DOM-control texture work from DOM-control descriptors.
- Treat missing first-visible DOM-control texture coverage as a display coverage problem, not as permission to approximate with canvas text.
- Keep retained page and DOM-control texture lifecycles separate so activating one input does not invalidate unrelated retained pages.

Expected deletion:

- Canvas text layout constants for retained text-like values.
- Canvas fallback tests that assert passive CodeMirror-backed values are drawn with `fillText`.

Expected replacement:

- Tests asserting structural pages omit browser-owned value ink.
- Tests asserting DOM-control textures provide passive value ink.

Deletion checkpoint:

- Phase 3 is not complete while any production retained text-like value path still calls `ctx.fillText`.
- Phase 3 is not complete while tests still assert passive text-like values are drawn by retained canvas fallback.
- Structural pages may still draw row labels and non-browser-owned chrome text, but browser-owned text-like value ink must come only from DOM-control textures.

## Phase 4: Replace Active DOM Islands For Text-Like Controls

Move text-like active controls from viewport sibling DOM islands to projected source-layer DOM controls.

- Mount the source as a direct child of the `<canvas layoutsubtree>` source layer.
- During passive state, it is capture material with pointer events disabled.
- During active edit, synchronize its transform to the drawn viewport position and enable pointer events according to the interaction policy.
- Park non-active DOM controls outside the hit-test area or keep pointer events disabled, borrowing the `three-html-render` pattern.
- Keep CodeMirror tooltips and validation UI in their existing portal coordinate spaces, but anchor them to the projected source geometry.

This removes the passive snapshot vs active island geometry split for text-like controls. There is one geometry descriptor and one DOM source contract.

Deletion checkpoint:

- Phase 4 is not complete while text-like active editing is mounted through the viewport sibling DOM-island layer.
- Non-text-like active DOM islands can remain until their own migration slice, but text-like active editing must use the retained DOM-control source contract.
- Tests that assert text-like active controls are derived as viewport DOM islands must be replaced with tests that assert projected source-layer ownership and user-visible interaction behavior.

## Phase 5: Transactional Publication

Refactor retained display publication around a single transaction:

- structural retained pages
- DOM-control textures
- projected active DOM source state
- active control occlusion/blanking
- native retained visuals

Publication rules:

- Do not publish an active projected editor unless the passive layer under it no longer contains stale value ink.
- Do not publish a cold placeholder for a first-visible active control.
- If coverage is missing, hold the previous coherent frame and keep previous interaction state until the next transaction is ready.
- Active attach and detach should be small transactions scoped to the affected row/control rect.

Remove any hardcoded coverage bypass for active island attach. Coverage readiness should be computed from the transaction's actual visual requirements.

Deletion checkpoint:

- Phase 5 is not complete while active text-like attach can bypass coverage readiness or publish over stale retained value pixels.
- Phase 5 is not complete while activation invalidates unrelated retained pages or unrelated text-like DOM-control textures.

## Phase 6: Gesture Ownership Arbiter

Introduce a retained gesture ownership arbiter before DOM source projection:

- Pointer click for text edit: project the DOM control and focus it.
- Keyboard/editing: owned by the active DOM control.
- Text selection drag inside active text: owned by the active DOM control.
- Wheel over a non-scrollable single-line editor: owned by retained section scroll from the first event.
- Canvas pan gesture: owned by viewport pan unless explicitly classified as text selection.
- Ctrl/meta wheel zoom: owned by viewport zoom.

The arbiter should decide before enabling pointer events on a DOM source for wheel or pan. This avoids relying on late CodeMirror wheel handoff after the browser has already targeted the editor.

Deletion checkpoint:

- Phase 6 is not complete while first post-click wheel or pan ownership depends on late CodeMirror/browser event fallback after the active source has already captured the event.

## Phase 7: Active-First Scheduling

Refactor retained texture scheduling around active-first priorities:

- Active control source paint and upload always outrank passive LOD refinement.
- Activation invalidates only the active DOM control texture and the structural row/control coverage it affects.
- Passive refinement is deferred during input activation, active wheel, pan, and zoom.
- Texture upload budgets should reserve a small active-control lane so caret/input feedback cannot be starved by page refinement.
- The scheduler should report active-control paint latency, active-control upload latency, and passive refinement backlog separately.

The expected observable result is that clicking an input does not create a long burst of unrelated retained-page uploads.

Deletion checkpoint:

- Phase 7 is not complete while text-like activation schedules broad passive retained-page or all-text-like-source refresh work unrelated to the active control and its affected structural/control rects.

## Phase 8: Remove Legacy Paths

Because no backward compatibility is required:

- Delete text-like canvas value fallback rendering.
- Delete text-like-only snapshot plumbing after generic DOM-control sources replace it.
- Delete text-like active DOM-island paths once projected source-layer controls own active editing.
- Delete tests that encode old implementation details.
- Update `docs/reference/html-in-canvas-architecture.md` to describe retained DOM-control surfaces as the canonical path.

## Phase 9: Verification

Run focused verification after each major phase:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow/<focused-tests>`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-activation-visual.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-activation-cadence.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-input-pan-ownership.spec.ts`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-large-scene-120hz-performance.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`

Before landing the refactor, run the full GPU Flow-related regression suite, not only the new focused tests:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow`
- `pnpm -C frontend exec vitest run frontend/tests/e2e/gpuFlowPerformanceProbe.test.ts frontend/tests/e2e/gpuFlowVisualParityProbe.test.ts frontend/tests/e2e/gpuFlowLargeGraphStressFixture.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpuFlowVisualParityProbe.test.ts frontend/tests/e2e/gpuFlowInteractionLatencyProbe.test.ts frontend/tests/e2e/gpuFlowLargeGraphStressFixture.test.ts frontend/tests/e2e/gpuFlowPerformanceProbe.test.ts`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts frontend/tests/e2e/settings/settings-retained-large-scene-120hz-performance.spec.ts`
- `./scripts/quality/check.sh`

If any of these commands are too broad or too slow in CI, split them into documented shards, but do not drop coverage. A failure must be fixed or explicitly reclassified with evidence that it is unrelated to GPU Flow.

Manual/recording verification:

- Create a Chrome recording for the original repro.
- Confirm no duplicate text during active input.
- Confirm first post-click wheel scrolls retained content.
- Confirm panning is available immediately after activation.
- Confirm frame p95 and long-task stats match the new tests.
- Confirm pan, zoom, retained-hover zoom, retained section scroll, and mixed scroll/zoom are 120 fps-class on the large All Settings-sized scene, or attach the required `perf/` report explaining the fixed fallback budget.

## Success Criteria

- The failing tests from Phase 1 pass without loosening their visual or cadence budgets.
- There is no retained canvas `fillText` path for browser-owned text-like values.
- Active and inactive text-like controls are aligned because they share a DOM-owned geometry/source contract.
- Input activation does not publish mixed stale canvas value pixels plus active CodeMirror.
- Immediate post-click wheel and pan gestures route correctly.
- Input activation produces bounded, active-scoped texture work and does not degrade retained scrolling cadence.
- Large All Settings-sized pan, zoom, retained-hover zoom, retained section scroll, and mixed scroll/zoom meet the 120 fps-class target in strict local verification, or have a documented fixed fallback budget backed by Chrome trace evidence.
