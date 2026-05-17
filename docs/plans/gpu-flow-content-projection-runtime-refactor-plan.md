# GPU Flow Content Projection Runtime Refactor Plan

Date: 2026-05-18

Status: proposed. This supersedes the deleted canvas-first committed surface
runtime plan. The first implementation step is fail-first observed-behavior
coverage.

## Problem

The latest Chrome recording shows two regressions that should have been caught
by tests:

1. Inactive retained text-like fields no longer look like CodeMirror. The
   committed frame logs show zero DOM-control actors for retained text rows:
   `projectedCount`, `sourceCount`, and `visibleNonemptyCount` are all zero.
   The project descriptor now marks text-like controls as `canvas-owned`, so
   passive values are drawn by `retainedContentTextLikeCanvas.ts` instead of by
   the browser/CodeMirror visual path.
2. Pan, zoom, and retained section scroll still enter the full retained content
   commit and render path. In the latest recording, after opening All Settings,
   `gpu-flow-frame` averages about 11 ms with p95 around 16.5 ms even when
   upload and raster work are zero. The viewport runtime itself is cheap
   (`gpu-flow-viewport-runtime-frame` stays around 0.03 ms), so the hot path is
   not viewport math. It is the frame path still resolving retained runtime
   frames, retained display transactions, committed surface frames, HTML surface
   frame state, diagnostics, and maintenance during frames that should only
   reproject already-committed content.

The old tests missed this because they mostly asserted "some ink exists", not
that passive text is visually equivalent to CodeMirror. Performance tests also
allowed CI-capped budgets around 20 ms p95 and 110 ms max frame/long-task
samples, while the regression is visible on a high-refresh display as 120 Hz
cadence loss and immediate All Settings jank.

## Regression Gates

This refactor is not complete unless both gates are satisfied.

### Gate 1: Realistic Fail-First Tests

Before changing runtime behavior, add tests that capture the exact observed
regressions and prove they fail on current HEAD. The pass/fail signal must be
observed behavior:

- screenshot/pixel parity with active CodeMirror for inactive text-like values;
- RAF cadence, frame gaps, and long tasks for All Settings transition, pan,
  zoom, and retained section scroll;
- visual continuity during text activation and blur;
- bounded visible/source/capture DOM scale as a user-impacting resource result.

Internal counters, actor ids, scheduler calls, debug flags, and log fields may
be attached as diagnostics, but they must not be the primary oracle when a
visible or timing signal exists.

### Gate 2: Full GPU Flow-Related Suite

After implementation, run the full GPU Flow-related suite before calling the
work done. Focused tests are not enough.

The suite must include:

- all `frontend/src/gpuFlow` Vitest coverage;
- all project GPU surface and retained-control Vitest coverage under
  `frontend/src/components/Pages/Project/GpuProjectSurface`;
- every E2E spec under `frontend/tests/e2e/gpu-flow`;
- every Settings retained/GPU Flow E2E spec under
  `frontend/tests/e2e/settings`, including existing retained compositor,
  retained scroll, retained CodeMirror, pan/zoom, committed-surface, visual
  continuity, and interaction stability specs;
- cross-surface E2E specs that exercise retained text editors or GPU Flow
  retained controls outside the Settings folder, such as callable params when
  affected;
- `./scripts/quality/check.sh`.

The suite may be sharded if needed, but every shard must be listed in the final
implementation notes with pass/fail status. Do not skip broadly. Any skipped or
failing test must include the command, failure summary, and the reason it is not
blocking.

## Performance Target

The target is 120 fps-class interaction for pan, zoom, and retained section
scroll in a large complex scene comparable to the Settings project's All
Settings page. The benchmark scene must include similar retained surface count,
row count, text-like control count, section nesting, retained page coverage
pressure, and active editor candidates. A small synthetic graph is not
sufficient for this target.

Measure these gestures separately:

- viewport pan-only;
- viewport zoom-only;
- mixed pan/zoom wheel or trackpad-equivalent gestures;
- retained section wheel scrolling inside a large retained section.

Primary budgets on a runner that proves high-refresh RAF cadence:

- p95 frame interval during active interaction at or below 8.5 ms;
- p99 frame interval below 16.7 ms;
- no long task above 50 ms during the active interaction window;
- no visual blanking, placeholder flash, retained row jump, or scroll drift.

If a true 120 fps result is not achievable in the measurement environment, do
not silently lower the bar. Record the limiting factor and use the nearest
defensible budget in the same range only with evidence, such as a control RAF
cadence showing the browser/display is capped, a trace showing GPU/driver
limits, or a measured platform ceiling outside the implementation's control. On
a 60 Hz CI runner, still assert that the interaction work itself fits inside an
8.5 ms budget where measurable, and use frame-gap/long-task/visual-continuity
checks to reject obvious jank.

## Frame Reason Work Matrix

Frame reasons define which work is allowed. This matrix is an architectural
contract, not just a scheduling preference.

| Frame reason | Content commit | Projection draw | Maintenance | React semantic publish | Passive uploads |
| --- | --- | --- | --- | --- | --- |
| `viewport` | no | yes | no | no | no |
| `retained-scroll` | no | yes | no | no | no |
| `content-commit` | yes | maybe | maybe | yes, deduped | maybe |
| `content-ready` | yes | maybe | maybe | yes, deduped/no-op if semantic state is unchanged | no |
| `texture-upload` | no | maybe | yes | no | yes |
| `maintenance` | no visible advance | no/optional | yes | no | yes |
| `animation` | only native visual/projection work unless content changed | yes | no | no | no |

`texture-upload` and `maintenance` may prepare resources, but they must not
independently advance visible content. Visible publication still goes through a
content commit or content-ready decision. Resource readiness may trigger a new
`content-ready` frame that publishes a previously held or blocked actor, but it
must not repair or advance visible content inside a projection frame. Add
runtime assertions in dev/test paths so viewport and retained-scroll frames
cannot accidentally create content frames, retained runtime frames, retained
page frames, display transactions, React publications, passive repairs, passive
refinements, passive uploads, or forced layout reads.

## Direction

Do not wholesale revert the branch. Reverting to the DOM-control-plane era would
restore the inactive CodeMirror look, but it would also bring back the earlier
coupling between text control publication and retained frame work. It should be
used as a visual reference and possibly as a source of implementation details,
not as the final architecture.

The direction in `docs/notes/gpu-flow-architecture-iterations.md` is still the
right one:

- GPU Flow owns scene geometry, hit testing, retained pages, and composition.
- Browser DOM owns active editing semantics and any text-like visual surface
  that must match CodeMirror.
- Viewport motion is live projection over committed content, not a request to
  rebuild retained content.
- Visible layers publish through one coherent committed surface boundary.

The current `canvas-owned` passive text path is a step backward because it
returns to hand-drawing CodeMirror-like text on canvas. The principled fix is
larger than flipping that flag back. We should split committed content,
projection, and maintenance so browser-derived text visuals can come back
without making every viewport or scroll frame pay the retained publication cost.

## Is This New Or A Revert?

This is progress, not a repeat of an already-completed iteration.

Pieces exist:

- Iteration 10 moved scroll, viewport, and active editor state toward sampled
  runtime frames.
- Iteration 14 introduced the DOM-control plane so text-like values were
  browser-rendered instead of retained texture pixels.
- Iteration 15 introduced a committed surface frame so visible actors publish
  together.

The missing piece is the hard split between content publication and live
projection. Today, `viewport` and `retained-scroll` frames still enter the
content-publication path. That makes the DOM-control plane feel expensive, so
the latest implementation avoided it by moving passive text back to canvas
drawing. The new plan fixes that root cause instead of choosing between
CodeMirror visual parity and frame cadence.

Use the earlier DOM-control-plane commits as visual and behavioral reference
material. Do not revert to them as the final architecture unless we decide to
make a short-term emergency rollback while this refactor is implemented.

## Ideas To Borrow From The Example Repos

The examples in
`/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` are useful
as architecture inputs, not as code to copy directly.

- `html-in-canvas-official`: source DOM, captured element images, and visible
  canvas drawing are distinct. Paint readiness is explicit, missing snapshots
  are not success, CSS transforms are projection work, and source DOM location
  must stay synchronized for hit testing and accessibility.
- `three-html-render`: live HTML overlays are projected imperatively with one
  CSS transform per element from cached camera math. Projection is a runtime
  operation, not a React render for every frame.
- `three-html-render` polyfill and `htmlTexture.ts`: texture capture has dirty
  state, paint events, resize observation, and dynamic form-state sync. It also
  treats "no snapshot recorded yet" as an invalid state rather than drawing a
  fake fallback.
- `html-in-canvas-cracks`: CSS pixels are the stable coordinate space; scroll
  and resize are explicit projection terms; debug views compare source DOM,
  captured texture, and final composite.
- `compiz-web`: element texture capture is good for transitions and cached
  frames, but uploading the whole element every render loop is not the model to
  copy for a large editing surface.
- `html-in-canvas-room`: hold the last coherent visual output until the next
  scene is ready. This reinforces our retained continuity rule: do not publish
  cold placeholders over previously coherent content.

## Target Architecture

Refactor GPU Flow around three frame types.

### Committed Content Frame

`CommittedContentFrame` is the stable description of content that can be shown
and hit-tested. It includes:

- retained page draw records and protected page resources;
- retained native visuals such as row hover, scrollbars, and switch visuals;
- text-like visual actors whose pixels are browser/CodeMirror-derived;
- active DOM island decisions;
- hit indexes, clip-chain revision, z-order, and completeness diagnostics;
- resource readiness state for browser-derived text snapshots.

This is a content identity. It changes when scene content, text values, active
control ownership, retained coverage, or visual actor resources change. It does
not change just because the viewport moved or a retained section scroll offset
is being projected through already-available content.

### Content Frame Publishability

Projection should consume a typed publishability result rather than inferring
readiness from missing fields or counters:

```ts
type ContentFramePublishability =
  | { kind: "publishable"; contentFrame: CommittedContentFrame }
  | {
      kind: "hold-previous";
      previousFrame: CommittedContentFrame;
      reason: CoverageBlockReason;
    }
  | { kind: "block-first-publication"; reason: CoverageBlockReason }
  | {
      kind: "true-hole";
      actorId: SurfaceActorId;
      actorFamily: "retained-page" | "text" | "html-texture" | "dom-island";
    };
```

Projection frames may consume only `publishable` or `hold-previous`. A
`true-hole` queues maintenance or content work and must never be repaired inside
an input/projection frame. `block-first-publication` means do not publish an
incoherent visible frame; it must not mean synchronously generating all missing
actors inside one input, wheel, or navigation task.

### Live Projection Sample

`LiveProjectionSample` is the current viewport and per-surface retained scroll
state:

- viewport `x`, `y`, and `zoom`;
- visible canvas size and device pixel ratio;
- per-retained-surface scroll offsets;
- active gesture owner and focused editor scroll owner.

This is cheap to sample every animation frame. It can be newer than the last
committed content frame as long as the projection remains coverage-compatible.
Coverage compatibility must be defined per actor family, not just for retained
pages. A newer projection sample can publish only when every visible committed
actor has an exact visual, a compatible previous visual, or an explicit
readiness block that holds previous coherent content.

### Projection Coverage Horizon

The draw-only projection path needs an explicit coverage horizon so fast motion
does not turn missing newly exposed content into either synchronous repair work
or canvas/blank fallbacks.

For every committed content frame, the runtime should know the projection range
that is safe to draw without content work:

- viewport bounds covered by exact retained pages, compatible retained pages,
  HTML texture actors, native visuals, text actors, DOM islands, hit projection,
  and clip-chain data;
- per-retained-surface scroll ranges covered by exact or compatible retained
  page and text actor coverage;
- overscan margins for pan, zoom, and retained section scroll that are large
  enough for the expected gesture cadence;
- actor-family-specific readiness state for newly revealed retained pages,
  browser-derived text actors, HTML texture actors, and DOM islands.

When a new projection sample stays inside this horizon, projection can publish
immediately. When it exceeds the horizon, projection must choose only one of the
typed publishability outcomes:

- use exact newly revealed coverage when it is already available;
- use a compatible previous actor when the actor family proves that the previous
  visual, hit projection, source window, clip chain, and motion sample remain
  valid;
- hold the previous coherent content and queue maintenance or content work;
- block first publication with a diagnosed reason.

It must not extend the horizon inside a `viewport` or `retained-scroll` frame by
creating retained runtime frames, page frames, display transactions, text
captures, HTML uploads, forced layout reads, React publications, or canvas-drawn
text substitutes. The horizon and overscan policy should be reported in
diagnostics so a future recording can distinguish "projection is expensive" from
"projection outran prepared content."

### Projection Frame

`ProjectionFrame` combines the latest committed content frame with the latest
live projection sample and performs only draw/projection work:

- update WebGPU camera uniforms;
- redraw retained pages, native visuals, DOM textures, grid, and edges from
  already-committed resources;
- apply one imperative transform per mounted active DOM island, projected
  browser text actor, and overlay root;
- update hit projection for the currently visible committed actors.

Viewport, wheel pan, and retained-scroll frame reasons should route here. They
must not run retained runtime sampling, retained page frame resolution, retained
display transaction resolution, committed content creation, React publication,
passive texture repair, or DOM measurement/read-after-write work on the hot
path. Projection may apply transforms to already-mounted actors, but it must not
force layout during wheel, pan, zoom, or retained-scroll frames.

### Maintenance Frame

`MaintenanceFrame` prepares future committed content:

- retained page raster/upload/refinement;
- browser-derived text snapshot capture and upload when a text actor cannot be
  directly projected as live DOM;
- HTML texture upload and passive resolution upgrades;
- eviction and resource cleanup.

Maintenance runs after content changes, after idle, or under explicit texture
upload reasons with budgets. It can request another maintenance frame, but it
does not independently advance visible layers.

## Text-Like Control Model

Text-like retained values must stop using hand-drawn canvas text.

Canvas/WebGPU must never render text-like control value pixels with custom text
metrics. Canvas owns the row shell, clipping, z-order, hit testing, scrollbars,
hover visuals, switches, retained page composition, and final composition of
browser-derived artifacts. Browser/CodeMirror owns the text pixels: font,
padding, colors, line height, wrapping, placeholder styling, error styling, and
selection/caret/editor semantics.

The new owner contract should remove the current binary `renderOwner` behavior
and replace it with an explicit text visual policy:

- active editor: real `ParamInput`/CodeMirror DOM in the projected active DOM
  actor, with browser focus, caret, IME, selection, and tooltips;
- readable passive value: browser-rendered CodeMirror visual actor projected
  by the text control plane;
- bulk/offscreen/non-readable passive value: a committed snapshot artifact
  generated from a bounded CodeMirror/DummyCodeMirror capture pool, not from
  custom canvas text metrics;
- no visual state: hold the previous coherent actor or block first publication
  until the browser-derived visual is ready.

This keeps CodeMirror/DOM as the source of truth for text visuals without
mounting an unbounded CodeMirror tree for every retained row. It also avoids
the old "replicate CodeMirror in canvas" loop. Canvas may compose a captured
artifact, but the artifact must be produced by browser-rendered
CodeMirror/DummyCodeMirror.

Text-like actors need explicit coverage proof parallel to retained page
coverage:

- `exact-live-dom`: a projected browser DOM actor owns the visible text pixels;
- `exact-snapshot`: a browser-rendered snapshot artifact exactly matches the
  committed text actor generation;
- `compatible-previous`: the previous coherent text actor can remain visible
  while replacement work is pending;
- `blocked-awaiting-browser-visual`: no replacement can publish yet, so the
  compositor must hold previous coherent content or block first publication;
- `true-hole`: no publishable text visual exists.

Projection must refuse to publish text `true-hole` coverage. A missing passive
text visual is not allowed to fall back to canvas-drawn text, blank text, or a
placeholder over previously coherent content.

Text actor records must carry separate visual and semantic generations:

```ts
type TextActorActivationPolicy =
  | "allowed"
  | "requires-current-visual"
  | "queue-until-ready";
```

If a text actor is `compatible-previous`, hit testing may remain geometrically
valid, but value-sensitive interaction must check whether `visualGeneration`
matches `semanticGeneration`. Activation must not let the user edit an old
visual while committing against a newer invisible value. The actor must either
activate against a current visual, force or queue readiness work before
activation, or block activation with a diagnosed readiness reason.

Snapshot artifact cache keys must include every input that can change
CodeMirror-rendered pixels:

- value, language, placeholder, disabled state, error state, single-line/wrap
  policy, CSS size, DPR, and zoom bucket;
- CodeMirror theme revision;
- app theme/dark-mode revision;
- CSS variable revision or resolved style hash;
- loaded font generation;
- editor extension set and syntax-highlighting generation;
- measured layout mode for wrapped and multiline values.

Passive readable DOM actors need explicit interaction and accessibility
semantics. By default they are display DOM for visual fidelity, not independent
tab stops. Pointer activation routes through the retained interaction model
unless a future design deliberately opts into native passive selection or
accessibility behavior. Each actor must declare whether it is exposed to
accessibility APIs, `aria-hidden`, pointer-interactive, selectable, and
focusable.

The readable-passive policy must be deterministic. A text-like actor is
classified as a readable passive DOM actor only from explicit inputs:

- viewport intersection and retained surface visibility;
- control clip area and whether the row is partially clipped;
- zoom and estimated legibility at the current projection;
- row visibility and z-order;
- max live readable text actor count for the frame;
- active/focused/activation-near status.

Partially clipped text actors must still produce explicit coverage proof. A
clipped readable actor can be live DOM, a snapshot, `compatible-previous`,
`blocked-awaiting-browser-visual`, or `true-hole`, but clipping cannot silently
downgrade to canvas text or blank value pixels.

The CodeMirror/DummyCodeMirror capture pool must have explicit budgets:

- maximum capture tasks per frame;
- maximum synchronous captures allowed during one content commit;
- maximum capture time per maintenance slice;
- maximum queued capture work before publication holds or blocks;
- no capture work during `viewport` or `retained-scroll` projection frames.

Capture pool work belongs to maintenance or content preparation. It must not be
pulled into input frames to satisfy first publication.

Live DOM actors, snapshot artifacts, captured texture resources, and text actor
generation records must be retired when their actor generations become
unreachable. Cleanup is part of the text actor contract, not a best-effort
memory optimization.

The old canvas text-like row renderer should be deleted for text values in
Phase 8 once the browser-derived actor path has coverage and continuity
guarantees. There should be no compatibility switch or fallback that silently
returns to canvas text drawing.

## First Step: Fail-First Tests

Create tests before implementation and prove they fail on current HEAD. These
tests must assert observed behavior. Internal performance events can be
attached as diagnostics, but they must not be the pass/fail oracle.

### Passive Text Visual Parity

Add or replace coverage under
`frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts`.

Scenario:

1. Open Settings, switch to All Settings, and center a known retained text-like
   row at readable zoom.
2. Capture the inactive control before click.
3. Activate the same control, hide the caret and selection for deterministic
   comparison, and capture the active CodeMirror control.
4. Blur and capture the passive control again.
5. Compare inactive-before, active, and inactive-after clips using pixel diff,
   text ink bounds, baseline/centerline, left padding, height, and color
   histogram tolerances.

The current implementation should fail because the passive canvas value is a
hand-drawn approximation and does not match the active CodeMirror visual. A
plain "pixelCount > 0" assertion is not enough.

### All Settings Transition Cadence

Add a high-signal user-regression spec, for example
`frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`.

Scenario:

1. Start a browser-observed RAF sampler and long-task observer.
2. Navigate to Settings.
3. Click All Settings.
4. Measure the immediate transition window until the graph reaches the All
   Settings retained row count and first coherent visual frame.

Assertions:

- no long task above 50 ms during the transition window;
- no visual blank or cold placeholder over previously coherent content;
- no frame gap above 50 ms in the same window;
- if the control RAF cadence proves a high-refresh runner, p95 frame interval
  during the transition must stay at or below 8.5 ms after warmup.

This should fail on the latest recording pattern, which has an All Settings
long task around 142 ms and a frame gap around 150 ms.

### Recorded Pan, Zoom, And Retained Scroll Cadence

Add a replay-style gesture test using the same viewport size and timing shape
as the latest Chrome recording. The test should dispatch natural wheel deltas
at the recorded cadence or at 8 ms spacing when recording replay data is not
available. Run the test against an All Settings-scale scene and measure
pan-only, zoom-only, mixed pan/zoom, and retained section scroll as separate
sub-scenarios.

Assertions:

- canvas remains nonblank throughout the gesture;
- visible retained row clips stay nonblank and do not jump backward;
- browser RAF p95 during active pan, zoom, mixed pan/zoom, and retained-scroll
  stays within the Performance Target when the runner supports it;
- on capped runners, gesture latency and long-task limits still fail on
  obvious jank instead of allowing 110 ms samples.

Do not use `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1` as an optional gate for
this regression. The test should choose the budget from the measured control
cadence and fail loudly if the environment cannot measure the intended local
regression lane.

### Visual Continuity During Text Activation

Add a focused activation test around the exact observed path:

1. Keep a passive text-like value visible.
2. Click it.
3. Capture the immediate activation frame and the first active CodeMirror frame.
4. Assert no blanking, striping, placeholder, or mismatched geometry appears
   within the row or surrounding retained content.

This guards the "hold previous coherent actor until the browser-derived actor
is ready" rule.

### Secondary Runtime Contract Guardrail

Add a focused runtime contract test after the observed-behavior tests. This is
not a substitute for screenshot, cadence, long-task, and continuity assertions;
it exists to prevent the old hot path from quietly returning.

During viewport and retained-scroll gestures, no code path may create a retained
runtime frame, retained page frame, retained display transaction, committed
content frame, React publication, passive repair, passive refinement, or passive
HTML upload, and no code path may perform forced layout reads unless the frame
reason is explicitly a content or maintenance reason. Failures should attach
phase diagnostics, but the user-facing tests above remain the primary
regression gates.

## Implementation Phases

### Phase 0: Add Fail-First Observed-Behavior Tests

Land the fail-first tests from the First Step section before implementation
changes. They must be run against current HEAD and recorded as expected
failures before the runtime refactor starts.

This phase should create the observed-behavior gates first:

- passive text visual parity against active CodeMirror;
- All Settings transition RAF/long-task/frame-gap coverage;
- pan-only, zoom-only, mixed pan/zoom, and retained section scroll cadence;
- text activation visual continuity;
- the secondary runtime contract guardrail that proves projection frames do not
  perform content or maintenance work.

The diagnostics from later phases can make these failures easier to interpret,
but they are not a substitute for proving the visible and timing regressions
fail before the fix.

### Phase 1: Add Diagnostics As Support, Not Test Oracles

Add frame-phase diagnostics to Chrome recordings so future recordings make the
hot path obvious:

- retained runtime sample time;
- retained page frame resolution time;
- retained display transaction time;
- committed content creation time;
- React/store publication time;
- projection draw time;
- DOM/text actor projection time;
- large-scene content commit scheduling time;
- maintenance time;
- diagnostics/logging time.

Also log text actor realization decisions: live DOM, snapshot artifact, cache
hit/miss, capture-pool wait, readiness hold, and previous-frame hold. These
logs are for diagnosis and triage. The diagnostics must separate All Settings
transition/content-commit cost from steady-state projection cost. The fail-first
tests remain based on screenshots, RAF cadence, frame gaps, and long-task
observations.

Record transition/content-commit metrics separately from steady-state projection
metrics:

- transition/content commit: scene generation, actor derivation, hit-index
  construction, text actor preparation, retained coverage proof, and React
  semantic publication;
- steady-state projection: pan, zoom, and retained-scroll over already
  committed resources.

If the diagnostics or the existing latest recording show an All Settings-scale
content commit, readiness publish, or transition task above the 50 ms long-task
gate, the scheduling work from Phase 7 becomes an early blocker before broad
browser-derived passive text actors are restored. Do not wait until the end of
the refactor to address a known large synchronous content path.

### Phase 2: Introduce Content, Projection, And Maintenance Boundaries

Split the current committed surface frame/runtime into hard module boundaries:

- content identity: stable actor/resource generation and readiness;
- projection sample: viewport, per-surface scroll, DPR, and gesture/focus terms;
- projection render signature: the exact resources and projection version used
  for draw;
- projection coverage horizon: the prepared viewport/scroll range and
  actor-family coverage proofs that projection can consume without content work;
- maintenance work: retained repair/refinement, browser-derived text artifact
  preparation, passive uploads, and eviction.

The existing `GpuFlowCommittedSurfaceFrame` can be replaced rather than kept
alive behind a compatibility adapter. No backward-compatibility path is needed.
This phase must land before restoring broad browser-derived passive text
actors; otherwise the text fix can recreate the performance pressure that
caused the `canvas-owned` regression.

### Phase 3: Add A Draw-Only Projection Path

Change `GpuSurface` frame routing so `viewport` and `retained-scroll` reasons
call a draw-only projection frame when content is already publishable and the
live projection sample is inside the committed frame's coverage horizon.

The projection frame may:

- sample the live viewport and retained scroll offsets;
- redraw the renderer with committed resources;
- imperatively update mounted text actors, active islands, and overlay roots;
- update lightweight hit projection state.

It must not:

- call retained runtime frame creation;
- resolve retained page frames;
- resolve retained display transactions;
- create a committed content frame;
- publish React state for DOM control/island layers;
- start passive page refinement or passive HTML texture upload.

If projection discovers a true coverage hole, it holds the previous coherent
content projection and queues maintenance rather than doing repair work inside
the input frame.

### Phase 4: Make Retained Section Scroll Projection-First

Retained section wheel scroll should update a per-surface live scroll sample
and request a projection frame immediately. Page raster/upload work for newly
exposed content is maintenance. The committed content frame must declare the
retained-scroll coverage horizon for each retained surface, including overscan
and compatible previous coverage. If exact pages are missing, compatible
retained coverage or the previous coherent frame is projected until maintenance
catches up.

This is the retained-scroll version of the existing viewport rule: motion first,
content repair second, with no blank publication.

### Phase 5: Refactor React Layer Publication

React should publish content-frame changes, not every projection sample.

- Active DOM islands and readable text actors are mounted/unmounted when the
  committed content actor set changes.
- Viewport and scroll movement updates their transforms through registered
  overlay/projection managers.
- Store subscriptions are used for semantic/debug state, not for re-rendering
  every projected actor during wheel frames.

### Phase 6: Restore Browser-Derived Text Actors With Coverage

Replace `renderOwner: "canvas-owned"` for text-like retained values with the
new explicit text visual policy, after the projection path exists and any known
All Settings-scale content-commit long task has been scheduled or staged under
the Phase 7 rule.

Build a bounded text visual actor system:

- project visible/readable text actors through an imperative text control
  plane using browser-rendered CodeMirror/DummyCodeMirror DOM;
- capture snapshot artifacts through a small reusable CodeMirror visual pool
  for actors that should not stay mounted as live DOM;
- cache artifacts using the full canonical snapshot key from the Text-Like
  Control Model: value, language, placeholder, disabled/error state,
  single-line/wrap policy, CSS size, DPR, zoom bucket, CodeMirror theme
  revision, app theme/dark-mode revision, CSS variable revision or resolved
  style hash, loaded font generation, editor extension/syntax-highlighting
  generation, and measured layout mode;
- attach a `TextActorCoverageProof` or equivalent to every committed text actor;
- track `visualGeneration`, `semanticGeneration`, and activation policy on
  every text actor;
- hold the previous coherent actor while a replacement artifact is pending;
- block first publication for a visible readable actor if no browser-derived
  visual is available.

This phase restores browser-derived text visuals. It must not reintroduce broad
React publication or per-frame text actor remounting during viewport and
retained-scroll gestures. The old canvas text drawing path is still removed in
Phase 8, after this path has the same continuity guarantees as retained pages.

### Phase 7: Make Large Content Commits And Readiness Publishes Schedulable

The All Settings transition is a content-commit/readiness path, not just
projection. Projection-only frames will not fix it if initial retained scene
generation, actor derivation, hit-index construction, browser text visual
preparation, or React semantic publication runs as one large synchronous task.

Use the Phase 1 diagnostics to identify large content-commit cost. If any large
scene content commit can exceed the 50 ms long-task gate, make content commits
chunked, interruptible, or staged behind coherent previous content. First
publication may block until a coherent frame exists, but replacing existing
visible content must hold the previous coherent frame while work continues.
Blocking first publication means blocking visible publication of an incoherent
frame, not blocking the browser main thread in a synchronous CodeMirror,
snapshot, scene generation, or hit-index construction loop.

This phase is mandatory whenever diagnostics show an All Settings-scale content
commit can exceed the long-task budget. Do not defer the scheduling work as a
follow-up if the content-commit/readiness path is still over budget.

### Phase 8: Delete Transitional Paths

Once the browser-derived actor path passes the focused observed-behavior tests:

- remove the `canvas-owned` text-like value renderer;
- remove any text visual compatibility flag;
- remove any duplicate committed-surface runtime path that still combines
  content creation and projection for viewport frames;
- update `docs/reference/html-in-canvas-architecture.md` and
  `docs/notes/gpu-flow-architecture-iterations.md` to reflect the new content
  frame/projection frame split.

After deletion, rerun the fail-first tests and the full GPU Flow-related suite.

## Acceptance Criteria

- The fail-first observed-behavior tests were run before implementation and
  failed on the pre-refactor behavior.
- Frame reason runtime assertions enforce the Frame Reason Work Matrix.
- Projection consumes an explicit `ContentFramePublishability` result and never
  repairs `true-hole` coverage inside input/projection frames.
- Every committed content frame declares a projection coverage horizon for
  viewport and retained-scroll motion, including actor-family coverage proofs,
  overscan policy, and the prepared range that projection may consume without
  content work.
- Projection samples outside the coverage horizon hold previous coherent content
  or block first publication with a diagnosed reason. They do not extend
  coverage by synchronously creating retained frames, text captures, HTML
  uploads, React publications, forced layout reads, or canvas text substitutes.
- Inactive retained text-like values at readable zoom are visually equivalent
  to active CodeMirror within the screenshot tolerances.
- Canvas/WebGPU does not render text-like control value pixels with custom text
  metrics. Readable passive text values are browser DOM actors, and cached text
  artifacts are produced by browser-rendered CodeMirror/DummyCodeMirror.
- Active text editing still uses real CodeMirror/native browser behavior.
- Every committed text actor has explicit coverage proof, and projection never
  publishes text `true-hole` coverage.
- Text activation respects `visualGeneration`, `semanticGeneration`, and actor
  activation policy so users cannot edit an old visual against a newer invisible
  semantic value.
- Readable passive text actor selection is deterministic from viewport
  intersection, clipping, zoom/legibility, row visibility, z-order, live actor
  budget, and active/activation-near state.
- Partially clipped text actors still publish explicit coverage proof and never
  downgrade to canvas text or blank value pixels.
- Text snapshot cache keys include CodeMirror theme revision, app theme/dark
  mode, CSS/style hash, loaded font generation, editor extension/syntax
  generation, and measured layout mode.
- The CodeMirror/DummyCodeMirror capture pool enforces max captures per frame,
  max synchronous captures per content commit, max capture time per maintenance
  slice, max queue depth, and no capture work during viewport or retained-scroll
  projection frames.
- Passive readable DOM actors have declared accessibility, focusability,
  pointer, and selection semantics.
- All Settings transition has no long task above 50 ms and no frame gap above
  50 ms in the regression window.
- Large All Settings-scale content commits are chunked, interruptible, or
  staged behind coherent previous content when diagnostics show they would
  exceed the long-task budget.
- If current recordings or Phase 1 diagnostics already show All Settings-scale
  content/readiness work over the 50 ms long-task gate, that scheduling work is
  completed before restoring broad browser-derived passive text actors.
- Transition/content-commit cost is reported separately from steady-state
  projection cost.
- In an All Settings-scale scene, high-refresh pan-only, zoom-only, mixed
  pan/zoom, and retained section scroll gestures satisfy the Performance
  Target: p95 at or below 8.5 ms, p99 below 16.7 ms, no long task above 50 ms,
  and no visual blanking or retained row drift.
- Capped runners still reject obvious jank through long-task and frame-gap
  limits; they do not hide regressions behind 110 ms budgets.
- Viewport and retained-scroll frames do not trigger content publication or
  passive repair work.
- The secondary runtime contract guardrail proves viewport and retained-scroll
  gestures do not create retained runtime frames, retained page frames,
  retained display transactions, committed content frames, React publication,
  passive repair, passive refinement, passive HTML upload, or forced layout
  reads.
- No cold placeholder is published over a previously coherent visible frame.
- The number of live CodeMirror DOM actors is bounded by the visible/readable
  actor set and the capture pool size. There is no hidden CodeMirror per
  retained row.
- Live DOM actors, snapshot artifacts, captured texture resources, and text
  actor generation records are retired when their actor generations become
  unreachable.
- Chrome recordings expose enough phase diagnostics, including coverage horizon
  and overscan state, to tell whether a future regression is projection, content
  commit, projection outrunning prepared content, text actor readiness, upload,
  or maintenance.
- The full GPU Flow-related suite from Gate 2 has been run and the final notes
  list each command or shard with pass/fail status.

## Verification Commands

Run the new fail-first specs before implementation and attach the failing
artifacts to the change notes. The first commands should be the new observed
behavior specs, not implementation-detail unit tests.

After implementation, run the full GPU Flow-related suite. Suggested command
groups:

```sh
pnpm -C frontend exec vitest run frontend/src/gpuFlow
pnpm -C frontend exec vitest run frontend/src/components/Pages/Project/GpuProjectSurface
./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts
./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/callable-params.spec.ts
./scripts/quality/check.sh
```

If `./scripts/run-playwright-e2e.sh` cannot accept a directory in the local
runner, expand the directory into explicit spec files and record every shard in
the implementation notes. The focused spec commands above are listed because
they are the highest-signal regression checks; they do not replace running the
full `gpu-flow` and Settings retained suite.

Record before/after performance evidence under `perf/` as append-only reports.
Those reports must include the All Settings-scale pan-only, zoom-only, mixed
pan/zoom, and retained section scroll measurements against the Performance
Target, including any documented platform ceiling if 120 fps-class cadence is
not reached. They must also include All Settings transition/content-commit
phase timings so startup content work is not confused with steady-state
projection work, and they must report both categories separately.
Use `./scripts/record-chrome-repro.sh` for a final local reproduction and
confirm the latest recording no longer shows zero text-control actors for
readable passive text rows or full retained commit work on projection-only
frames, and that text actors publish with explicit coverage proof rather than
canvas-drawn fallback value pixels.
