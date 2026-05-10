# GPU Flow Retained Section Native Scroll Runtime Plan

## Goal

Make retained-content section scrolling in large GPU-flow settings views feel
like native browser scrolling while preserving the retained canvas rendering
model.

The target behavior is:

- Retained sections scroll with platform-native trackpad, wheel, inertial,
  keyboard, and scrollbar semantics.
- The visual scroll path stays smooth even when retained texture pages are
  being refined or are temporarily missing.
- The scroll hot path does not depend on React renders, Zustand churn, or
  synchronous retained scene regeneration.
- Active DOM islands and native controls stay aligned with the retained canvas
  content during scroll.
- Custom retained scrollbars remain visually integrated, but they drive the
  same canonical scroll source as native wheel and keyboard input.

This is intentionally a larger refactor. Do not keep compatibility shims, dual
scroll ownership, old wheel-delta scroll paths, or transitional adapters.

## Evidence From The Latest Recording

Recording: `recording-20260513-174017`

Observed retained-content scroll signals:

- 281 `gpu-flow-retained-content-scroll-flush` events.
- 266 out of 281 flushes applied `deltaOffset.y === totalWheelDeltaY`.
- The remaining 15 were scroll-bound clamps.
- Scroll commit work was cheap: p50 `0.1ms`, p95 `0.3ms`, max `2.2ms`.
- Flush latency was bounded: p50 `4.7ms`, p95 `7.7ms`, max `15.8ms`.
- Each flush contained at most one coalesced wheel event.

The inconsistent speed is already present in the wheel deltas before our scroll
math. Example bursts:

- `2, 5, 66, 215 ... max 764`
- `-3, -7, -119, -312 ... max 1233`
- `1, 8, 20, 24 ... max 347`

During high-velocity bursts, the browser reports wheel-associated frame gaps of
roughly `41-50ms`. GPU-flow frame durations are usually below `9ms`, but retained
texture pages are frequently budget-exhausted and missing while the surface is
moving.

Conclusion: the current retained section scroll path is not slow at the commit
point. The problem is architectural: it manually interprets raw wheel deltas and
requires retained scene/page maintenance to keep up with a scroll gesture. That
exposes OS/browser wheel acceleration directly and makes visual smoothness depend
on canvas frame cadence.

## Current Problem Shape

Retained section scrolling still follows the old manual path:

1. A canvas-level `wheel` handler claims the event.
2. The handler prevents native browser scrolling.
3. The event's `deltaX` and `deltaY` are converted to pixel deltas.
4. The retained surface scroll offset is mutated.
5. A `texture-upload` frame is requested.
6. The frame path regenerates retained scroll windows, prepares texture pages,
   and runs post-submit maintenance.

This differs from the newer pan/zoom runtime architecture. Pan/zoom now has a
runtime-owned live viewport and can draw retained visuals without publishing
every intermediate transform to public state. Retained section scrolling still
uses wheel events as the scroll position source of truth.

Wheel deltas are not a stable scroll model. They are input packets whose size and
cadence are shaped by the operating system, browser, device, acceleration,
momentum, and current event delivery. Mapping them directly to canvas content
offsets is exactly what makes the beginning of a gesture feel slow and the
middle of the gesture suddenly fast.

## Ideas To Borrow From The Example Repos

Use these as architectural guidance, not dependencies to copy wholesale.

- `html-in-canvas-cracks/README.md`
  - Keep real DOM behavior where the browser is already good at it: layout,
    selection, hover, scrolling, and font metrics.
  - Use a fixed viewport stage so visual output is compositor-pinned instead of
    compensating with a per-frame transform after scroll.
  - Treat GPU geometry as a window onto live DOM/scroll state instead of making
    scroll movement a full scene-regeneration problem.

- `three-html-render/src/interactionManager.ts`
  - Register real HTML elements and update one CSS matrix transform per frame.
  - Let the browser dispatch pointer events natively to transformed DOM rather
    than rebuilding a synthetic event model.

- `three-html-render/src/htmlOverlayRenderer.ts`
  - Keep overlay positioning imperative and write-only in the animation loop.
  - Cache viewport-sized transform inputs and avoid framework state updates in
    the hot path.

- `html-in-canvas-official/Examples/pie-chart.html`
  - Use the canvas paint boundary to draw DOM into canvas and update the source
    element transform as part of the same paint operation.
  - Focus and accessibility remain attached to real DOM nodes.

- `html-in-canvas-room/extension/entrypoints/content.ts`
  - Use CSS transforms to route native events to the real DOM while the rendered
    texture remains the visual output.
  - The example still manually adds `deltaY` to `scrollTop`; Setta should go one
    step further and let a real scroll container receive browser scroll input
    directly.

The common principle: the browser should own browser-native behaviors, and the
GPU runtime should sample those behaviors for rendering. Do not reimplement
scroll physics from wheel packets unless there is no native scroll source.

## Target Architecture

### 1. Native Scroll Source Per Retained Surface

Each scrollable retained content surface gets a real DOM scroll source:

- an overlay/proxy element aligned with the retained surface viewport
- `overflow: auto`
- a spacer sized to the retained content dimensions
- hidden or custom-styled native scrollbars depending on the visual design
- `scrollTop` and `scrollLeft` as canonical live scroll position

Wheel, trackpad, inertial, keyboard, page, home/end, accessibility, and native
scrollbar behaviors flow through the browser's scroll implementation.

The GPU-flow canvas no longer prevents normal wheel scrolling for retained
surfaces merely to interpret `deltaY`. The canvas/runtime only claims wheel
events for gestures that are not native retained-content scrolling, such as
viewport pan/zoom when configured.

### 2. Runtime-Owned Retained Scroll State

Introduce a retained scroll runtime beside the viewport runtime.

The retained scroll runtime owns:

- registered retained scroll surfaces
- DOM scroll source elements
- current live `scrollTop` and `scrollLeft` per surface
- dirty/changed surface ids
- RAF scheduling for visual scroll frames
- active scroll gesture state and idle detection
- bounded public snapshot publication

React/Zustand may observe committed scroll snapshots, but they are not the live
scroll source during a gesture.

### 3. GPU Visual Scroll Before Retained Maintenance

On a scroll source `scroll` event:

1. Mark the surface's live scroll offset changed.
2. Request a runtime frame.
3. In that frame, draw already-committed retained pages at the new scroll
   transform.
4. Update imperative DOM island/native control overlays.
5. Schedule retained texture/page maintenance after the visual frame under a
   strict budget.

Visible retained content may use stale committed pages while sharper pages are
prepared. Missing or refinement work must not block the scroll transform.

### 4. Scroll Offset In The Scene Model

Stop treating scroll offset changes as full React-authored scene edits.

The React-authored `GpuFlowScene` should describe:

- retained surface identity
- viewport rect
- content size
- row/source metadata
- hit-test ownership
- scroll capability

The live scroll offset should be runtime state. Scene generation should consume
a sampled scroll offset only when building retained page windows or hit-test
metadata that genuinely depends on the scrolled row window.

### 5. Native Control And DOM Island Alignment

Move retained DOM island positioning to the same imperative overlay strategy as
the viewport runtime:

- register each overlay with surface id, retained local rect, z/indexing, and
  interaction policy
- compute screen rect from surface viewport, live retained scroll offset, and
  viewport transform
- write `transform`, `display`, and `pointer-events` in the runtime frame loop
- keep active editors mounted and aligned during scroll
- park or hide inactive overlays outside the visible surface window

This should replace the retained scroll path that rebuilds DOM island rects as
part of `applyGpuRetainedContentScrollOffsetToScene`.

### 6. Hit Testing And Custom Scrollbars

Hit testing should use the sampled live scroll offset for retained surfaces.

Custom retained scrollbars remain canvas-rendered controls, but they no longer
own an independent scroll calculation. They call the retained scroll runtime to
set the native scroll source's `scrollTop` or `scrollLeft`. The resulting native
scroll event then follows the same path as wheel, keyboard, and touchpad input.

### 7. Retained Texture Scheduler

The retained texture page manager needs a scroll-aware scheduling policy:

- scroll frames draw first
- visible missing pages get a small high-priority budget
- ahead-of-scroll-direction prefetch gets the next budget
- refinement and offscreen work wait until idle
- stale pages stay drawable until replacement pages are ready
- budget exhaustion must never block scroll offset application

This is a scheduling contract, not a wheel-delta tuning exercise.

### 8. Public Snapshot Publication

Publish retained scroll snapshots to public state only for:

- persistence
- debug panels
- minimap or other low-frequency observers
- end-of-gesture settlement
- programmatic API reads

Consumers that need exact per-frame geometry must join the runtime/overlay path.

## Non-Goals

- Do not tune wheel delta multipliers as the primary fix.
- Do not add smoothing constants to hide platform acceleration.
- Do not keep the old manual wheel-delta retained scroll path.
- Do not keep dual scroll ownership between native DOM and retained scene state.
- Do not add backward compatibility shims, legacy aliases, or transitional
  adapters.
- Do not make implementation details such as store mutation counts or queue
  names into acceptance criteria.
- Do not make texture upload budget tuning the primary fix.

## Step 1: Failing Behavior Tests And Baseline

This step is mandatory and should fail against the current implementation.

Add a Playwright E2E spec, for example:

`frontend/tests/e2e/settings/settings-retained-section-scroll-performance.spec.ts`

Scenario:

1. Navigate to `/settings`.
2. Switch to All Settings.
3. Wait for a retained-content-heavy settings scene.
4. Locate the GPU-flow canvas and a scrollable retained content surface.
5. Install a narrow performance probe that records:
   - animation frame timestamps
   - long tasks
   - wheel/event timing if available
   - retained section visible offset samples
   - canvas nonblank pixel samples
6. Run a short warmup scroll gesture.
7. Run deterministic dense trackpad-like scroll bursts:
   - downward small-to-large burst matching the observed acceleration shape
   - upward small-to-large burst
   - short low-delta burst near the beginning of a surface
   - burst that reaches a scroll boundary
8. Capture before/during/after screenshots or canvas pixel samples.

Observed behavior assertions:

- The retained section visibly scrolls during the measured burst.
- The browser page itself does not scroll while the retained section owns the
  gesture.
- Canvas output remains nonblank before, during, and after the burst.
- Scroll movement is monotonic except at documented bounds.
- p95 animation frame interval during measured scroll is `<= 34ms`.
- max animation frame interval after warmup is `<= 50ms`.
- no long task `> 50ms` occurs during the measured burst.
- scroll offset samples do not show long stalls followed by a large catch-up
  jump; specifically, no measured visual offset delta should exceed a bounded
  multiple of the median nonzero delta unless the raw injected input delta also
  does.

Failure output must include:

- event count and event spacing used by the driver
- frame interval distribution
- long task summary
- scroll offset sample timeline
- whether native page scroll leaked
- before/during/after nonblank pixel summaries
- visible surface id and content/viewport dimensions

The test must avoid implementation assertions:

- no assertions about Zustand updates
- no assertions about internal runtime queue names
- no assertions about retained maintenance item kinds
- no assertions about React render counts

Add an append-only baseline report under `perf/reports/` with the latest Chrome
recording numbers and the failing local test output.

## Step 2: Introduce Native Scroll Source Registration

Create a retained scroll runtime module responsible for registering native
scroll source elements for retained surfaces.

The registration contract should include:

- `surfaceId`
- viewport rect
- content width and height
- current enabled/disabled state
- callbacks for live scroll changes
- imperative accessors for `setScrollOffset`, `getScrollOffset`, and `destroy`

The source element should be managed by the runtime, not by per-row React state.
It should be positioned and clipped like an overlay, but it should not render
the retained content itself.

## Step 3: Replace Wheel Delta Ownership

Delete the retained canvas wheel-delta scroll owner.

Wheel events over retained scrollable surfaces should reach the native scroll
source. If event forwarding is required because the source is transformed over a
canvas, use the CSS transform/native hit-testing approach from the example repos
rather than synthetic wheel dispatch.

Viewport pan/zoom ownership remains separate. Ctrl/meta wheel zoom and configured
canvas pan gestures should still be claimed by the viewport runtime.

## Step 4: Render From Live Scroll State

Modify the GPU-flow retained frame input so draw code samples live scroll offsets
from the retained scroll runtime.

Scroll-only frames should:

- update visible retained transforms
- draw from committed pages
- update overlay positions
- avoid full React scene regeneration
- avoid forcing retained texture maintenance before presenting a frame

## Step 5: Move Retained DOM Islands To Runtime Overlay Alignment

Replace retained scroll rect regeneration for DOM islands with runtime overlay
alignment.

The overlay manager should compute element transforms from:

- viewport transform
- retained surface viewport rect
- live retained scroll offset
- retained local control rect

This mirrors the example repos' single-transform-per-element approach.

## Step 6: Rework Scrollbar And Keyboard Paths

Retained scrollbar track clicks, thumb drags, keyboard scroll commands, and
programmatic reveal operations should set the native scroll source position.

They should not compute and commit a parallel retained scroll offset map.

## Step 7: Scroll-Aware Texture Page Scheduling

Rework retained page preparation so scroll motion is visually immediate and page
maintenance is opportunistic.

Add measurements for:

- stale page draw count
- visible missing page count
- ahead-of-scroll prefetch hit rate
- page maintenance budget exhaustion during active scroll
- time from scroll offset change to first nonblank visual frame

## Step 8: Remove Old Retained Scroll State Paths

Delete code that exists only for the old manual retained scroll model:

- wheel delta retained scroll offset resolution
- retained scene mutation as the scroll hot path
- DOM island rect mutation during scroll commits
- duplicate scroll offset maps where native source state is authoritative

Keep only deterministic helpers that are still useful for programmatic scroll
commands or tests, and make them operate through the native scroll runtime.

## Step 9: Verification

Run focused verification after each major step:

- retained scroll unit tests for bounds, programmatic scroll, and scrollbar
  commands
- Playwright retained section scroll performance test
- All Settings visual nonblank checks during scroll
- Chrome repro recording for one manual scroll session

The final report should compare before/after:

- frame interval p50/p95/max
- long tasks during scroll
- visual scroll offset timeline
- missing/stale retained page counts
- page leakage/native scroll leakage
- input-to-visual latency
