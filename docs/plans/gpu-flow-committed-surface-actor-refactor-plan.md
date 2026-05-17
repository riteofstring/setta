# GPU Flow Committed Surface Actor Refactor Plan

## Goal

Replace the current partial DOM-control overlay with a single committed surface actor architecture for GPU Flow.

The current direction over the past six days is directionally right: visible text-like controls should be real DOM, not retained texture snapshots, and focus/caret/selection/IME should stay on the browser's native path. The implementation is still not principled enough. We now have a `GpuFlowDomControlPlane`, but it is still fed from a retained source frame that can differ from the retained frame actually published to the canvas. Wheel ownership is still partly decided from the current event target, so a pan gesture can change behavior when the pointer moves over a projected control.

The principled fix is to make retained GPU pages, projected DOM controls, DOM islands, hit testing, clipping, scroll samples, and interaction ownership publish from one coherent display transaction.

There should be one committed frame for what the user sees and interacts with. Prepared frames can exist, but they must not independently drive visible DOM while the canvas is showing another retained frame.

No backward compatibility, dual path, compatibility flag, or transitional retained DOM-control texture fallback is part of this plan.

## Is This Already Done?

No. The current code has important pieces, but not the coherent commit boundary.

Already done or partly done:

- `frontend/src/gpuFlow/GpuFlow/domControlPlane.tsx` mounts visible retained DOM controls.
- DOM control projection is updated imperatively through viewport overlay management.
- The surface compositor already has actor and transaction vocabulary.
- Existing Playwright tests cover some activation, scroll, visual parity, and performance paths.

Not done yet:

- `GpuFlowDomControlPlane` is rendered from `sourceRetainedRuntimeFrame`, which can use `retainedPreparationRuntimeFrame`.
- Retained canvas content is rendered from `publishedRetainedRuntimeFrame`, after `resolveRetainedDisplayFrameTransaction` may hold a previous frame or publish a cold placeholder.
- DOM controls, DOM islands, retained pages, and hit testing are not guaranteed to share one committed display-frame id.
- Retained DOM-control actor snapshots still model passive controls as retained-content/layoutsubtree actors instead of true DOM surface actors.
- Wheel pan/zoom can still be interrupted by `.nopan` event targets during a gesture.
- Visible DOM-control completeness is not yet a first-class display transaction requirement.
- Existing tests did not capture the exact observed failure strongly enough, so new red tests are required.

This will be progress because it changes the ownership boundary, not just the rendering mechanism. The current DOM control plane is an overlay beside the retained compositor. The refactor makes it a first-class committed surface actor within the compositor contract.

## Current Failure Model

The observed failures fit one common model: visible layers are sampled from different generations.

Examples:

- Retained pages can hold the previous coherent frame while the DOM control plane advances to a prepared frame.
- Section scroll can update control geometry before canvas row labels, dividers, and backgrounds have published the same scroll sample.
- Activation can mount an active DOM editor while retained content around it is still transitioning through held or placeholder display states.
- Wheel pan starts on the canvas, then the next wheel event lands on a projected `.nopan` control and target-based handling preserves native wheel instead of preserving the pan gesture owner.
- Passive and active text-like controls use different visual contracts, so underlines/value extents can change on focus.

The answer is not more readiness patches around the old retained DOM-control texture path. The answer is one committed display transaction and one wheel gesture owner.

## Regression Policy

This refactor is not complete unless it does both of these things:

1. Adds realistic tests that assert observed behavior.
2. Actually runs the full GPU Flow-related test suite before calling the work done.

Focused red tests are the first gate, not the only gate. The implementation must prove the exact reported failure is fixed and also prove adjacent GPU Flow behavior did not regress.

Observed-behavior tests should assert what a user or browser frame timeline can observe:

- screenshots, pixel/ink bounds, and visual placeholder-band analysis
- DOM focus, active element, and bounding boxes
- viewport pan/zoom movement
- retained section scroll movement
- wheel gesture ownership as visible viewport/section/editor behavior
- frame cadence, rAF intervals, slow-frame ratio, and long tasks
- mounted DOM actor count only as a resource-scale outcome

Tests must not primarily assert implementation details:

- retained publication outcome names
- texture upload counts
- source descriptor counts
- queue method calls
- internal compositor branch choices
- actor generation ids as the pass/fail condition

Implementation diagnostics are still useful. They should be attached to failure details and performance reports, but they cannot replace observed-behavior assertions.

Running only the new spec, only a hand-picked Playwright file, or only Vitest is not enough. The full GPU Flow-related verification list in this plan is mandatory. If a command is too broad for one local run, it may be split into documented shards, but every shard must run. A failure must be fixed or explicitly reclassified with evidence that it is unrelated to GPU Flow.

Final implementation notes must include:

- the fail-first tests that were added or strengthened
- the command/result proving they failed before the refactor
- the command/result proving they passed after the refactor
- every full-suite command or shard that was run
- any failures, with evidence for unrelated reclassification
- frame cadence results for the large-scene gestures
- CDP visual verification of the original reported interaction path

## Ideas To Borrow From The Example Repos

Use `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` as design references, not as packages to copy.

From `html-in-canvas-official/README.md`:

- DOM location, hit testing, accessibility, focus, and input state are first-class browser behavior.
- Canvas drawing and DOM hit-test projection must be synchronized by an explicit transform contract.
- Paint readiness is part of correctness. Calling capture/draw APIs before a paintable state should block or throw, not publish blank success.

From `three-html-render/src/interactionManager.ts` and `src/interactionManagerStandalone.ts`:

- Projection should be an imperative manager that computes CSS transforms from scene/camera/viewport state.
- DOM elements should remain real and interactive while transforms move them.
- Visibility must also control pointer events. Setta should translate that idea to clip-chain visibility rather than 3D backface culling.

From `three-html-render/src/htmlInCanvasPolyfill.ts`:

- Dirty state, mutation observation, resize observation, and requested paint are explicit scheduling inputs.
- Missing snapshots are explicit invalid states. They are not valid blank frames.
- Dynamic form state needs deliberate synchronization whenever cloning/snapshotting is involved. For Setta's visible controls, avoid snapshotting as the normal correctness path.

From `html-in-canvas-cracks/src/main.js`:

- Keep the primary coordinate system in CSS pixels.
- Make scroll and resize terms explicit in projection math so content does not drift.
- Keep resource identity stable across resize and update content deliberately.
- Add debug views or diagnostics that compare source DOM, captured/rendered content, and final composite.

From `compiz-web/src/transitions/TransitionEngine.ts`:

- HTML texture capture is useful for compositing/effects after the browser has a paintable DOM state.
- It is not a good correctness path for frequent form interaction in a large retained scene.

The main thing not to borrow is full-page HTML texture capture every frame. Setta needs large-scene performance, so visible controls should be virtualized, projected, and committed coherently.

## Target Architecture

### One Committed Display Frame

Introduce a single committed GPU Flow display-frame contract, for example `GpuFlowCommittedSurfaceFrame`.

It owns:

- display frame id
- scene revision
- viewport revision and viewport state
- retained scroll revision and offsets
- retained GPU page actors
- projected DOM-control actors
- native DOM island actors
- hit-test generation
- clip-chain revision
- z-order
- interaction owner state
- display completeness status
- diagnostics

Only this committed frame may drive visible canvas content, projected DOM controls, DOM islands, hit testing, and debug snapshots. Prepared frames may build work queues and candidates, but they do not update visible DOM.

### Surface Actor Generations

Model every visible projected thing as a surface actor generation.

Each generation includes:

- stable actor id
- kind: `retained-page`, `dom-control`, `dom-island`, or similar
- owning retained surface id
- row/control/island id when relevant
- flow-space rect
- source rect
- clip chain
- z-order
- retained section scroll sample
- value/style revision for DOM controls
- focus/active state
- mount readiness
- projection readiness
- pointer and wheel policy

The compositor commits a coherent set of actor generations. If a new retained scroll sample cannot be displayed by both retained pages and DOM actors, hold the previous coherent committed frame together.

### DOM Control Actor Runtime

Replace the current React-driven `GpuFlowDomControlPlane` contract with a compositor-owned DOM actor runtime.

Responsibilities:

- Mount only visible and near-visible DOM controls.
- Keep mounted count proportional to visible rows plus bounded overscan.
- Project actors from committed flow rects to viewport CSS pixels using the live viewport transform and the committed retained scroll sample.
- Clip actors to viewport, section content, retained section scroll window, nested parent clips, and z-order boundaries.
- Batch style writes outside React render.
- Avoid layout reads during pan and zoom.
- Preserve native focus, selection, IME, clipboard, and accessibility behavior.
- Expose actor diagnostics for recording and failure attachments.

Required invariant:

```text
visible DOM rect = project(committed flow rect, committed scroll sample, live viewport transform, committed clip chain)
```

Forbidden invariant:

```text
visible DOM rect = project(prepared frame rect, live viewport) while retained canvas shows a previous published frame
```

### Structural Retained Pages

Retained GPU pages should render structural section content, not DOM-owned text input values.

Keep in retained pages:

- section shells
- row labels
- row backgrounds
- dividers
- scrollbars
- hover/selection states
- canvas-native controls
- non-interactive decoration

Move out of retained pages:

- text-like input value pixels
- caret and selection
- active editor visuals
- passive text-like previews that must remain editable/selectable
- DOM-control texture readiness gates

Retained pages reserve the control rect. DOM actors render the control itself.

### Stable Passive And Active Hosts

Each visible text-like control gets one stable projected DOM host.

Inside that host:

- passive display and active editing share dimensions, clipping, padding, line-height, font metrics, and underline geometry
- passive display remains visible until the active editor is ready
- activation swaps internal content without changing projection layer
- focus does not reparent the control to a different coordinate system
- active-only details such as caret and selection stay inside the same host

This targets the focus flash, active handoff blanking, and inactive-vs-active underline width mismatch.

### Wheel Gesture Ownership Arbiter

Replace target-by-target wheel branching with a latched wheel gesture owner.

The first wheel event in a burst decides the owner:

- viewport pan
- viewport zoom
- retained section scroll
- focused editor scroll
- native page scroll, only where explicitly allowed

Rules:

- If viewport pan-on-scroll owns a burst, it keeps ownership even when the pointer moves over projected DOM controls.
- Retained section scroll can start only when viewport pan/zoom speed and wheel-burst ownership are idle.
- A focused multiline editor consumes wheel only when it can scroll in the wheel direction.
- Clipped, hidden, or parked DOM actors cannot own wheel or pointer events.
- Ownership changes are logged as gesture events, not inferred indirectly from event target changes.

### Frame Completeness

Visible nonempty DOM controls are part of display-frame completeness.

Rules:

- A committed frame with a visible nonempty DOM-control actor is complete only if that actor is mounted and projected, or the previous coherent actor generation is held together with the previous coherent canvas frame.
- A missing visible control is a frame hole.
- A cold placeholder cannot be a success state for a visible nonempty control.
- If DOM projection is late, block the first cold frame or hold the previous coherent display frame.

### Performance Model

Pan and zoom should be projection-only for DOM actors and transform-only for retained surfaces wherever possible.

Targets:

- no React rerender for every viewport frame
- no large texture uploads caused by text input activation
- no layout reads during pan/zoom projection
- bounded style writes per visible actor
- mounted DOM controls proportional to visible rows plus overscan
- no long task above 50 ms during measured gestures
- strict local 120 fps-class target on capable hardware: p95 frame interval at or below 8.5 ms, p99 at or below 16.7 ms, slow-frame ratio below 5 percent

CI or 60 Hz-capped environments should run the same scenarios with refresh-aware reporting. If strict 120 fps-class performance is not achievable locally, capture before/after traces and add an append-only `perf/` report with a fixed evidence-backed fallback budget. Do not accept open-ended "best effort" budgets.

### 120 FPS-Class Performance Gate

Performance tests are a required part of this refactor, not optional diagnostics.

The target scene must be large and complex, comparable to the Settings project's All Settings page:

- more than 30 visible or near-visible nodes after opening the full settings view
- hundreds of retained rows
- multiple retained surface ids
- mixed control families, including text-like inputs, switches, dropdowns, nested rows, color controls, and scrollable retained sections
- enough visible projected DOM controls to exercise virtualization, clipping, and projection batching

Required measured gestures:

- viewport panning over empty canvas regions
- viewport panning while the pointer crosses retained sections and projected DOM controls
- viewport zooming over canvas content
- retained-hover zooming over dense retained content
- retained section wheel scrolling
- retained section scroll followed immediately by viewport pan and zoom
- focused text-like input during pan, zoom, and retained section scroll

Strict local target on hardware/browser setups capable of measuring 120 Hz or higher:

- p95 frame interval at or below 8.5 ms for each measured gesture
- p99 frame interval at or below 16.7 ms
- slow-frame ratio below 5 percent, where slow means above 8.5 ms in strict mode
- no long task above 50 ms during the measured gesture
- no visible blanks, stale input values, placeholder bands, or control/row drift after the gesture settles
- retained section scroll changes retained section scroll state, not native page scroll

CI and 60 Hz-capped environments cannot prove strict 120 fps. They still must run the same scenarios with refresh-aware reporting:

- record the browser rAF/display cadence baseline before the gesture
- classify the result lane, for example `strict-120hz` or `refresh-aware`
- assert the gesture stays close to the measured baseline instead of adding large stalls
- include strict 120 fps deltas in failure details even when the environment cannot satisfy them
- never loosen visual correctness requirements because the refresh-rate lane is lower

If 120 fps-class performance is genuinely impossible after the refactor, the fallback must be explicit and evidence-backed:

- capture before/after Chrome traces for the same large-scene pan, zoom, retained-hover zoom, and retained section scroll gestures
- add an append-only `perf/` report describing the bottleneck and the fixed fallback budget
- choose a fixed budget still in the same range, for example around 10 to 12 ms p95, only if traces show why 8.5 ms is unrealistic
- do not accept broad 20 to 36 ms allowances for the strict local lane

## Execution Plan

### 1. Create Red Observed-Behavior Tests

Before changing runtime code, create or strengthen Playwright tests that fail on the current implementation and capture the exact issue.

Use a new spec such as:

```text
frontend/tests/e2e/settings/settings-retained-committed-surface-actor-regressions.spec.ts
```

The tests must assert observed behavior, not implementation details. Debug APIs may locate rows and attach failure details, but the pass/fail signal should come from screenshots, DOM bounding boxes, focus state, viewport movement, frame cadence, long tasks, and visible scroll behavior.

Required red tests:

1. Wheel pan ownership persists across projected controls.
   - Start pan-on-scroll on the canvas.
   - Move the pointer into a retained section/control column during the same wheel burst.
   - Assert viewport position keeps changing at the expected rate.
   - Assert retained section scroll does not activate until viewport pan ownership is idle.
   - Measure rAF frame intervals during the gesture.

2. Retained section scroll keeps DOM controls visually synchronized.
   - Open All Settings or the section sizing policy retained surface.
   - Scroll the retained section.
   - Capture frames during the scroll.
   - Assert DOM value ink, row labels, separators, and control rects move together within a small pixel tolerance.
   - Assert no focused or passive control remains screen-fixed while its row moves.

3. Text input activation does not flash or blank surrounding content.
   - Capture the row and surrounding section before click.
   - Click a visible text-like control.
   - Capture the next several animation frames.
   - Assert no high-confidence placeholder band appears.
   - Assert value ink remains visible until the active editor is visible.
   - Measure click-to-focus frame cadence and long tasks.

4. Passive and active visual extents match.
   - Compare inactive and active value/underline extents for the same control.
   - Assert the right edge, left edge, and height remain within tolerance.
   - Use pixel or ink bounds rather than renderer names.

5. Focused controls follow pan, zoom, and retained section scroll.
   - Activate a text-like control.
   - Pan, zoom, and scroll the retained section while focused.
   - Assert active editor bounding rect tracks the row/control rect.
   - Assert focus remains on the editor while it remains visible or is explicitly blurred before unmount.

6. Large-scene interaction remains within frame budget.
   - Use a large complex scene similar to the Settings project's All Settings page.
   - Measure viewport pan, viewport zoom, retained-hover zoom, retained section scroll, scroll-then-zoom, and focused-input pan/zoom/scroll.
   - Assert p95/p99/slow-frame ratio against the measured cadence lane, with strict 120 fps-class thresholds where the environment supports them.
   - Assert no long task above budget and no visible blanks after settling.

Run these tests before implementation and record the failing output in the implementation notes. They are not optional. Existing tests count only if they are shown to fail on the current code for the exact observed issue.

### 2. Define The Committed Display-Frame Contract

Add the `GpuFlowCommittedSurfaceFrame` types and constructor.

Expected write area:

- `frontend/src/gpuFlow/surfaceCompositor/*`
- a new module such as `frontend/src/gpuFlow/committedSurfaceFrame.ts`
- tests under `frontend/src/gpuFlow/surfaceCompositor`

This step should make frame ids, actor ids, scroll samples, clip-chain revisions, hit-test generations, and completeness explicit.

### 3. Move Visible Output To The Committed Boundary

Refactor `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx` and `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx`.

Requirements:

- Visible canvas content consumes the committed frame.
- Projected DOM controls consume the same committed frame.
- DOM islands consume the same committed frame.
- Hit testing and debug snapshots expose the same committed frame id.
- `sourceRetainedRuntimeFrame` cannot drive visible DOM when it differs from the published retained frame.
- Prepared retained frames can build work, but not visible DOM output.

### 4. Promote DOM Controls To Surface Actors

Replace retained DOM-control snapshots as retained-content/layoutsubtree actors with true DOM-control actor generations.

Requirements:

- actor generation includes value/style revision, active state, focus identity, clip chain, and scroll sample
- completeness requires visible nonempty actors to be mounted/projected
- passive and active states are two states of the same actor host
- actor diagnostics report committed frame id and projection status

### 5. Build The DOM Actor Runtime

Implement a compositor-owned imperative runtime for DOM actors.

Requirements:

- stable keyed hosts
- bounded overscan
- projection from committed geometry plus live viewport transform
- clip-aware pointer events
- blur-before-unmount for focused controls that leave overscan
- batched style writes
- no layout reads during pan/zoom
- diagnostics for mounted actors, visible actors, clipped actors, projection duration, style writes, and layout reads

This runtime should replace the current `GpuFlowDomControlPlane` once it owns the complete DOM actor lifecycle.

### 6. Unify Passive And Active Text Presentation

Refactor retained text-like rendering so passive and active modes share one projected host and one visual contract.

Requirements:

- same host dimensions
- same padding and font metrics
- same underline geometry
- same clipping
- passive remains visible until active editor is ready
- activation does not change coordinate systems

### 7. Rewrite Wheel Ownership

Add a shared wheel gesture ownership arbiter.

Expected write area:

- `frontend/src/gpuFlow/interactions/panZoom.ts`
- retained content scroll interaction modules
- a new module such as `frontend/src/gpuFlow/interactions/wheelGestureOwnership.ts`

Update unit tests that currently encode target-by-target `.nopan` behavior when that behavior conflicts with burst ownership.

### 8. Make Scroll And Clip Coherence Transactional

Tie retained section scroll offsets, DOM actor projection, clip chains, and retained page display to the same committed frame.

If retained section scroll produces a new sample:

- commit canvas and DOM together, or
- hold the previous coherent frame together

Never advance DOM controls to a new section scroll sample while row labels, separators, or backgrounds are held from the previous sample.

### 9. Delete The Old Correctness Path

After the behavior tests pass, remove dead compatibility code rather than preserving it.

Remove or rewrite:

- retained DOM-control texture/snapshot correctness paths
- source-count readiness filters for retained DOM-control snapshots
- active overlay reparenting paths for retained DOM controls
- diagnostics that only describe deleted retained DOM-control snapshot behavior
- tests whose primary assertion is texture upload counts, source descriptor counts, queue calls, or retained publication state names for text-like controls

Keep diagnostics for visible actors, projection, coherent display commits, and frame cadence.

### 10. Re-Measure Performance

Measure before and after on the same large retained settings scene.

Scenarios:

- viewport pan
- viewport zoom
- retained-hover zoom
- retained section scroll
- scroll followed by zoom
- click-to-focus
- focused input during pan, zoom, and retained section scroll

Record:

- frame interval p95/p99/max
- refresh-rate lane and measured rAF baseline
- slow-frame ratio
- long tasks
- mounted DOM actor count
- projection batch duration
- style writes per frame
- layout reads per frame
- texture uploads caused by interaction
- screenshots before, during, and after settling

Add `perf/` reports only when trace-backed fallback budgets or before/after records are needed.

### 11. Final Verification

Run targeted tests first, then the full GPU Flow-related suite. This is a release gate for the refactor, not a suggested checklist.

Required verification:

- the new fail-first observed-regression Playwright spec
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/editor`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/sections`
- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run tests/e2e/gpuFlowPerformanceProbe.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowInteractionLatencyProbe.test.ts`
- `SETTA_RETAINED_COMPOSITOR_STRICT_120HZ=1 ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- `./scripts/quality/check.sh`
- Chrome DevTools visual verification of the exact interaction paths from the recording

If a broad command must be sharded, document every shard and run all shards. Do not drop a suite because it is slow. Do not call the refactor complete until this list has run cleanly or every non-clean result has documented evidence showing it is unrelated to GPU Flow.

## Acceptance Criteria

- The new observed-behavior tests fail on the current implementation and pass after the refactor.
- Wheel pan continues through projected retained DOM controls during the same wheel burst.
- Retained section scroll activates only when viewport pan/zoom ownership is idle.
- DOM controls, row labels, row dividers, scrollbars, and retained section clips stay visually synchronized during retained section scroll.
- Clicking a text-like input does not flash, blank surrounding content, or publish a visible placeholder band.
- Passive and active text-like control extents match within visual tolerance.
- Focused controls follow pan, zoom, and retained section scroll.
- DOM controls and retained GPU pages are sampled from one committed display frame.
- Visible nonempty DOM controls are display-frame completeness requirements.
- Mounted DOM actor count scales with viewport plus overscan, not total settings size.
- Pan/zoom projection does not require React rerendering or large retained texture uploads per frame.
- The old retained DOM-control texture correctness path is removed.
- The full GPU Flow-related verification suite is clean, or every non-clean result has evidence showing it is unrelated to GPU Flow.

## Explicit Non-Goals

- No backward compatibility shim for the old retained DOM-control texture path.
- No feature flag that keeps old and new correctness paths alive.
- No transitional dual-write or dual-read path.
- No heuristic fallback that publishes blank or stale controls.
- No tests whose primary pass condition is an implementation detail.
- No full-page HTML texture capture for normal Setta retained section input rendering.
- No broad rewrite of unrelated app UI.
