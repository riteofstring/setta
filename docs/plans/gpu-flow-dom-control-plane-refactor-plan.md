# GPU Flow DOM Control Plane Refactor Plan

## Goal
Replace the retained DOM-control texture path with a first-class DOM control plane for visible section inputs.

The current implementation tries to make text-like controls look native by copying hidden DOM snapshots into retained GPU content pages, then reparenting an active editor overlay when the user clicks. The latest recording shows that this architecture is publishing frames where the source DOM has the correct value but the retained canvas pixels are blank or stale, and active editors can stop following their owning section after viewport movement.

The new direction is larger and more principled:

- GPU retained pages render section structure, labels, rows, backgrounds, non-control decoration, and canvas-owned controls.
- DOM-owned text-like controls are rendered as real DOM in a projected overlay layer whenever they are visible or near-visible.
- Focus, typing, caret, selection, IME, browser accessibility, and native input event semantics stay on the DOM path.
- Retained texture snapshots are not a correctness dependency for visible input values.
- There is no backward-compatible mode, transitional dual path, or silent fallback to the old retained DOM-control texture behavior.

## Why This Is Progress
The past 5-day direction appears to have been:

1. Keep section content as retained GPU pages.
2. Keep DOM controls as hidden source elements.
3. Copy those controls into snapshot-exact retained pages.
4. Project a live active editor only after click.
5. Patch blanking, readiness, filtering, and active overlay bugs around that model.

That model is the source of the observed failures:

- Blank values occur because a DOM source can be mounted and current while the retained page published for that row still lacks nonblank control pixels.
- Flicker occurs because publication can switch among previous retained frames, sparse passive DOM-control textures, and one active live source.
- The active editor can detach from its section because active projection is configured once from a sampled viewport rect instead of being a live overlay projection.
- Click and scroll performance degrades because a small input interaction can churn large retained page work.

This plan changes the ownership boundary instead of further patching the old one. DOM-owned controls become DOM-owned visually and interactively. The retained GPU compositor no longer has to prove that every visible input value has been correctly copied into a page texture before the user sees it.

## Evidence From The Latest Recording
The recording was enough to identify the design failure:

- Activation preflight found mounted DOM sources with matching source keys and correct text lengths, while the canvas probe at the same pointer location was blank.
- Retained DOM-control diagnostics reported large blank and missing passive row counts.
- Publication summaries showed most DOM controls using previous coherent frame visuals while only a small number used passive DOM-control textures.
- Texture memory hovered around the retained budget and repeated texture-upload frames continued during interaction.
- The active source path does not use the live viewport projection manager used by native DOM islands.

These are not isolated bugs in one row. They are symptoms of using retained page texture publication as the correctness path for live form controls.

## Borrowed Ideas From HTML-In-Canvas Examples
Use the examples in `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as design references, not as a package to copy wholesale.

- From `html-in-canvas-official/README.md`:
  - Treat DOM as the authority for layout, hit testing, focus, accessibility, and input state.
  - Keep canvas drawing and DOM hit-test projection synchronized with an explicit transform contract.
  - Do not call paint handlers directly; schedule rendering through the browser rendering cycle.

- From `three-html-render/src/interactionManagerStandalone.ts` and `src/interactionManager.ts`:
  - Use a projection manager that recomputes CSS transforms from scene coordinates and the live viewport.
  - Keep overlay positioning as a first-class per-frame concern, not a side effect of React re-render signatures.

- From `three-html-render/src/htmlInCanvasPolyfill.ts`:
  - Readiness must be explicit. Missing element paint records should fail loudly or schedule a specific repaint, not publish empty visuals as if they were valid.
  - Dynamic form state must be synchronized deliberately when a clone or snapshot is used.

- From `html-in-canvas-cracks/src/main.js`:
  - Keep coordinate systems in CSS pixels and make scroll/resize transforms explicit.
  - Use a fixed stage and stable viewport-space math so content does not drift during scroll.
  - Add debug views that expose source DOM, captured output, and final composite side by side.

- From `compiz-web/src/transitions/TransitionEngine.ts`:
  - Treat full-page HTML texture capture as an effect/compositing tool, not as the primary input correctness path.
  - Wait for the browser to have a paintable DOM state before texture work.

The main thing not to borrow is a full-page texture-every-frame approach. Setta needs large graph performance and very large DOM handling, so visible controls should be virtualized and projected, not captured as one giant page.

## Regression Policy
This refactor is not complete unless it protects against the failure mode that produced this plan: narrow tests passed while realistic GPU Flow behavior regressed.

Two requirements are mandatory:

1. Add realistic tests that assert observed behavior.
2. Run the full GPU Flow-related test suite before calling the work done.

Behavior tests must assert what the user or browser frame timeline observes:

- screenshots and visual pixel/ink metrics
- DOM focus and bounding boxes
- pan, zoom, scroll, and wheel ownership
- frame cadence and long-frame ratios
- visible mounted DOM scale where it is a user/resource outcome

Behavior tests must not primarily assert implementation details:

- retained publication state names
- texture upload counts
- source descriptor counts
- queue method calls
- internal compositor branch choices

Implementation diagnostics may be captured in failure details and may be used as secondary resource guardrails, but they cannot replace observed-behavior assertions.

Running only the new focused tests is not enough. The full GPU Flow-related suite must run because regressions in this area often show up in adjacent behavior: settings retained controls, editor surfaces, params interactions, section interactions, pan/zoom, scroll, visual parity, and retained compositor performance.

## Performance Target
The target interaction budget is 120 fps-class performance for a large, complex retained scene similar to the Settings project's All Settings page.

Required gesture coverage:

- viewport panning
- viewport zooming
- retained section wheel scrolling
- retained-hover zooming over dense retained content
- mixed retained section scroll followed by viewport pan/zoom

Required large-scene shape:

- comparable to All Settings, not a toy fixture
- more than 30 visible or near-visible nodes after opening the full settings view
- hundreds of retained rows
- multiple retained surface ids
- mixed control families including text-like inputs, switches, dropdowns, nested rows, color controls, and scrollable retained sections

Strict local target on hardware/browser setups capable of measuring 120 Hz or higher:

- p95 frame interval at or below 8.5 ms for each gesture
- p99 frame interval at or below 16.7 ms
- slow-frame ratio below 5 percent, where slow means above 8.5 ms in strict mode
- no long task above 50 ms during the measured gesture
- no visual blanks, stale input values, or placeholder bands after the gesture settles
- retained section scroll changes retained section scroll state, not native page scroll

CI or 60 Hz-capped environments cannot prove 120 fps. They still must run the same scenarios with hardware-aware reporting:

- record the display/browser rAF cadence baseline before the gesture
- assert the gesture stays close to the measured baseline rather than introducing large additional stalls
- report strict 120 fps deltas in failure details even when the environment cannot satisfy them
- never use a loose performance budget to hide visible blanking, input drift, or incorrect scroll ownership

If 120 fps-class performance is not achievable after the refactor, the fallback must be explicit and evidence-backed:

- capture before/after Chrome traces for the same large-scene gestures
- add an append-only `perf/` report describing the bottleneck and fixed fallback budget
- choose a fixed budget in the same range, for example around 10 to 12 ms p95, only if traces show why 8.5 ms is unrealistic
- do not accept open-ended "best effort" budgets or broad 20 to 36 ms allowances for the strict local lane

## Target Architecture

### DOM Control Plane
Add a `GpuFlowDomControlPlane` responsible for visible DOM-owned controls.

Responsibilities:

- Consume retained runtime descriptors for DOM-owned text-like controls.
- Mount only controls that intersect the viewport or a small overscan margin.
- Project each mounted control from flow coordinates into screen coordinates using the live viewport transform.
- Clip controls to their owning section content rect and retained section scroll window.
- Maintain native DOM focus and selection during pan, zoom, and section scrolling.
- Expose debug snapshots for row geometry, active focus, clip rects, and frame cadence.

The control plane replaces the retained DOM-control source layer as the visible user-facing layer.

### Structural GPU Content
Retained GPU content pages keep rendering:

- Section shells.
- Row labels.
- Row backgrounds and hover/selection states.
- Canvas-owned controls.
- Scrollbars and other retained decorations.

Retained GPU content pages do not render DOM-owned text-like input values.

The retained scene should reserve the input rect visually, but the actual input value, caret, focus ring, selection, and editable surface come from the DOM control plane.

### Projection
Projection must be owned by an imperative manager similar to the existing DOM island layer.

Requirements:

- The manager subscribes to viewport runtime/store updates.
- Pan and zoom update projected control transforms without waiting for React state changes.
- Section scroll updates only controls in that section.
- Active focused controls remain projected to the same flow rect as their passive state.
- A focused control that is scrolled or panned out of view is clipped or blurred according to explicit product behavior; it must never remain screen-fixed.

The projection source of truth should be stable flow-space geometry plus the current live viewport transform. A sampled `viewportRectCssPx` must not be the long-lived positioning authority.

### Rendering And Activation
Visible text-like controls should be real DOM before click, not blank retained texture placeholders.

Rules:

- A user can see the current value before clicking.
- Clicking focuses the already-positioned DOM control or swaps to a heavier editor inside the same projected host without moving the host.
- If a heavy editor such as CodeMirror is lazy-mounted on activation, the lightweight visible state remains in place until the editor is ready.
- Passive and active renderers must share one visual contract. Do not keep an unrelated passive dummy renderer that can drift from the active editor.
- Activation must not reparent the focused host into a different coordinate system.

### Large DOM Handling
The control plane must be virtualized.

Rules:

- Mount controls only for visible and near-visible rows.
- Keep offscreen controls unmounted, not hidden in a huge DOM tree.
- Preserve active focused controls while they remain relevant to the current section interaction.
- Use stable keys based on surface id and row id.
- Avoid layout reads in bulk during pan/zoom; projection should use known descriptors and batched style writes.

### No Retained DOM-Control Texture Correctness Path
Remove DOM-control texture correctness from retained page publication.

Old concepts to remove or stop depending on:

- DOM-control texture descriptors embedded in retained content page surfaces.
- Snapshot-exact retained pages as the way visible input values appear.
- Page publication states that allow a visible control to fall back to a previous blank frame.
- Preparation filters that can exclude correctness-critical visible controls because source counts exceed a budget.

If a later performance pass proves bitmap snapshots are needed for far-offscreen or non-interactive previews, that should be a separate per-control atlas feature with its own plan and tests. It must not be the initial correctness path for visible editable controls.

## Work Plan

### 1. Create Failing Behavior Tests First
Add Playwright tests that reproduce the exact observed user failures before any production refactor. These tests should fail against the current implementation.

Create a new spec such as `frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts`.

The tests must assert user-observable behavior, not implementation details:

- Active input follows its owning section during pan and zoom:
  - Open Settings, navigate to All Settings or the view from the recording.
  - Click a text-like setting input such as `Zoom To Mouse Shortcut`, `Unpinned Params Area Min Height`, or another visible retained text-like row.
  - Pan the viewport while the input remains focused.
  - Assert the focused editor remains inside the owning section's visible bounds and tracks the row control rect within a small pixel tolerance.
  - Assert it never remains at the old screen position while the section moves.

- Values are visible before click after section scroll:
  - Open a large retained settings section.
  - Scroll within the section until new rows enter the visible area.
  - Capture screenshots of the visible control column before clicking.
  - Assert visible text/value ink exists for nonempty rows using screenshot analysis, contrast/text-band detection, or a direct visual probe.
  - Then click the same rows and assert the value does not suddenly appear only after focus.

- Clicking an input does not blank or flicker surrounding content:
  - Capture a stable clip around several rows.
  - Click one text-like input.
  - Capture a short sequence over the next animation frames.
  - Assert no frame has a large blank region where text/value content was present before.
  - Allow small caret/focus-ring differences only inside the clicked control.

- Section input interactions preserve frame cadence:
  - Start a requestAnimationFrame sampler.
  - Click, type, pan, zoom, and section-scroll in the same retained settings section.
  - Assert p95 frame interval and slow-frame ratio stay under explicit product budgets.
  - Do not assert texture upload counts, source counts, publication states, or queue internals.

These tests may use row debug helpers only to find target rows and user-facing geometry. The pass/fail assertions should be based on screenshots, DOM focus/bounding boxes, and frame cadence.

Before implementation begins, run the new spec and capture the failing output. Store screenshots and failure details in normal Playwright output. Do not weaken the tests to match current behavior.

### 2. Define The Control Plane Contract
Introduce explicit frontend types for the DOM control plane.

Required contract fields:

- Stable control id: surface id plus row id.
- Owning section id and surface id.
- Flow-space control rect.
- Section clip rect in flow or screen coordinates.
- Section scroll revision and scroll offset.
- Current value and visual style key.
- Editor kind and line policy.
- Active/focused state.
- Disabled/error state.
- Z-order.

The contract should be derived from existing Go-owned/runtime section data where possible. Do not add parallel Python or TypeScript mirrors for data that already has an owner.

### 3. Build The Projected DOM Control Layer
Add the mounted control layer beside the existing canvas and DOM island layers.

Implementation requirements:

- Use a single overlay root under the GPU flow surface.
- Use an imperative projection manager with batched writes.
- Subscribe to viewport runtime/store updates.
- Update transforms on pan/zoom without React re-render.
- Clip controls to section content bounds.
- Virtualize by visible rect plus overscan.
- Keep DOM order stable for accessibility and predictable tab behavior.

The projection manager should be the only place that writes positioning styles for DOM controls.

### 4. Move Text-Like Inputs To The Control Plane
Route DOM-owned text-like setting/section controls through the new control plane.

Rules:

- The visible value is DOM, not retained texture.
- The focused editor stays in the same projected host.
- Heavy editor activation is allowed only inside the stable host.
- No reparenting on focus.
- No passive hidden source element is required for correctness.

Canvas hit testing should treat DOM-control rects as owned by the overlay. Pointer events inside controls go to DOM. Pointer events outside controls continue to support pan, zoom, selection, node drag, and retained section scroll.

### 5. Remove DOM-Control Textures From Retained Page Publication
Delete the old correctness path after text-like controls are served by the control plane.

Remove or simplify:

- DOM-control texture descriptors on retained content page surfaces.
- Snapshot-exact page logic that exists only to capture DOM-owned text-like controls.
- DOM-control readiness gates in retained page upload/publication.
- Source-count preparation filters for retained DOM-control snapshots.
- Active overlay reparenting for retained DOM controls.

Retained pages should become structurally simpler: they render the section excluding DOM-owned input value pixels.

### 6. Stabilize Interaction Ownership
Make interaction ownership explicit.

Rules:

- DOM controls own click, focus, selection, text input, IME, clipboard, and native keyboard editing while focused.
- GPU flow owns pan/zoom/drag shortcuts outside control rects.
- Wheel events over a focused multiline editor scroll the editor when it can scroll; otherwise section or viewport scroll behavior follows the existing product rules.
- Global shortcuts either respect focused text input or use an explicit command escape path.

Add behavior tests for the cases above only where the refactor changes risk.

### 7. Add Performance Guardrails
Keep performance validation behavior-oriented.

Required checks:

- Frame cadence during click-to-focus on a large retained settings section.
- Frame cadence during pan and zoom with a focused text-like input.
- Frame cadence during section wheel scroll with many visible controls.
- 120 fps-class pan, zoom, retained-hover zoom, and retained section scroll in an All Settings-sized scene.
- Before/after trace-backed reporting if the strict 120 fps-class target cannot be met.
- Mounted DOM control count stays proportional to visible rows, not total settings rows.

The mounted DOM count check is allowed as a resource guardrail, but it should not assert internal retained texture implementation details.

### 8. Delete Dead Code And Tighten Diagnostics
Once the behavior tests pass:

- Remove old retained DOM-control source/snapshot modules that are no longer called.
- Remove diagnostics that only describe the deleted texture snapshot path.
- Add concise diagnostics for the new plane:
  - mounted control count
  - active control id
  - projection write count per frame
  - worst projection batch duration
  - visible control rect count
  - clipped control count

Diagnostics should help debug future projection or virtualization failures without becoming test or product dependencies.

### 9. Verification
Run targeted verification in this order:

1. The new failing-first Playwright spec.
2. Existing retained settings specs that cover activation, scroll, pan, zoom, visual regressions, and performance.
3. Relevant Vitest suites under `frontend/src/gpuFlow`.
4. `./scripts/quality/check.sh` unless the implementation scope is explicitly narrowed later.
5. CDP visual verification for the settings retained controls path.

Before the refactor is considered complete, run the full GPU Flow-related suite, not only the new focused tests:

- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run tests/e2e/gpuFlowPerformanceProbe.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowInteractionLatencyProbe.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- `./scripts/quality/check.sh`

If a command is too broad for one local run, split it into documented shards and run every shard. Do not drop a suite because it is slow. Any failure must be fixed or explicitly reclassified with evidence that it is unrelated to GPU Flow.

Final implementation notes must include:

- Which old retained DOM-control texture paths were removed.
- Which behavior tests failed before the refactor and pass after.
- Which full GPU Flow-related suites were run, with command results.
- Frame cadence before/after for the tested click, pan/zoom, and section-scroll scenarios.
- 120 fps-class strict local results for All Settings-sized pan, zoom, retained-hover zoom, and retained section scroll, or a trace-backed fallback budget in `perf/`.
- `CDP visual check: done (...)`.

## Acceptance Criteria

- A visible nonempty section input never appears blank before click after section scroll.
- Clicking an input does not blank surrounding retained section content.
- A focused input follows its owning section during pan, zoom, and retained section scroll.
- Input focus does not cause large retained page upload churn or poor frame cadence.
- Visible DOM control count scales with the viewport, not total project/settings size.
- The old DOM-control texture-in-retained-page correctness path is removed, not kept behind a compatibility branch.
- The new behavior tests fail on the current implementation and pass after the refactor.
- Large All Settings-sized pan, zoom, retained-hover zoom, and retained section scroll meet the 120 fps-class strict local target, or have an explicit trace-backed fixed fallback budget in the same range.
- The full GPU Flow-related test suite listed in Verification has run cleanly, or each non-clean result has documented evidence showing it is unrelated to GPU Flow.

## Explicit Non-Goals

- No backward compatibility shim for the old retained DOM-control texture path.
- No feature flag that keeps both old and new correctness paths alive.
- No heuristic fallback that publishes blank or stale controls when projection or mounting is late.
- No tests that only assert implementation internals such as texture upload counts, retained source counts, or specific publication state names.
- No full-page HTML texture capture for normal Setta section input rendering.
