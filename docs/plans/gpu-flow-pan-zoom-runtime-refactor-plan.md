# GPU Flow Pan/Zoom Runtime Refactor Plan

## Goal

Make pan, zoom, and retained-content viewport motion smooth under retained-content-heavy settings views by moving the interaction hot path out of React/state churn and into a retained GPU-flow runtime.

The target behavior is:

- Trackpad pan and ctrl-wheel/pinch zoom in All Settings should sustain frame cadence close to the display refresh budget.
- The hot path should transform already-retained visuals first and schedule content maintenance after the frame.
- Active editors and DOM islands should stay geometrically aligned without requiring React renders on every viewport tick.
- Retained text-like rows should remain visible during pan/zoom, including stale-visible rows while sharper or newly dirty content is prepared.

## Evidence From The Latest Recording

Recording: `recording-20260513-115850`

Observed signals:

- 1,487 wheel events over about 36.6 seconds.
- 47 wheel-associated frame gaps.
- Wheel gap distribution: p50 about 50 ms, p95 about 66.7 ms, max about 241.7 ms.
- GPU-flow `wheel-zoom` frames averaged about 2.4 ms, max about 8.8 ms.
- GPU-flow `pan-scroll` viewport frames averaged about 3.5 ms.
- Active `wheel-zoom` and `pan-scroll` frames reported zero retained texture uploads.
- The recording emitted large app-state diagnostics, so absolute gap values are likely recording-amplified, but the shape is clear: the draw/upload work is not the main bottleneck during active viewport movement.

Conclusion: this is primarily a viewport interaction ownership and scheduling problem, not a texture upload budget problem.

## Ideas To Borrow From The Example Repos

Use these as architectural guidance, not as dependencies to copy wholesale.

- `html-in-canvas-official/Examples/text-input.html`
  - The canvas owns `onpaint`.
  - Drawing real DOM with `drawElementImage` returns a transform that aligns the source DOM with the painted pixels.
  - Source DOM remains the native interactive surface; canvas drawing and DOM alignment are a runtime concern.

- `html-in-canvas-official/Examples/pie-chart.html`
  - Content is drawn into canvas and each source element transform is updated as part of the paint operation.
  - Focus drawing is handled as an observable visual behavior, not by reimplementing widget internals.

- `three-html-render/src/interactionManager.ts` and `src/htmlOverlayRenderer.ts`
  - The overlay layer is updated by a small runtime that writes one CSS matrix transform per registered element.
  - The update happens in the animation loop, not through framework renders.
  - Viewport/camera matrices are runtime inputs; the framework does not sit in the middle of every pointer or wheel frame.

- `three-html-render/src/htmlInCanvasPolyfill.ts`
  - Paint is explicitly scheduled and coalesced with `requestAnimationFrame`.
  - Dirty elements are rasterized before dispatching a paint event.
  - Multiple invalidations collapse into one paint pass.

- `html-in-canvas-cracks/src/main.js`
  - A fixed viewport stage can stay compositor-pinned while shaders receive scroll/viewport values.
  - Avoid syncing transforms through layout when a uniform or runtime transform is enough.

The common principle: content invalidation, source DOM alignment, interaction hit testing, and viewport transforms are runtime responsibilities. React should author scene data and interactive components, but it should not be required for every pan/zoom frame.

## Current Problem Shape

The current system still lets viewport motion fan out through several layers:

- Wheel events immediately mutate the viewport store.
- Store subscribers update the canvas layer and request frames.
- Some DOM islands and overlays subscribe to transform changes and update React state.
- Retained frame preparation and diagnostic publication can run during viewport frames even when the visible work is just a transform.
- React-visible viewport state is both an interaction input and a UI observation surface.

That architecture makes every high-frequency wheel gesture compete with React subscriptions, DOM island rerenders, debug serialization, source DOM transform writes, and retained maintenance scheduling. The renderer can draw quickly, but it is not isolated enough to reliably get the main thread when the input stream is dense.

## Target Architecture

### 1. Runtime-Owned Viewport State

Introduce a GPU-flow runtime object that owns the live viewport transform during interaction.

The runtime owns:

- current viewport transform
- pending input deltas
- active interaction flags
- RAF scheduling
- visible window calculation needed for drawing
- overlay transform application
- post-frame maintenance scheduling

React/Zustand receives committed viewport snapshots, but the live transform used by pan/zoom frames is not driven through React renders.

### 2. Input Aggregation Before State Mutation

Wheel and pointer pan handlers should only:

1. claim the event when appropriate
2. prevent native browser scrolling/zooming
3. append deltas to the runtime input accumulator
4. request a runtime frame if one is not pending

The handler should not synchronously update public viewport state on every wheel event.

On the next runtime frame:

1. coalesce all pending deltas
2. update the live viewport transform once
3. draw existing retained visuals
4. update imperative overlays
5. publish a throttled or end-of-burst viewport snapshot for non-hot UI

### 3. React As Scene Author, Not Frame Driver

React continues to produce scene snapshots when project/settings/layout data changes.

React does not:

- rerender DOM islands because the viewport changed
- rerender edge overlays because the viewport changed
- recompute retained content scene ownership for every wheel event
- receive every intermediate transform as component state

The runtime consumes the latest React-authored scene snapshot plus live viewport state.

### 4. Imperative DOM Island And Editor Overlay Manager

Replace viewport-driven React state in DOM island layers with a runtime overlay manager inspired by `three-html-render`:

- register overlays with element, local rect, z/indexing, and interaction policy
- compute CSS transforms from runtime viewport matrices
- write stable `transform`, `display`, and `pointer-events` styles directly in the frame loop
- hide or park overlays when outside the visible window
- keep active CodeMirror overlays aligned by the same path

This is not a compatibility wrapper around the old DOM island layer. The old transform-through-React path should be deleted.

### 5. Explicit Paint Scheduler

Adopt an HTML-in-canvas-like paint boundary for retained content:

- Scene/content changes mark source elements dirty.
- Dirty source elements coalesce into a paint pass.
- A paint pass prepares source DOM, uploads/rasterizes needed pages, and only then promotes new retained visuals.
- Viewport-only frames draw from already committed visuals.

During active pan/zoom:

- visible missing content and active-editor handoff work may run under a strict budget
- refinement and prefetch work wait until the interaction is idle
- stale visible content remains drawable

### 6. Separated Snapshot Publication

The runtime publishes viewport snapshots to public state only for:

- controls such as zoom buttons and minimap
- persistence
- debug panels
- end-of-gesture settling
- low-frequency observation during long interactions

The publication cadence should be bounded, for example at most once per animation frame after drawing, and possibly lower for noncritical UI. Consumers that need exact per-frame geometry should be moved into the runtime, not kept as store subscribers.

### 7. Bounded Diagnostics

Chrome repro and performance probes must not distort the scenario they measure.

For pan/zoom performance captures:

- record frame intervals, long tasks, event timing, viewport samples, and visual nonblank checks
- keep large retained-content diagnostics sampled or disabled unless the test is specifically about diagnostics
- avoid serializing hundreds of source descriptors per frame

Diagnostics are supporting evidence, not the acceptance criteria.

## Non-Goals

- Do not add backward compatibility for the old viewport hot path.
- Do not keep dual viewport ownership.
- Do not add legacy shims or old-field aliases.
- Do not tune texture upload budgets as the primary fix.
- Do not broaden retained paint scheduling before the viewport runtime baseline
  proves retained maintenance is still blocking the hot path.
- Do not replace behavior tests with queue-name, store-shape, or internal-counter assertions.
- Do not add a new framework or third-party renderer dependency unless a later design note proves it is necessary.

## Step 1: Failing Behavior Tests And Baseline

This step is a hard gate. Do not refactor the runtime before the current pan/zoom issue is captured by tests and a baseline report.

### Required Test: All Settings Pan/Zoom Frame Cadence

Add a Playwright E2E spec, for example:

`frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts`

Scenario:

1. Navigate to `/settings`.
2. Switch to All Settings.
3. Wait for a retained-content-heavy scene, for example more than 50 retained rows and more than 30 GPU-flow nodes.
4. Install the existing GPU-flow performance probe or a narrower pan/zoom sampler.
5. Move the pointer over the GPU-flow canvas.
6. Run a deterministic ctrl-wheel zoom burst matching the latest recording shape:
   - canvas target
   - ctrl/meta zoom gesture as appropriate for the platform mode
   - at least 120 wheel events or an equivalent 2-3 second burst
   - dense trackpad-like deltas rather than one large mouse-wheel jump
7. Repeat with scroll-pan, using the settings `panOnScroll` path if needed.

Test driver constraints:

- Prefer real Playwright input for the primary measured path:
  `page.keyboard.down(...)`, `page.mouse.move(...)`, and `page.mouse.wheel(...)`
  over the canvas target. Use synthetic `WheelEvent` dispatch only for helper
  probes that are not used to assert native scroll prevention.
- Run a short warmup gesture after All Settings has settled, then start the
  measured burst after at least one quiet animation frame.
- Exclude only a bounded warmup window from the measurement, for example the
  first 300 ms or first 10 sampled frames, whichever is smaller. Report both
  raw and warmup-excluded frame distributions.
- Keep the local acceptance budget strict. If CI needs a separate quarantine or
  observation threshold later, document that separately and do not silently
  loosen the local target.
- The failure output must include the event spacing used by the driver so a
  later pass cannot accidentally turn the dense trackpad-like burst into a slow
  mouse-wheel sequence.

Observed assertions:

- The viewport visibly changes during the burst.
- The pane canvas remains nonblank before, during, and after the gesture.
- The visible retained rows remain nonblank in sampled row/control bounds.
- Frame cadence meets an explicit user-visible budget:
  - p95 frame interval <= 34 ms
  - max frame interval <= 50 ms after warmup
  - no long task > 50 ms during the measured burst
- The browser page does not native-scroll while the canvas gesture is claimed.

Why this should fail now:

- The latest recording shows wheel-associated frame gaps with p50 about 50 ms, p95 about 66.7 ms, and max about 241.7 ms.
- The current implementation still mutates viewport state and wakes subscribers per high-frequency wheel event.

The test must report failure details with:

- measured frame interval distribution
- long task summary
- gesture duration and event count
- whether the viewport changed
- before/during/after nonblank pixel summaries

Do not make internal implementation details acceptance criteria:

- no assertions about Zustand store mutation counts
- no assertions about queue names
- no assertions about retained maintenance item kinds
- no assertions about React render counts unless they are supplemental diagnostics

### Required Test: Active Editor Overlay Alignment During Zoom

Add or extend a browser test that:

1. Activates a retained text-like row in All Settings.
2. Samples the active editor bounding box and the retained row/control bounds.
3. Runs a short zoom burst.
4. Verifies the editor remains visually aligned with the same row/control and text remains visible.
5. Verifies typing still works after the zoom burst.

Observed assertions:

- editor/control geometry drift stays within a small CSS-pixel tolerance
- text pixels remain nonblank in the editor/control bounds
- typed text appears in the active editor after the gesture

This captures the user-visible reason the overlay manager must move into the runtime.

### Required Test: Viewport Gesture Does Not Depend On React Render Cadence

Add a behavior test that creates an intentional React-side workload during a viewport gesture without using test-only production paths.

Acceptable shape:

- use an existing UI action that causes noncritical React work while pan/zoom is in progress, or
- run the gesture while diagnostics/minimap/edge layers are present in All Settings.

Observed assertions:

- the canvas continues to update viewport position/zoom during the gesture
- frame p95 stays within budget
- no visible retained content blanks

This test should still be framed as user-visible responsiveness, not as an assertion that React did or did not render.

### Baseline Report

Before runtime changes, add an append-only report under `perf/reports/`, for example:

`perf/reports/gpu-flow-pan-zoom-runtime-baseline-20260513.md`

The report must include:

- command used
- browser and viewport
- scenario
- wheel event count and duration
- frame interval p50/p95/max
- long task count and max duration
- canvas/retained-row visual nonblank result
- texture upload count as supporting context
- link to the latest Chrome recording and/or Playwright artifacts
- statement that the new test fails on the current implementation

## Implementation Plan

### 2. Audit Viewport Consumers And Define The Runtime Boundary

Before implementation, audit every current viewport-store transform consumer and
decide whether it belongs in the runtime or on committed observer snapshots.

Required audit shape:

| Consumer | Current trigger | Purpose | Runtime owner or committed snapshot | Delete/replace path |
| --- | --- | --- | --- | --- |
| `flowSurface` viewport subscription | public store transform | canvas frame driver | runtime | replace with runtime RAF frame request |
| DOM island layer | public store transform -> React state | overlay positioning | runtime overlay manager | delete transform-through-React path |
| minimap and controls | public store transform | observation/control UI | committed snapshot | bounded post-frame publication |
| debug and Chrome repro surfaces | public store transform / frame events | diagnostics | sampled committed snapshot | low-volume pan/zoom profile |

The table above is a starting point, not a complete inventory. The actual Step 2
change should include all `useGpuFlowViewportStore`, `viewportStore.subscribe`,
and direct transform-mutation call sites relevant to GPU-flow pan/zoom.

Introduce a concrete runtime boundary for GPU-flow:

- `GpuFlowRuntime` owns live viewport, frame scheduler, input accumulator, overlay registry, and retained maintenance scheduler.
- React-authored `GpuFlowSceneSnapshot` contains nodes, edges, retained surfaces, DOM islands, overlays, hit-test descriptors, and static settings.
- Runtime state and scene snapshots are separate types.

Delete any path that treats React state as the live per-frame viewport owner.

### 3. Replace Wheel/Pan Hot Path

Replace immediate viewport store mutation in wheel/pointer handlers with runtime input aggregation.

Required behavior:

- one pending RAF per active gesture
- many wheel events collapse into one transform update per frame
- the event is claimed and native browser scroll/zoom is prevented when GPU-flow owns the gesture
- viewport updates still honor min/max zoom, pan speed, zoom focal point, and interaction flags
- the runtime emits one post-frame viewport snapshot for observers, not one synchronous store update per input event

Remove the old direct wheel-to-store path rather than keeping both.

### 4. Move Viewport Drawing To Runtime State

Render frames should read the runtime live viewport directly.

The frame order should be:

1. consume pending input
2. update live viewport
3. derive visible window
4. draw retained visuals and vector layers
5. apply overlay transforms
6. schedule post-frame maintenance
7. publish bounded observer snapshot

Viewport-only frames must not require retained source DOM preparation or React scene recomputation.

### 5. Replace DOM Island React Transform Updates

Build the imperative overlay manager and remove React state subscriptions that exist only to follow viewport transforms.

Move these responsibilities into the overlay manager:

- DOM island viewport positioning
- active CodeMirror overlay positioning
- pointer-events gating for offscreen/backing content
- retained native island alignment
- overlay parking/hiding

Keep React responsible for the overlay contents and lifecycle, but not for per-frame transform application.

### 6. Decouple Retained Maintenance From Viewport Frames

First-pass requirement:

- Viewport-only frames draw from already committed visuals.
- Viewport-only frames do not prepare retained source DOM merely because the
  viewport moved.
- Visible missing content and active-editor handoff work may run during active
  pan/zoom only under a strict, measured budget.
- Refinement and prefetch work wait until the interaction is idle.
- Stale committed visuals remain drawable until replacement is ready.

Do not start a broad retained paint scheduler refactor in the first runtime
pass unless the Step 1 baseline and the post-runtime measurement both show
retained maintenance still blocks viewport frames.

Conditional follow-up, if measurements require it:

Replace frame-time retained-content maintenance with an explicit dirty-source
paint scheduler.

Required behavior:

- dirty source elements are registered by content/layout changes
- repeated dirty marks coalesce
- source DOM paint readiness is explicit
- upload/promote happens only after source paint and upload success
- stale committed visuals remain drawable until replacement is ready
- active pan/zoom defers refinement and prefetch

This should preserve the retained text-like row guarantees from `docs/plans/retained-text-like-row-rendering-refactor-plan.md` while decoupling them from viewport transform frames.

### 7. Move Minimap, Controls, And Debug Observation Off The Hot Path

Use the Step 2 audit to migrate every remaining observer.

For each consumer:

- if it needs exact per-frame geometry, move it into the runtime
- if it is UI observation, consume committed snapshots
- if it is debug-only, make it sampled and disabled outside debug capture

The minimap and controls may update at a bounded cadence. They should not block the canvas draw loop.

### 8. Remove Superseded Paths

Delete old paths after the new runtime path is in place:

- direct wheel/pan store mutation as the render-driving mechanism
- React viewport state in DOM island transform layers
- duplicate viewport interaction flags if the runtime owns them
- retained maintenance work that runs only because a viewport frame occurred
- unbounded pan/zoom Chrome repro diagnostics

No compatibility branch should remain.

### 9. Re-Measure And Tighten

Rerun the Step 1 tests and append an after report under `perf/reports/`.

Acceptance targets:

- the new pan/zoom performance tests pass
- p95 frame interval <= 34 ms for the All Settings gesture
- max frame interval <= 50 ms after warmup
- no long task > 50 ms during measured gesture
- no visible retained row/control blanks during pan/zoom
- active editor remains aligned and usable during/after zoom
- texture upload count remains bounded during active interaction
- Chrome repro diagnostic volume is low enough not to dominate the capture

Deletion checks:

- No active wheel, trackpad pan, or pointer pan hot path synchronously mutates
  public viewport state before the runtime RAF consumes pending input.
- `flowSurface` does not subscribe to public viewport store changes solely to
  request viewport frames.
- DOM islands and active editor overlays do not use React state updates solely
  to follow viewport transforms.
- The runtime has one live viewport owner. There is no branch that keeps the old
  direct wheel/pan store path alive beside the runtime path.
- Retained maintenance work is not triggered merely because a viewport-only
  frame occurred.

## Suggested Execution Order

1. Add failing pan/zoom performance tests and baseline report.
2. Audit viewport consumers and classify each as runtime-owned or committed-snapshot observation.
3. Introduce runtime/scene snapshot types and migration target.
4. Move wheel/pan input into runtime aggregation.
5. Draw viewport frames from runtime live viewport.
6. Replace DOM island and active-editor per-frame React transform updates.
7. Prevent viewport-only frames from running retained maintenance; only expand to a dirty-source paint scheduler if measurements still require it.
8. Move minimap/controls/debug observation to committed snapshots.
9. Delete superseded direct-store and React-transform paths.
10. Re-run tests, append after report, and tighten budgets if the measured headroom supports it.

## Initial Design Defaults

Use these defaults for Step 2 unless implementation evidence proves one is
wrong:

- Publish committed viewport snapshots once per RAF after the runtime draw
  during active gestures. Publish a final end-of-gesture snapshot for
  persistence and settling work. Lower the observer cadence only if measurement
  shows observer publication is still material.
- Start with one transformed overlay root per runtime overlay layer plus local
  positioning inside it. Add per-overlay matrix writes only for overlays that
  need independent parking, clipping, pointer-events, or z behavior.
- Keep retained content source DOM in the current hidden-source host for the
  first runtime pass, but give it an explicit paint boundary. Move source DOM
  under a canvas `layoutsubtree` only if the hidden host blocks alignment,
  paint-readiness, or measured frame cadence.
- Add a low-volume Chrome repro pan/zoom profile separate from full retained
  diagnostics. The pan/zoom profile records frame intervals, event timing,
  viewport samples, long tasks, and nonblank checks without serializing broad
  retained descriptors per frame.

Questions that remain after these defaults should be answered with measurement,
not by preserving both old and new runtime paths.
