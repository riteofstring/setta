# GPU Flow Canvas-First Committed Surface Runtime Plan

## Goal

Fix the current GPU Flow regressions by completing the committed surface idea
without moving the project back toward an XYFlow-shaped DOM runtime.

The target architecture is canvas-first:

- retained GPU pages own passive parameter content, row structure, labels,
  dividers, scrollbars, passive value ink, and passive visual state;
- browser DOM is mounted visibly only for active or browser-semantic surfaces
  that need native focus, caret, selection, IME, accessibility, file pickers,
  native select/popover behavior, or equivalent platform behavior;
- pan and zoom are live camera/projection motion over already committed content;
- retained section scroll is a per-surface runtime motion sample, not a global
  viewport or scene mutation;
- committed surface frames are published outside React's render hot path and
  only when content identity changes;
- no cold blank placeholder may replace a previously coherent visible frame.

The current `GpuFlowCommittedSurfaceFrame` direction is not wrong in principle:
GPU Flow does need a single visible publication boundary. The current
implementation is too broad and too React/DOM-heavy. It treats too many passive
controls as visible DOM actors, ties scroll and activation to global committed
frame churn, and uses synchronous React publication for work that should stay
inside the renderer/runtime.

This plan keeps the coherent commit boundary, but changes what the boundary
publishes and how it is applied.

## Core Architectural Rule

```text
Committed content answers: what is visible and coherent?
Live projection answers: where does already committed content appear now?
React answers: what semantic UI needs declarative rendering?
React does not answer: where should every actor be on every interaction frame?
```

This rule is the main guardrail for the refactor. Any design that routes pan,
zoom, retained section scroll, retained repair, or active projection through
broad React publication is out of scope, even if the visible graph still uses
WebGPU.

## Conceptual Runtime Boundaries

The existing code may keep names such as `GpuFlowCommittedSurfaceFrame` during
implementation, but the design must separate these concepts:

```text
CommittedContentFrame
  Stable visible content identity and readiness.
  Answers what coherent content can be shown.

LiveProjectionSample
  Viewport transform and per-surface scroll offsets.
  Answers where already committed content appears now.

ProjectionFrame
  Imperative application of live samples to GPU actors and the small set of
  live DOM actors.
  Answers what gets projected for this interaction tick.

ReactSemanticSnapshot
  Rare, throttled semantic state for declarative UI, diagnostics, and debug
  consumers.
  Does not publish interaction frames.
```

The broad current meaning of "committed surface frame" is part of the problem:
it allowed motion, scroll samples, actor generations, DOM publication, and
React state to collapse into one synchronous path. The refactor should make the
type and module boundaries enforce the conceptual split above, even if public
renames happen incrementally.

## What The Latest Recording Shows

The latest Chrome recording is enough to identify the failure class.

Observed facts:

- After switching to All Settings, the visible retained surface count grows
  from 5 to 45 and projected DOM controls grow from 33 to about 260.
- `gpu-flow-frame` average duration grows from about 3.4 ms before All Settings
  to about 14.6 ms after All Settings, with 267 of 599 frames over 16 ms.
- The viewport runtime itself remains cheap, around 0.2 ms average. The
  regression is not raw camera math. It is full frame publication and
  reconciliation happening during interactions.
- Section wheel scrolling emits `gpu-flow-retained-content-scroll-flush` with
  `requestFrameReason: "viewport"` for every flush. The scroll resolve and
  commit work is nearly free, but it drives the full frame path and records
  flush latency up to about 34 ms.
- Input activation is followed by `publish-cold-placeholder` events. The
  visible canvas can blank or switch generations when a previous coherent frame
  should have been held until the active editor is ready.
- `useGpuFlowCommittedSurfaceFrameState()` publishes committed frames through
  `flushSync`, and the committed-frame render signature includes actor
  generations and retained scroll revision. That makes high-frequency runtime
  samples capable of forcing synchronous React work.

The current failure is not that GPU Flow has a committed surface boundary. The
failure is that the boundary is being used as a broad React/DOM publication
mechanism for hot-path motion and passive content.

## Regression Policy

This refactor is not complete unless both regression defenses are in place:

1. realistic fail-first tests that assert observed behavior; and
2. the full GPU Flow-related test suite run after the implementation.

After Phase 0 baseline capture, the observed-behavior tests must be the first
implementation work. They should fail on the current implementation before any
runtime refactor begins. A test that only asserts actor generation ids, branch
names, counters, or scheduler calls is not sufficient for this plan.

Valid pass/fail signals include:

- frame cadence, rAF gaps, long-task windows, and visible stuck intervals;
- screenshot or pixel evidence that content stayed visible and nonblank;
- viewport movement, section scroll offsets, and scroll owner behavior;
- focus, caret, active element, and editable control behavior;
- visible DOM actor scale only as a user-impacting resource guardrail.

Internal diagnostics are useful, but only as attached failure evidence. They
must not become the main oracle for the regression tests.

Running only the new specs is not enough. After the implementation, run the
complete GPU Flow-related verification set: all affected `frontend/src/gpuFlow`
Vitest coverage, project GPU surface adapter and retained-control Vitest
coverage, all existing GPU Flow and Settings retained E2E specs, and the
repo-level quality check unless the developer explicitly narrows scope.

If the suite is too broad for one command, split it into documented shards.
Do not skip broadly. Any failure classified as unrelated must include the
failing command, the failure summary, and the evidence for why it is unrelated
to this refactor.

Internal diagnostics cannot be the success condition. They are supporting
evidence only. The release signal must come from observed behavior: frame
cadence, pixels, focus/caret state, scroll ownership, visual continuity, and
bounded DOM scale.

## Performance Target

The target for pan, zoom, and retained section scroll is 120 Hz-class
interaction in a large complex scene comparable to the Settings project's All
Settings page.

Use a realistic scene, not a small synthetic canvas:

- the Settings project All Settings page when available; or
- a production-shaped fixture with similar retained surface count, row count,
  text-like control count, section nesting, active editor candidates, and
  retained page coverage pressure.

The primary target is an 8.33 ms frame interval during active interaction. The
performance tests should separately cover:

- pan-only wheel or pointer drag motion;
- zoom-only wheel or trackpad pinch-equivalent motion;
- mixed pan/zoom wheel gestures;
- retained section scrolling inside a large section.

Target budgets:

- p95 active-interaction frame gap at or below 8.33 ms on a runner that can
  observe 120 Hz rAF cadence;
- p99 active-interaction frame gap close to 8.33 ms and below 12 ms unless
  measured hardware/browser limits prove that is not achievable;
- no active-interaction visual gap above 16.67 ms after warmup;
- no long task during active pan, zoom, or retained section scroll;
- no visible blanking, texture loss, placeholder flash, or section-scroll
  drift while meeting the cadence budget.

If true 120 fps is impossible in the measured environment, do not silently lower
the bar. Record the limiting factor, the best measured stable budget, and why it
is a platform ceiling rather than an implementation regression. The fallback
budget should still be in the 120 Hz range where possible; a 60 fps target is
not acceptable unless the measurement environment itself is capped at 60 Hz and
trace evidence shows the interaction work would fit inside an 8.33 ms budget.

CI may use a 60 Hz browser as a regression guard, but that does not replace the
120 Hz-class performance run. On a 60 Hz runner, assert that active-interaction
main-thread and compositor work remain comfortably below the 8.33 ms budget and
that there are no dropped 60 Hz frames.

## Direction From Architecture Iterations

`docs/notes/gpu-flow-architecture-iterations.md` shows a consistent direction:

1. Move away from React Flow / XYFlow DOM ownership.
2. Keep viewport motion as camera/projection work.
3. Move geometry, hit testing, scroll, and section layout into GPU Flow scene
   and runtime owners.
4. Convert parameter rows from DOM subtrees into descriptor-owned retained
   surfaces.
5. Replace whole-surface DOM overlays with retained texture pages and coverage
   proof.
6. Move animation, hover, scrollbar, and active browser behavior into separate
   explicit lifecycles.
7. Make retained publication transactional.
8. Generalize publication to surface actors.
9. Add a committed visible frame so independently sampled layers cannot drift.

This plan is progress along that path. It is not a repeat of work already done.

Already done:

- GPU Flow owns scene geometry, viewport math, retained page coverage, and
  section scroll runtime state.
- Retained content is page-rasterized and protected by coverage proof.
- Surface actors and display transactions exist.
- A committed surface frame type exists.
- A wheel gesture ownership arbiter exists.
- A DOM control plane exists.

Not done:

- Passive text-like controls are not canvas-first; hundreds of visible DOM
  controls can participate in interaction frames.
- Committed surface publication is not an imperative renderer/runtime commit;
  it goes through synchronous React state.
- Committed frame identity is not split into content identity and live
  projection samples.
- Section scroll is not a per-surface projection path; it requests full
  viewport frames.
- Activation can discard previous retained display state and publish cold
  placeholders.
- DOM actor mounting is not constrained by a semantic DOM budget.
- The tests do not yet fail on the exact observed pan/zoom, section scroll, and
  input flicker regressions.

## Ideas To Borrow From Example Repos

Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as
design references, not as packages to copy.

From `html-in-canvas-official/README.md`:

- Treat layout, hit testing, focus, accessibility, and paint readiness as
  browser-owned contracts.
- `drawElementImage()` returns a transform because DOM hit-test location must
  be synchronized with the drawn location.
- Paint readiness is correctness. Calling capture/draw before a paintable
  snapshot should fail loudly or wait. It should not publish a blank success.
- CSS transforms used for projection should not trigger texture repaint work by
  themselves.

From `three-html-render/src/interactionManager.ts` and
`src/htmlOverlayRenderer.ts`:

- Use an imperative projection manager for live DOM surfaces.
- Apply one transform per registered live element from a cached viewport/camera
  matrix.
- Register only the DOM surfaces that must be live. Do not use the framework
  renderer as the per-frame projection engine.

From `three-html-render/src/htmlTexture.ts` and `src/htmlInCanvasPolyfill.ts`:

- Dirty state, paint events, resize observation, and requested paint should be
  explicit scheduler inputs.
- Missing snapshots are invalid states, not blank frames.
- Dynamic form state must be synchronized deliberately if a snapshot path is
  used. Active editing should avoid snapshotting as the correctness path.

From `html-in-canvas-cracks/src/main.js`:

- Keep CSS pixels as the primary layout coordinate system.
- Make scroll and resize terms explicit in projection and sampling math so
  content does not drift.
- Keep resource identity stable across resize and runtime updates. Recreate
  resources only when the underlying allocation constraints actually change.
- Add debug views that compare source DOM, captured/rendered content, and final
  composite.

From `compiz-web/src/transitions/TransitionEngine.ts`:

- HTML texture capture is appropriate for page transitions and effects after
  browser paint readiness.
- Full DOM texture upload every frame is not appropriate for Setta's large
  retained project canvas.

From `html-in-canvas-room/extension/entrypoints/frame-overlay.content.ts`:

- The useful idea is continuity: keep the last coherent visual output visible
  while the next one becomes ready.
- Do not copy its implementation shape. Setta should hold the previous
  committed surface frame, not add a separate image overlay or compatibility
  layer.

Do not borrow:

- full-page texture capture every frame;
- broad DOM overlays as the primary visible representation;
- broad hidden DOM capture trees that are invalidated during interaction;
- fallback DOM application modes;
- silent compatibility paths.

## Target Architecture

### Ownership Stack

```text
Project owners
  canonical values, section structure, persistence, endpoint contracts

GpuFlowScene and layout store
  renderable geometry, source descriptors, hit records, clip chains

Runtime samples
  viewport transform, per-surface scroll offsets, hover, active editor,
  wheel gesture owner, transient interaction flags

Committed content frame
  stable visible content identity:
    retained page generations
    passive text/value ink generations
    GPU-native visuals
    active DOM island/control generations
    hit generation
    clip-chain generation
    z-order
    completeness/readiness

Projection runtime
  imperative application of current viewport and per-surface scroll samples
  to already committed GPU and live DOM actors

Maintenance schedulers
  retained raster/upload work, DOM paint readiness, LOD refinement, resource
  retirement, prefetch
```

The committed content frame owns "what content is visible." The projection
runtime owns "where already committed content appears right now."

### Content Identity Vs Motion Samples

Split current committed-frame identity into at least these categories:

- content generation: scene revision, value/style generation, retained page
  content versions, active editor identity, browser-semantic actor identity;
- projection generation: clip chain, z-order, layout rects, source windows;
- live motion sample: viewport transform and per-surface scroll offsets;
- readiness generation: retained page coverage, DOM paint readiness, active
  editor mount readiness.

Only content/projection/readiness identity can publish a new committed content
frame. Live motion samples update projection state imperatively.

Forbidden:

```text
wheel scroll -> global retained scroll revision -> all DOM-control generations
             -> flushSync committed frame -> React remount/reconcile
```

Required:

```text
wheel scroll -> surface scroll sample -> update one surface projection
             -> draw/projection frame over committed content
             -> schedule retained page repair/refinement if needed
```

### HTML-In-Canvas And DOM Categories

HTML-in-canvas remains useful as browser paint, capture, layout, and readiness
infrastructure. It must not become the broad visible passive-control runtime or
a hidden DOM graph that is dirtied during pan, zoom, or retained section scroll.

Do not overcorrect by canvasifying every browser-owned source. Section bodies,
overlay sources, and browser-owned handoff surfaces can continue to use
HTML-in-canvas source/capture paths where appropriate. The problem is broad
passive text-like parameter controls, not every DOM source.

Target classification:

```text
DOM section sources
  Retained as source/capture surfaces where browser rendering is appropriate.

Passive parameter rows
  Canvas/retained row structure, labels, passive value ink, and visual state.

Passive text-like values
  Canvas/retained value actors by default.

Active editors/native controls
  Real DOM, small count, readiness-gated.
```

Track these DOM categories separately:

```text
Visible live active DOM
  Active editors, native pickers, native browser-semantic controls.
  Small constant. Projected live only while active or semantically required.

HTML-in-canvas source DOM
  layoutsubtree children used as source/capture material.
  Not the visible passive text-control runtime.

Capture-only passive DOM, if chosen
  Pooled, bounded, readiness-gated, and excluded from live projection.
  Not one projected actor or live editor tree per passive visible row.

Accessibility/semantic DOM, if chosen
  Bounded or virtualized semantic exposure.
  Must not become a full hidden XYFlow-like graph.
```

The DOM budget must report visible active DOM actors, projected DOM hosts,
layoutsubtree source DOM, capture-only passive DOM, and semantic/offscreen DOM
separately. It must also report layout/paint time, snapshot queue size, and the
number of source/capture/semantic DOM nodes touched or invalidated during active
pan, zoom, and retained section scroll.

Passing the visible DOM scale guardrail is not enough if the same cost moves to
hidden source DOM or capture DOM.

### Canvas-First Passive Text-Like Controls

Passive text-like values must stop requiring a visible DOM actor for every
control in large scenes.

The new contract:

- passive value display is a retained/canvas actor;
- active value editing is a browser DOM actor;
- the active actor replaces only the active control slot after browser paint
  readiness is satisfied;
- the previous passive retained actor remains visible until the active actor is
  ready;
- active detach restores a retained passive value actor after the new passive
  content generation is ready.

Default strategy:

- ordinary single-line values should use GPU/canvas text or retained
  display-list rendering;
- rich multiline/code-like previews may use retained browser snapshots only
  when pooled, cached, readiness-gated, and excluded from live projection;
- one passive CodeMirror DOM view per visible row is never allowed.

Implementation options may include GPU text/display-list rendering, retained
browser snapshotting for passive value ink, or another canvas-first path. Pick
the least broad solution that meets visual parity and performance. The key rule
is that passive controls are not hundreds of React-owned visible CodeMirror DOM
nodes, and are not hundreds of hidden live CodeMirror DOM nodes either.

Passive snapshot anti-regression rule:

- a passive browser snapshot source must be capture-only passive content that
  is pooled/bounded, readiness-gated, and cached;
- it must not mount one live CodeMirror or React DOM tree per passive visible
  row;
- it must not participate in per-frame projection;
- it must not be touched, laid out, painted, captured, or uploaded for pan,
  zoom, or retained section scroll cadence;
- a missing snapshot holds the previous passive retained actor and never
  publishes blank content;
- active editing remains real DOM and does not use snapshotting as the
  correctness path.

Active CodeMirror may be real DOM. Passive CodeMirror-like display may reuse
CodeMirror parsing or highlighting data, or a bounded capture renderer, but it
must not mount a live editor per passive row.

Native browser DOM remains required for:

- active CodeMirror/text input editing;
- selection/caret/IME;
- file/drop/picker controls;
- native popovers or controls that cannot be emulated correctly;
- accessibility/focus surfaces that are actively reachable.

### DOM Actor Runtime

Replace the broad React DOM-control plane with an imperative DOM actor runtime.

The runtime should:

- maintain a small pool of live DOM hosts keyed by actor id;
- mount React only for active/browser-semantic actor content, not every passive
  retained row value;
- apply projection transforms imperatively from the current viewport and
  per-surface scroll sample;
- update pointer-events from committed visibility and interaction ownership;
- preserve focus during projection changes;
- block detach/replacement until the replacement actor is paint-ready;
- expose diagnostics for active actor count, pooled host count, paint-ready
  wait time, and projection duration.

React may still render active editor content into a host, but React must not be
the mechanism that publishes every interaction frame.

### Retained Surface Runtime

Retained pages remain the passive large-scene workhorse.

Changes needed:

- retain previous coherent page coverage whenever a desired frame is not ready;
- never publish a cold placeholder over a previous coherent frame;
- make cold placeholders valid only for first-ever surfaces with no previous
  visible content, and only when tests prove no user-visible blanking;
- treat active editor attach/detach as readiness-gated transactions;
- keep per-surface scroll revisions instead of a global retained scroll
  revision that dirties unrelated actors;
- allow compatible retained pages to project with live scroll samples while
  exact pages are repaired in maintenance.

### Section Scroll Runtime

Section scroll needs its own frame path.

Required behavior:

- wheel bursts keep a single owner for the burst;
- scroll deltas coalesce per retained surface;
- commit only the target surface scroll sample;
- update projected retained content, scrollbars, hit-test sample, and any live
  active DOM actor for that surface;
- schedule retained page repair/refinement separately;
- avoid React state, global viewport frames, and global committed-frame
  publication during the burst.

### Pan And Zoom Runtime

Pan and zoom should not publish committed content frames when retained coverage
is already compatible.

Required behavior:

- consume wheel/pan input in `viewportRuntime`;
- project committed GPU actors and live DOM actors from the live viewport;
- publish observer/store snapshots at coarse intervals or gesture end;
- defer retained resolution changes until gesture idle;
- preserve z-order, hit test, and clip-chain coherence from the committed
  content frame while motion is live.

### Activation Runtime

Input activation must be a readiness-gated replacement, not a scene reset.

Required behavior:

1. Capture the activation target and current committed passive frame.
2. Create the active editor DOM actor off the visible critical path.
3. Wait for browser mount and paint readiness.
4. Atomically publish the active actor for that one control slot.
5. Keep surrounding retained content from the previous coherent frame until
   replacement content is ready.
6. On blur, keep the active actor visible until the passive retained value
   generation that includes the final value is ready.

No `publish-cold-placeholder` path is allowed during activation when a previous
coherent frame exists.

## Delivery Milestones

The milestones below are the shippable boundaries. Individual phases are
implementation slices only; they should not be treated as stable halfway
architectures when their milestone has not passed.

The first meaningful architecture checkpoint is Milestone B plus the first
representative slice of Milestone C/D. Do not spend weeks optimizing around the
current passive DOM-control plane before proving at least one single-line value
and one multiline/code-like value end to end:

```text
passive retained/canvas display
click activation
paint-ready active DOM editor
focus/caret/IME correctness
wheel ownership
blur
passive retained restoration
no blanking
bounded visible/source/capture/semantic DOM budgets
```

That first slice does not need to migrate every control, but it must prove the
hardest seam early enough to prevent the runtime publication cut from becoming
an optimization around the wrong passive-control model.

### Milestone A: Prove And Protect The Failures

Complete Phase 0 and Phase 1.

Required outcome:

- baseline measurements and reproduction scope are recorded under `perf/`;
- fail-first observed-behavior tests fail for pan/zoom cadence, retained
  section scroll cadence/ownership, activation flicker, passive DOM scale, and
  source/capture DOM interaction cost;
- the All Settings-scale performance target is represented by tests or
  measurement guardrails.

### Milestone B: Runtime Publication Cut

Complete Phases 2, 3, 6, 7, and 8 as one coupled architectural cut.

This milestone is not complete until all of these are true:

- committed surface publication is renderer/runtime-owned and no longer uses
  React/`flushSync` for active pan, zoom, retained section scroll, or retained
  page repair;
- content identity, projection identity, readiness identity, and live motion
  samples are split;
- retained section scroll is a per-surface projection path, not a global
  viewport or committed-content publication;
- pan/zoom projects already committed content without broad DOM actor churn;
- previous coherent content is held through activation, retained repair, and
  compatible motion until replacement readiness is satisfied.

Do not call Phase 2 or Phase 3 successful if section scroll can still route
through global viewport work or if a previous coherent frame can still be
replaced by a cold placeholder. Those are the same publication-model failure.

Milestone B is necessary but not sufficient as the first architecture
checkpoint. It must be followed immediately by the first Milestone C/D
text-like slice described above, before broad rollout or extended performance
tuning on the old passive DOM-control plane.

### Milestone C: Passive DOM Removal

Complete Phase 4B. Phase 4A is only an internal stepping stone and is not a
stable milestone.

Required outcome:

- passive text-like value display is canvas-first and no longer requires broad
  visible DOM-control actors;
- the visible, source, capture, and semantic DOM budget guardrails pass in an
  All Settings-scale scene;
- active editing remains browser DOM and is readiness-gated;
- the first migrated text-like family proves passive retained display, active
  DOM handoff, readiness-gated swap both ways, and accessibility/semantics
  together before broad rollout;
- no compatibility fallback keeps the broad passive DOM-control plane alive.

### Milestone D: Active Semantics And Readiness

Complete Phase 5 and the passive-value accessibility/semantics decision from
Phase 4B. For the first migrated text-like family, Milestone C and Milestone D
should land together: passive retained display and active DOM handoff are one
end-to-end behavior.

Required outcome:

- activation is an explicit paint-ready transaction;
- focus, caret, selection, IME, wheel ownership, and active element state are
  preserved;
- passive values have an explicit accessibility/semantics model that does not
  recreate a per-frame projected DOM graph.

### Milestone E: Diagnostics And Full Verification

Complete Phase 9 and Phase 10.

Required outcome:

- diagnostics explain performance and readiness failures without becoming the
  test oracle;
- full GPU Flow-related verification runs;
- before/after performance and visual-continuity evidence is recorded.

## Phase 0: Baseline And Scope Lock

Before adding or changing implementation code, lock the reproduction scope.

Record:

- the exact Chrome recording or reproduction path being used;
- the Settings project or production-shaped fixture used for All Settings-scale
  scenes;
- browser refresh-rate lane and rAF baseline;
- current p95/p99 frame gaps for pan-only, zoom-only, mixed pan/zoom, and
  retained section scroll;
- current long-task evidence during those interactions;
- current visible active DOM actors and projected DOM host counts with no
  active control;
- current layoutsubtree source DOM, capture-only passive DOM, and
  semantic/offscreen DOM counts;
- current layout/paint time, snapshot queue size, and source/capture/semantic
  DOM nodes touched or invalidated during pan, zoom, and retained section
  scroll;
- current input activation screenshot or pixel evidence showing whether blanking
  occurs;
- the command set used to collect the baseline.

Append baseline measurements under `perf/`. Do not replace older reports.

Scope lock:

- Phase 0 and Phase 1 may add or strengthen tests, diagnostics, fixtures, and
  measurement helpers.
- They must not refactor committed-frame publication, passive control rendering,
  active editor lifecycle, or section scroll runtime behavior.
- If the current implementation no longer reproduces a planned fail-first
  assertion, update the plan before implementation. Do not create a test that
  passes current behavior and call it fail-first.

## Phase 1: Add Fail-First Observed-Behavior Tests

This is the first implementation step and the first gate. These tests must be
written before the refactor, run against the current implementation, and shown
to fail for the observed pan/zoom, retained section scroll, and input
activation flicker regressions.

The tests should assert user-observable behavior, not compositor branch names,
actor generation ids, or upload counts. Internal diagnostics can be attached to
failure output, but they are not the primary pass/fail condition.

Do not start Phase 2 until these tests fail for the current implementation. Do
not weaken the tests to match implementation behavior. The tests should encode
the behavior a user sees: smooth motion, visible content, correct scroll owner,
focus/caret correctness, bounded browser DOM scale, and bounded source/capture
DOM interaction cost.

Phase gate:

- at least one observed-behavior test must fail for each targeted failure class:
  pan/zoom cadence, retained section scroll cadence/ownership, activation
  flicker, passive DOM scale, and source/capture DOM interaction cost;
- the failing command and failure evidence must be recorded in implementation
  notes;
- implementation refactors are blocked until this gate is satisfied.

The heavy 120 Hz-class measurements are required, but they do not need to be
the first red tests written. Start with deterministic observed-behavior tests
that prove the current failure, then add the full performance guardrails before
the refactor is called complete.

### Test A: Large-Scene Pan/Zoom Frame Cadence

Scenario:

1. Open Settings in GPU Flow.
2. Switch to All Settings.
3. Perform the same pan and zoom wheel gestures used in the latest recording.
4. Capture frame gaps, rAF cadence, visual viewport movement, and screenshots
   at the beginning/end of the gesture.

Observed assertions:

- viewport visibly moves for the gesture with no stuck interval longer than the
  120 Hz-class budget;
- pan-only, zoom-only, and mixed pan/zoom gestures satisfy the Performance
  Target budgets;
- p95 active-interaction frame gap is at or below 8.33 ms on a 120 Hz-capable
  runner;
- no active-interaction visual gap exceeds 16.67 ms after warmup;
- no long task occurs during active pan or zoom;
- screenshots show nonblank canvas content before, during, and after the
  gesture.

Diagnostics to attach only on failure:

- `gpu-flow-frame` duration summaries;
- `gpu-flow-viewport-runtime-frame` summaries;
- DOM actor count;
- retained surface count;
- committed frame publish count.

### Test B: Retained Section Scroll Frame Cadence

Scenario:

1. Open Settings in All Settings mode.
2. Scroll a large retained section such as section sizing policy.
3. Use a wheel burst that includes both large deltas and inertial tail deltas.

Observed assertions:

- section content scrolls smoothly and ends at the expected visual offset;
- surrounding viewport does not pan or zoom;
- active-interaction frame gaps satisfy the Performance Target budgets;
- p95 active-interaction frame gap is at or below 8.33 ms on a 120 Hz-capable
  runner;
- no active-interaction visual gap exceeds 16.67 ms after warmup;
- no long task occurs during active retained section scroll;
- no blank band or transparent canvas patch appears inside the scrolled
  section;
- scrollbars and retained row content remain visually aligned.

Diagnostics to attach only on failure:

- scroll flush latency summary;
- target surface id;
- frame reasons;
- retained page coverage summary.

### Test C: Input Activation No Flicker

Scenario:

1. Open Settings.
2. Click several visible text-like inputs in sequence.
3. Repeat after switching to All Settings.
4. Record a short screenshot sequence around each click.

Observed assertions:

- the row shell, label, section background, and neighboring values remain
  visible across activation;
- the active editor appears in the clicked slot within a tight frame budget;
- there is no blank canvas placeholder under or around the clicked input;
- the text caret/focus lands in the clicked editor.

Diagnostics to attach only on failure:

- pixel diff outside the active control rect;
- canvas alpha/luma sample around the clicked row;
- active element summary;
- active DOM actor readiness timings.

### Test D: Active Editor Wheel Ownership

Scenario:

1. Activate a single-line text-like editor that cannot scroll internally.
2. Wheel over the editor.
3. Verify the section scroll owner receives the wheel burst.
4. Activate an editor that can scroll internally.
5. Wheel over the editor.

Observed assertions:

- non-scrollable editor hands wheel to the retained section without changing
  viewport pan/zoom;
- scrollable editor preserves native editor scroll while it can consume the
  delta;
- ownership does not change mid-burst as the pointer crosses passive/active
  DOM, canvas, or row shell boundaries.

Diagnostics to attach only on failure:

- wheel target summaries;
- active element summaries;
- section offset before/after;
- viewport transform before/after.

### Test E: DOM And Source Scale Guardrail

This is a resource-scale observed outcome, not an implementation-detail test.

Scenario:

1. Open Settings in All Settings mode.
2. Keep no input active.
3. Sample the number of visible browser-editable DOM actors, projected DOM
   actor hosts, layoutsubtree source DOM nodes, capture-only passive DOM nodes,
   and semantic/offscreen DOM nodes.
4. During pan, zoom, and retained section scroll, sample layout/paint time,
   snapshot queue size, and the number of source/capture/semantic DOM nodes
   touched or invalidated.

Observed assertions:

- with no active control, visible browser-editable DOM actors should be near
  zero and bounded by a small constant, not proportional to all visible
  text-like rows;
- source DOM, capture-only passive DOM, and semantic/offscreen DOM must stay
  within documented budgets for an All Settings-scale scene;
- active pan, zoom, and retained section scroll must not touch, trigger layout
  or paint for, capture, or upload passive source/capture DOM proportional to
  visible row count.

This test exists to prevent sliding back into an XYFlow-like DOM graph, either
visible or hidden behind capture/source infrastructure.

## Phase 2: Introduce Committed Surface Runtime Store

Create an imperative committed surface runtime that is owned by GPU Flow, not
React.

Responsibilities:

- hold the current committed content frame as a `CommittedContentFrame`
  concept;
- hold current live viewport and per-surface scroll samples as
  `LiveProjectionSample` state;
- produce `ProjectionFrame` work imperatively from live samples;
- publish content frames only when content/projection/readiness identity
  changes;
- project GPU and DOM actors from current live samples;
- provide snapshots for diagnostics, tests, and debug UI;
- expose `ReactSemanticSnapshot` subscription APIs for rare React consumers
  that need semantic state, not every frame.

Remove `flushSync` committed-frame publication from the hot path. React should
not be required to publish pan, zoom, retained scroll, or retained page repair.

Phase gate:

- pan, zoom, retained section scroll, and retained page repair must no longer
  require `flushSync` committed-frame publication;
- committed content, live projection, projection-frame work, and React semantic
  snapshots are represented by separate runtime/module boundaries;
- visible coherence must remain protected by the committed content frame;
- if this cannot be achieved without destabilizing visible coherence, stop and
  revise the architecture before adding more layers.

During this phase, do not replace passive text-like rendering yet except for
the minimum changes needed to decouple React publication from live motion.

This phase is part of Milestone B. It is not a shippable endpoint until the
identity split, per-surface section scroll path, pan/zoom projection path, and
previous-coherent-frame invariant are also complete.

## Phase 3: Split Actor Identity

Refactor committed actors so their generation ids are not dirtied by unrelated
motion samples.

Required splits:

- content generation id;
- layout/projection generation id;
- readiness generation id;
- live motion sample id.

Per-surface scroll revision must replace global retained scroll revision for
actor invalidation. A scroll in one section cannot change every passive text
control actor generation.

The committed frame can still report a coherent scroll sample for diagnostics,
but that report must not be the broad invalidation key.

Phase gate:

- committed actor identity is split into content, layout/projection,
  readiness, and live motion categories;
- viewport-only motion does not change content-generation ids;
- retained section scroll changes only the affected surface's scroll sample and
  related projection identity;
- focused Vitest coverage proves unrelated motion samples do not dirty passive
  actor content identity.

## Phase 4A: Internal Step: Reduce Passive DOM Hot-Path Participation

First reduce passive text-like controls' participation in hot-path publication
without broadly changing the visible value rendering strategy.

This is an implementation stepping stone only. It must not be treated as a
stable milestone, because passive DOM actors still exist and the DOM scale
guardrail should remain failing until Phase 4B removes them. The source/capture
DOM interaction guardrail also remains relevant if this phase moves work into
hidden DOM.

Implementation requirements:

- passive controls must not dirty committed content identity for viewport-only
  motion;
- retained section scroll must not regenerate all passive DOM actor identities;
- React must not remount or reconcile hundreds of passive controls during pan,
  zoom, or retained section scroll;
- the DOM scale guardrail from Phase 1 must remain failing until passive actors
  are actually removed, but frame-cadence tests should show the hot path moving
  out of React publication.

Phase gate:

- pan/zoom and retained section scroll tests show that passive controls are no
  longer the source of broad committed-frame churn;
- no passive-control visual parity or activation behavior regresses;
- Phase 4B has a written implementation choice before coding begins;
- Milestone C remains incomplete until Phase 4B passes the visible, source,
  capture, and semantic DOM budget guardrails.

## Phase 4B: Replace Passive DOM Controls With Canvas-First Value Actors

Move passive text-like value display out of the visible DOM-control plane.

Before implementation, choose and document the passive value rendering strategy
and passive accessibility/semantics model in this plan or a linked design note.
Valid options include GPU text/display-list rendering, retained browser
snapshotting for passive value ink, or another canvas-first path. The decision
must explain:

- why ordinary single-line values do or do not use GPU/canvas text or retained
  display-list rendering by default;
- why any rich multiline/code-like preview that uses retained browser
  snapshotting cannot reasonably use GPU/canvas text or retained display-list
  rendering;
- why it satisfies visual parity for current text-like value states;
- how active DOM editing replaces and restores the passive slot;
- how paint/readiness is handled without blank publication;
- expected performance and memory costs in an All Settings-scale scene;
- source/capture DOM budgets, layout/paint budgets, snapshot queue limits, and
  how many source/capture DOM nodes can be touched during pan, zoom, and
  retained section scroll;
- which passive values need accessibility exposure before activation;
- whether passive accessibility is active-only, provided by a bounded offscreen
  semantic tree, or provided by another explicit model;
- how keyboard reachability and focus transfer behave when passive content
  becomes active DOM;
- why the choice does not recreate a broad visible or per-frame projected DOM
  runtime.

Implementation requirements:

- define a passive value actor kind owned by retained/canvas rendering;
- render passive value ink through retained pages, GPU text, or another
  canvas-first path;
- preserve visual parity for single-line values, multiline previews,
  placeholder text, error styling, search highlight, disabled state, and
  focused row styling;
- keep row shell and value ink in the same retained content transaction;
- keep active editor DOM as a separate readiness-gated actor;
- prove the first migrated text-like family end to end on at least one
  representative single-line value and one multiline/code-like value before
  broad rollout.

Do not keep the broad passive DOM-control plane as a compatibility path.

Phase gate:

- with no active control, visible browser-editable DOM actors are near zero and
  bounded by a small constant;
- source DOM, capture-only passive DOM, and semantic/offscreen DOM stay within
  documented budgets and are not touched proportional to visible row count
  during pan, zoom, or retained section scroll;
- passive value visual parity is covered for the states listed above;
- the passive accessibility/semantics decision is implemented or explicitly
  accepted as active-only behavior with documented tradeoffs;
- activation tests prove passive-to-active and active-to-passive handoff without
  blanking;
- at least one representative single-line value and one multiline/code-like
  value pass passive display, active DOM handoff, blur restoration, and
  accessibility/semantics checks end to end;
- broad passive DOM-control rendering is removed, not retained as a fallback.

## Phase 5: Build Readiness-Gated Active DOM Actors

Implement active DOM actor attach/detach as an explicit transaction.

Required APIs:

- prepare active actor;
- wait for mount;
- wait for browser paint/readiness;
- publish active actor;
- hold previous passive frame until publish;
- restore passive actor after blur only when passive retained content is ready.

The active DOM actor runtime must preserve native focus/caret/selection/IME
and must preserve wheel ownership during the activation sequence.

For the first migrated text-like family, this phase should land with Phase 4B:
passive retained value display, active DOM attach, active DOM detach, passive
restoration, and accessibility/semantics are one end-to-end behavior.

Phase gate:

- activation no-flicker tests pass in normal and All Settings-scale scenes;
- focus, caret, selection, IME-relevant DOM state, and active element ownership
  are preserved during projection changes;
- blur restores passive retained content only after the passive generation is
  ready;
- the first migrated single-line and multiline/code-like values pass the
  Phase 4B end-to-end handoff checks before broad rollout.

## Phase 6: Add Section Scroll Projection Path

Create a retained-section-scroll frame reason and runtime path distinct from
viewport frames.

This is part of Milestone B, not a late cleanup. The runtime publication cut is
not complete while retained section scroll can still request global viewport
frames or publish global committed content frames during a wheel burst.

The path must:

- coalesce wheel deltas per surface;
- update per-surface scroll sample;
- project committed retained pages and active DOM actors for that surface;
- update scrollbars and hit tests;
- schedule retained repair/refinement;
- avoid global committed-frame publication during the wheel burst.

Remove `requestFrame("viewport")` from retained section scroll flushes.

Phase gate:

- retained section scroll updates only the target surface scroll sample during
  a wheel burst;
- viewport pan/zoom does not start while a retained section owns the burst;
- scrollbars, retained row content, hit tests, and any active DOM actor remain
  visually aligned;
- no global committed content frame is published solely because a surface scroll
  sample changed.

## Phase 7: Harden Pan/Zoom Projection

Ensure pan and zoom run over the committed runtime without React publication.

This is part of Milestone B. Pan/zoom performance is the proof that live motion
has been separated from committed content identity.

Required checks:

- viewport runtime applies transforms to GPU and live DOM actors directly;
- React store publication is throttled/deferred until idle or observer cadence;
- retained page LOD changes are deferred during active viewport gestures;
- existing compatible coverage is reused for motion;
- no DOM mount/unmount occurs during viewport-only motion.

Phase gate:

- pan-only, zoom-only, and mixed pan/zoom measurements meet the Performance
  Target or have a documented platform ceiling with trace evidence;
- no React committed-frame publication, passive DOM actor churn, or retained
  page upload is required for viewport-only motion after warmup.

## Phase 8: Remove Cold Placeholder Over Previous Content

Delete the path that lets a cold placeholder replace a previous coherent
surface frame.

This is part of Milestone B, not finishing polish. Holding previous coherent
content is a publication invariant for activation, retained repair, and
compatible motion.

Rules:

- first-ever content may have a startup placeholder only if no previous
  coherent content exists for that surface;
- existing visible surfaces hold previous coherent content until replacement
  readiness is satisfied;
- activation and scene/runtime state changes must not clear retained display
  state unless a true owner reset occurs;
- owner resets must be narrow and explicit.

Phase gate:

- tests prove a previous coherent frame is held through activation, retained
  repair, and compatible motion;
- cold placeholders remain possible only for first-ever content with no previous
  coherent frame;
- diagnostics clearly distinguish first-ever placeholder, held previous frame,
  and readiness-gated replacement.

## Phase 9: Integrate Diagnostics And Debug Views

Add diagnostics that explain runtime behavior without making tests depend on
implementation details.

Useful diagnostics:

- committed content frame id;
- content publish count per interaction;
- live projection frame count;
- per-surface scroll sample revisions;
- active DOM actor lifecycle timings;
- visible active DOM, projected host, source DOM, capture DOM, and semantic DOM
  counts;
- layout/paint time, snapshot queue size, and source/capture DOM invalidation
  counts during interaction;
- retained page hold/repair reasons;
- paint readiness wait time;
- frame cadence summaries.

Add debug comparison views where practical:

- committed passive retained content;
- active DOM actor projection rect;
- final composite rect;
- hit-test rect.

Phase gate:

- diagnostics expose the values needed to investigate frame cadence, actor
  scale, readiness, retained holds, and projection cost;
- no regression test uses diagnostics as its primary pass/fail oracle when a
  user-observable signal is available;
- debug views are optional for implementation completion, but any added view
  must compare source, committed, and final projected state rather than showing
  only internal counters.

## Phase 10: Verification

After implementation, run the fail-first tests from Phase 1 and the GPU
Flow-related verification suite.

Mandatory verification:

- the new large-scene pan/zoom cadence spec;
- the new retained section scroll cadence spec;
- 120 Hz-class performance specs for pan-only, zoom-only, mixed pan/zoom, and
  retained section scroll in an All Settings-scale scene;
- the new input activation no-flicker spec;
- the new active editor wheel ownership spec;
- the new visible/source/capture/semantic DOM budget guardrail spec;
- first migrated single-line and multiline/code-like value specs covering
  passive rendering, active DOM handoff, blur restoration, and
  accessibility/semantics;
- focused Vitest coverage for committed runtime identity splitting;
- focused Vitest coverage for active DOM actor readiness transactions;
- existing retained content, committed surface frame, wheel ownership, and
  viewport runtime tests;
- all GPU Flow-related Vitest tests under `frontend/src/gpuFlow`;
- all relevant project GPU surface retained-control tests under
  `frontend/src/components/Pages/Project/GpuProjectSurface`;
- all GPU Flow E2E specs under `frontend/tests/e2e/gpu-flow`;
- all Settings retained GPU Flow E2E specs under `frontend/tests/e2e/settings`;
- root GPU Flow probe and stress E2E specs under `frontend/tests/e2e`;
- Chrome DevTools visual verification of the original reproduced path;
- `./scripts/quality/check.sh`.

Default command groups:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow`
- `pnpm -C frontend exec vitest run frontend/src/components/Pages/Project/GpuProjectSurface`
- `./scripts/run-playwright-e2e.sh` for every GPU Flow and Settings retained
  E2E spec or runner shard discovered under `frontend/tests/e2e`
- `./scripts/quality/check.sh`

Running only the new specs or only hand-picked focused tests is not enough.
The implementation notes must state exactly which GPU Flow-related suite
commands or shards were run.

Record before/after frame cadence in an append-only report under `perf/`.

Final notes for the implementation must include:

- which fail-first commands were run before the refactor and the evidence that
  they failed;
- which commands and shards passed after the refactor;
- any remaining failures, with evidence for whether they are related or
  unrelated;
- confirmation that observed behavior, not internal diagnostics alone, was the
  acceptance signal;
- confirmation that Milestone B landed as one publication-model cut, including
  runtime-owned publication, identity splitting, per-surface section scroll,
  pan/zoom projection, and previous-coherent-frame holding;
- evidence that `CommittedContentFrame`, `LiveProjectionSample`,
  `ProjectionFrame`, and `ReactSemanticSnapshot` responsibilities are separated
  in runtime/module boundaries, even if code symbols keep older names;
- evidence that the first representative single-line and multiline/code-like
  text-like values completed the Milestone C/D end-to-end slice before broad
  rollout;
- the passive value accessibility/semantics model and evidence that it does not
  recreate broad visible or per-frame projected DOM;
- the passive value rendering strategy, including any retained browser snapshot
  use, and evidence that snapshot sources are capture-only, pooled/bounded,
  readiness-gated, cached, and excluded from live projection;
- visible active DOM, projected host, layoutsubtree source DOM, capture-only
  passive DOM, and semantic/offscreen DOM counts before/after;
- layout/paint time, snapshot queue size, and source/capture/semantic DOM
  invalidation counts during active pan, zoom, and retained section scroll;
- frame cadence before/after for All Settings pan/zoom;
- frame cadence before/after for large retained section scroll;
- measured 120 Hz-class performance results, including p95/p99 frame gaps,
  long tasks, and any justified non-120 fallback budget;
- evidence that input activation no longer blanks surrounding content;
- DOM actor scale before/after;
- CDP visual verification result.

## Non-Goals

- No backward compatibility path.
- No feature flag to keep the current broad passive DOM-control plane.
- No transitional dual publication path.
- No XYFlow-style DOM graph.
- No full-page HTML texture capture every frame.
- No broad hidden passive DOM capture graph that is touched during interaction.
- No live passive CodeMirror editor per visible row.
- No silent fallback to blank placeholders.
- No heuristic wheel ownership fallback.

## Expected Outcome

This should make the committed surface actor work actually match the intended
architecture:

- one coherent content boundary;
- cheap live motion;
- canvas-first passive content;
- small, readiness-gated live DOM for browser semantics;
- bounded source/capture/semantic DOM that is not dirtied during interaction;
- per-surface retained scroll;
- no activation flicker;
- no broad React/DOM publication during high-frequency gestures.

The result is not a retreat from the committed surface frame idea. It is a
larger refactor that makes the committed frame a renderer/runtime primitive
instead of a React reconciliation event.
