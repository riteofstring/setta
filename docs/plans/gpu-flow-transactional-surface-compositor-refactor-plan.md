# GPU Flow Transactional Surface Compositor Refactor Plan

## Goal

Replace the current retained-content visual-continuity fixups with a more
principled surface compositor architecture for GPU Flow.

The target behavior is simple and user-visible:

- All Settings and similarly dense GPU Flow scenes stay visually complete during
  pan, zoom, retained section scroll, mixed scroll-plus-zoom, and retained
  control interaction.
- Frame cadence is 120 fps-class on hardware and browser configurations whose
  measured idle/display baseline supports it.
- No frame is published with blank retained rows, horizontal placeholder bands,
  stale visible row holes, or native page scroll leakage.
- No backward compatibility path, migration bridge, feature flag, or transitional
  dual renderer is required. Replace the old path cleanly.

## Problem Statement

The current renderer has the right broad idea: real DOM sources under
`<canvas layoutsubtree>`, cached textures, retained parameter pages, DOM islands
for active native controls, and a fast runtime viewport path. The failure mode is
that those responsibilities are split across several systems that can disagree
inside one visible frame:

- retained runtime sampling
- retained page preparation
- text-like row snapshot source readiness
- retained page maintenance and repair
- DOM section texture upload
- native visual overlays
- active DOM island publication
- interaction hit projection

When those systems disagree, the user sees the result as frame gaps, blank
retained rows, stale or missing row content, placeholder bands, or a scroll/zoom
gesture that falls below the display refresh class. The more principled fix is
to make GPU Flow a transactional surface compositor:

1. The viewport/runtime produces a motion frame.
2. Surface owners produce immutable surface generations.
3. The compositor resolves complete visible coverage from current or compatible
   prior generations.
4. The compositor publishes exactly one display transaction.
5. If the visible region is not completely drawable, the previous compatible
   display transaction remains on screen while work is scheduled.

This makes "do not show blanks" and "do not block interaction frames with
unbounded repair" core renderer invariants rather than post-facto repair logic.

## Scope Discipline

This refactor must be implemented as a deletion-driven vertical slice, not as a
parallel renderer that grows beside the current retained path.

The first production slice is:

1. retained parameter content surface generations
2. retained text-like snapshot generations
3. retained section scroll as runtime motion
4. mixed retained-scroll-plus-viewport-zoom
5. active retained control interaction followed by pan or zoom

DOM sections, edge labels, selection/resize/drag overlays, and other visual
surfaces still belong in the final architecture, but they should migrate only
after the retained-scroll slice proves the transaction model and after any
replaced retained repair/publication code for that slice is deleted.

Do not expand the plan by adding a fallback DOM renderer, a compatibility mode,
a second long-lived compositor stack, or broad abstractions that are not needed
by the current production slice. Each milestone should either move an existing
surface into the transaction model or remove code that the transaction model has
replaced.

## Regression Prevention Requirements

Regression prevention is a hard requirement for this refactor, not a cleanup
activity at the end.

### Realistic Observed-Behavior Tests

Automated browser tests must exercise realistic GPU Flow usage and assert
observable behavior:

- large All Settings scenes with hundreds of retained rows and mixed retained
  control kinds
- cold and warm pan, zoom, retained section scroll, mixed scroll-plus-zoom, and
  retained-control interaction
- continuous visual sampling during gestures, not only before/after screenshots
- frame cadence, long tasks, native page scroll ownership, scroll signature,
  visible blank rows, placeholder bands, and active control alignment

Tests must not pass by asserting renderer internals such as a specific manager
method call, cache key, repair pass count, or private texture state. Pure unit
tests may cover compositor contracts, but the browser regression gates must be
based on user-visible behavior.

### 120 FPS-Class Performance Tests

Performance tests are required for the primary interaction workloads, not just
visual correctness. The canonical required gate must run against the Settings
project's real All Settings page: hundreds of retained rows, many GPU Flow
nodes, multiple retained surfaces, mixed retained control kinds, nested
sections, DOM sections, overlays, and active native-control paths. Synthetic
fixtures may be added as supplemental stress coverage, but they cannot replace
the real All Settings performance gate and must be kept in sync with the All
Settings scene shape.

Required measured workloads:

- viewport panning across the large scene
- viewport zooming from both empty canvas and retained-content hover points
- retained section scrolling inside a large retained surface
- retained section scroll immediately followed by viewport zoom
- retained control interaction followed by pan or zoom

Required 120 fps-class target:

- measure idle/display RAF baseline before the workload
- when the measured baseline supports 120 Hz-class rendering, gesture p95 frame
  interval must be at or below `8.33ms`
- p99 must be no worse than one missed 120 Hz frame
- no long task above `50ms`
- no repeated multi-frame gaps during continuous input
- retained section scroll must meet the same cadence class as pan and zoom; it
  cannot be accepted at sustained 60 Hz-class cadence on a 120 Hz-capable
  baseline

If 120 fps-class behavior is impossible on a specific machine, browser, or
display configuration, the test report must prove that rather than silently
lowering the bar. The report must include idle/display baseline, hardware,
browser version, display refresh class, scene size, before/after gesture
metrics, and the limiting factor. The fallback target must stay in the measured
refresh-rate range: p95 near the measured idle/display cadence, p99 no worse
than one missed frame at the measured refresh class, no repeated multi-frame
gaps, and no repair/refinement long tasks during the gesture. A broad CI cap
such as `45ms` p95 is not acceptable evidence for this refactor.

### Full GPU Flow-Related Suite Gate

Selective test runs are useful during implementation, but they are not
acceptance evidence. Before the refactor can be considered complete, the full
automatic GPU Flow-related suite must pass on the final code after all
follow-up fixes.

Minimum required Vitest gate:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow \
  src/components/Pages/Project/GpuProjectSurface \
  src/components/Pages/Project/GpuProjectSurface.grid.test.ts \
  src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts \
  src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts \
  src/components/Pages/Project/gpuProjectEdgeScene.test.ts \
  src/components/Pages/Project/gpuProjectInteractionGuards.test.ts \
  src/components/Pages/Project/gpuProjectPaneEvents.test.ts \
  tests/e2e/gpuFlowInteractionLatencyProbe.test.ts \
  tests/e2e/gpuFlowLargeGraphStressFixture.test.ts \
  tests/e2e/gpuFlowPerformanceProbe.test.ts \
  tests/e2e/gpuFlowVisualParityProbe.test.ts
```

Minimum required Playwright gate:

```sh
./scripts/run-playwright-e2e.sh \
  frontend/tests/e2e/gpu-flow/*.spec.ts \
  frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts \
  frontend/tests/e2e/settings/settings-retained-*.spec.ts
```

The manual Chrome trace spec is not a substitute for the automatic suite. Run
it when producing trace artifacts, or explicitly document why it was omitted.

Any failure in these gates blocks completion. If a fix is made after a failure,
the relevant targeted test may be run first, but the full GPU Flow-related
suite must be rerun before final acceptance. The final report must include the
commands, pass/fail result, and any intentionally omitted manual-only checks.

## Evidence To Preserve

Existing reports already capture the shape of the issue:

- `perf/reports/retained-text-like-row-diagnostics-20260513.md`
  - worst passive readiness: hundreds of missing and blank passive rows
  - long frame gaps and long tasks during retained text-like row churn
  - conclusion: row-owned passive snapshot lifecycle is needed
- `perf/reports/gpu-flow-pan-zoom-runtime-baseline-20260513.md`
  - synchronous viewport-store fanout blocked dense pan/zoom interaction
  - the frame renderer itself was not the main bottleneck
- `perf/reports/gpu-flow-visual-continuity-refactor-after-20260516.md`
  - current repair-based path can avoid visible blanks, but the retained scroll
    sample still shows p95 frame interval around `16.8ms`
  - the report explicitly does not claim true 120 Hz behavior

The new plan keeps the visual-continuity requirements but removes the repair
architecture as the end state.

## Ideas To Borrow From The Example Repos

### WICG html-in-canvas explainer

Borrow:

- Treat canvas children as real source DOM with strict direct-child ownership.
- Use the browser `paint` event and `requestPaint()` as the source invalidation
  boundary.
- Keep source DOM transforms synchronized with drawn location for accessibility,
  hit testing, and native browser interaction.
- Respect the contract that DOM changes made in a `paint` handler land on a
  later snapshot, not the currently drawn frame.

Implication for Setta:

- Surface source readiness must be explicit. A display transaction must know
  whether it is drawing from a current, compatible, stale, or unavailable source
  generation.

### `three-html-render`

Borrow:

- Model HTML content as a texture owned by a source element, not as an incidental
  upload side effect.
- Keep source element, texture identity, and interaction projection connected.
- Use a single per-frame transform for DOM interaction alignment.
- Stop propagation on active DOM surfaces so canvas gestures and native control
  behavior do not fight each other.

Implication for Setta:

- Replace scattered texture/page records with explicit `SurfaceTextureHandle`
  objects keyed by surface actor and generation.
- Make interaction projection a compositor service instead of a collection of
  retained-control special cases.

### `random-stuff/apps/curved-markup`

Borrow:

- For complex surfaces, pointer projection can be event-driven: raycast or hit
  map to texture-local coordinates, then move the real DOM element so native DOM
  hit testing handles the event.
- Only the element under interaction needs native alignment. Passive sources can
  stay parked in capture state.

Implication for Setta:

- Passive retained rows and DOM sections should not be transformed every frame.
  The compositor should align only the current handoff source or DOM island.

### `compiz-web`

Borrow:

- Treat a page transition as a two-texture transaction: old snapshot remains
  valid until the new snapshot is paint-ready.
- Wait for paint readiness before starting a visible transition.
- Separate passthrough display from active transition/effect display.

Implication for Setta:

- Retained scroll and viewport zoom should keep drawing a compatible previous
  surface generation until the exact next generation is ready. The visible
  display should never expose intermediate texture debt.

### `html-in-canvas-cracks`

Borrow:

- Coalesce paint work with a single scheduled RAF.
- Clamp DPR and texture sizes to GPU limits before upload.
- Preserve JavaScript texture object identity across resizes while forcing GPU
  allocation refresh when backing size changes.
- Use live uniforms for motion state instead of recreating texture state for
  every scroll frame.

Implication for Setta:

- Texture identity and GPU allocation identity should be separate concepts.
- Scroll, pan, and zoom should be uniform/transform updates on already published
  surfaces whenever coverage is available.

### What Not To Borrow

- Do not adopt SVG/foreignObject fallback rasterization for the production GPU
  Flow path. Setta already requires native html-in-canvas/WebGPU capability.
- Do not use a whole-page snapshot as the primary architecture. Setta needs
  per-surface hit testing, retained control rows, clipping, nesting, and active
  native controls.
- Do not add a fallback DOM renderer or compatibility mode for this refactor.

## Target Architecture

### Surface Actors

Introduce a `gpuFlow/surfaceCompositor/` module with one owner model for every
drawable surface class:

- DOM section surfaces
- retained parameter content surfaces
- retained text-like snapshot surfaces
- edge label and selection/resize/drag overlay surfaces
- active DOM islands
- native retained visuals such as hover, scrollbars, switches, and popups

Each `SurfaceActor` owns:

- stable surface id
- source DOM policy, if any
- flow-space bounds and clip chain
- content generation id
- visual generation id
- texture handles or native draw commands
- hit projection metadata
- active interaction state
- current, compatible previous, and pending generations

The compositor consumes actors. React/project state updates create actor
generations; they do not directly decide what a visible frame may publish.

### Surface Generations

A generation is immutable once handed to the compositor:

- `generationId`
- `surfaceId`
- `sourceKey`
- `contentVersion`
- `visualVersion`
- `flowRect`
- `clipRect`
- `sourceWindow`
- `fidelity`
- `paintReadiness`
- `textureReadiness`
- `hitIndex`

Visible frames are built from generation snapshots, not mutable manager state.
This prevents a frame from combining a new hit map, old texture, and missing
text-like snapshot.

### Unified Coverage Store

Replace the split retained-page coverage and DOM texture lifecycle with a
single coverage store:

- coverage is indexed in flow-space and source-space
- coverage entries reference immutable surface generations
- entries can be exact, compatible, or rejected with a concrete reason
- coverage queries return a complete draw plan or a blocked transaction
- compatible prior coverage is drawable while exact coverage is pending
- true holes are never drawable

Retained parameter pages can still be tiled internally, but the compositor
should not special-case retained content as a separate publication path.

### Publication Transactions

Every visible frame resolves a `SurfaceDisplayTransaction`:

- motion frame: viewport, scroll offsets, pointer handoff state, active islands
- desired surface generations
- complete visible coverage proof
- draw command list
- hit index
- active DOM island transaction
- follow-up work requests
- diagnostics

The display transaction has only two outcomes:

- publish: coverage is complete and hit/DOM island state is coherent
- hold previous: exact coverage is pending and compatible previous display is
  still valid

No path should publish a transaction that contains a true visual hole.

Cold first-load has no compatible previous transaction. For cold first coverage,
the compositor may publish only explicitly intentional non-content visuals such
as a stable loading/background state, or it may hold canvas publication until the
first visible coverage transaction is drawable. Cold load must not reuse the
same "hold previous" language, because there is no previous coherent hit/visual
state to hold.

Compatible previous coverage is valid only when the previous transaction remains
coherent for the desired surface generation. Reject compatibility when any of
these differ in a way the coverage proof cannot explicitly map:

- `surfaceId`
- `sourceKey`
- `contentVersion`
- `visualVersion`
- theme generation
- clip chain or flow-space bounds
- source window or content-to-texture mapping
- text-like snapshot source generation
- active DOM island identity or geometry
- hit index generation

Holding a previous transaction must hold previous visuals and previous hit state
together. Do not publish a new hit index over old visuals, or old visuals with a
new active DOM island transaction.

### Runtime Motion Path

Pan, zoom, retained section scroll, and mixed gestures should update only:

- runtime viewport tuple
- retained scroll offset tuple
- camera/uniform buffers
- active handoff transform, if any
- native visual transient state

They should not synchronously:

- force React renders
- rewrite all source transforms
- upload passive DOM textures
- rasterize retained pages
- recompute all retained row descriptors
- publish broad diagnostics

### Paint And Upload Scheduler

Use one scheduler for DOM source and retained display-list texture work:

- dirty source coalescing through RAF
- explicit paint readiness from canvas `paint` events
- visible-edge priority for first-time coverage
- idle priority for refinements
- stable texture handle with replaceable GPU allocation
- max texture/DPR clamps before allocation
- separate budgets for interaction frames and idle catch-up

Interaction frames can schedule work but should only execute work that is known
to fit the interaction budget and is needed for a publishable visible frame.

### Interaction Projection

Create a single compositor-owned interaction projector:

- resolves the topmost visual surface under the pointer
- maps pointer to source-local coordinates
- aligns only the active source element or active DOM island
- parks non-active sources
- captures/release pointer ownership consistently
- stops propagation from native DOM controls into canvas gestures

This replaces duplicated handoff behavior across retained controls, DOM islands,
and overlay sources.

## Implementation Plan

### 1. Create Failing Observed-Behavior Tests First

Add the failing tests before changing renderer behavior. These tests must assert
what the user observes, not internal implementation details.

Create a new Playwright spec:

`frontend/tests/e2e/settings/settings-retained-compositor-transactional-performance.spec.ts`

The spec should:

- open `/settings`
- switch to All Settings
- require a large scene with at least:
  - `> 30` GPU nodes
  - `> 400` retained rows
  - `> 4` retained surfaces
  - retained control kinds including text-like, switch, dropdown, color-picker,
    and nested rows
- measure idle/display RAF baseline before the gesture run
- sample visual output continuously during gestures, not only before/after
- perform cold and warm gestures:
  - viewport pan
  - viewport zoom
  - zoom while hovering retained text-like content
  - retained section scroll
  - retained section scroll immediately followed by zoom
  - switch interaction followed by zoom
- assert observed behavior:
  - p95 frame interval is at or below `8.33ms` when the measured idle/display
    baseline supports 120 fps-class rendering
  - p99 is no worse than one missed 120 Hz frame
  - no long task above `50ms`
  - no repeated multi-frame gaps during continuous pan, zoom, or retained
    section scroll input
  - no native page scroll while the retained section owns the gesture
  - retained scroll signature changes during retained section scroll
  - retained section scroll stays in the same measured refresh-rate class as
    pan and zoom
  - no sampled frame has high-confidence horizontal placeholder bands
  - sampled retained visual nonblank ratio does not materially drop during the
    gesture
  - no visible retained row is fully blank for two consecutive sampled frames

This should fail on the current architecture, especially retained section
scroll and mixed scroll-plus-zoom, where the representative post-fix report
still showed retained scroll p95 around `16.8ms`.

Also add a report stub under `perf/reports/` for the failing run. The report
should record:

- browser version
- OS and hardware
- display refresh baseline
- scene size
- gesture metrics
- visual sample statistics
- failure reason

The failure is intentional, but it must not become a permanently failing
checked-in gate. Record the failing run and report first, then keep the spec in
the suite with the strict target and make it pass through the refactor. Do not
loosen this first test to match the existing renderer.

### 2. Freeze The New Surface Compositor Contract

Add pure TypeScript contracts under:

`frontend/src/gpuFlow/surfaceCompositor/`

Initial files:

- `surfaceActor.ts`
- `surfaceGeneration.ts`
- `surfaceCoverage.ts`
- `surfaceTransaction.ts`
- `surfaceScheduler.ts`
- `surfaceDiagnostics.ts`

Add Vitest coverage for contract rules:

- a transaction with true holes cannot publish
- compatible previous coverage can publish while exact coverage is pending
- active DOM island publication is blocked if its visual coverage is incoherent
- a held transaction keeps previous hit state and previous visuals together
- surface generation ids are immutable within one transaction

These tests may use fake surfaces and fake textures. They should not import the
old retained page manager.

### 3. Build The Unified Coverage Store For The Retained Scroll Slice

Create a flow-space/source-space coverage index that can answer:

- what exact coverage exists for this visible rect
- what compatible prior coverage exists
- what is missing
- why a candidate was rejected
- which pages/textures must be protected from eviction
- which pending work would make the transaction publishable

Move retained page compatibility rules and DOM surface texture compatibility
rules into this store. Retained content can keep tiled rasterization as an
implementation detail, but coverage proof should be compositor-level.

Start with retained parameter content and retained text-like snapshots because
they are the weakest measured path. DOM surface texture compatibility can join
the same store after the retained-scroll transaction proof is passing.

Deletion checkpoint:

- remove the retained-only coverage publication path for the migrated retained
  slice once the new store owns exact, compatible, rejected, and missing proof

### 4. Convert Retained Parameter Content To Surface Actors

Move retained parameter content from ad hoc retained runtime/page publication
into the same actor model:

- retained content surface actor per parameter surface
- row display list generation
- text-like row snapshot generation
- popup/native visual generation
- retained scrollbar/native visual generation
- active DOM island generation

Text-like rows need row-owned passive snapshot lifecycle:

- owner-defined text-like presentation policy
- compact versus textarea behavior from project/section policy, not inferred
  from frontend-only fallback heuristics
- source readiness tracked per row snapshot generation
- stale compatible visible snapshot remains drawable until exact snapshot lands

Deletion checkpoint:

- remove migrated retained text-like snapshot readiness and publication logic
  from the old retained page manager path instead of adapting it twice

### 5. Move Retained Scroll Fully Onto The Runtime Motion Path

Retained section scroll currently remains the weakest large-scene gesture. Make
retained scroll offset changes equivalent to viewport motion before broadening
the actor conversion to DOM sections and overlays:

- update runtime scroll tuple
- draw using existing compatible coverage
- schedule exact newly visible coverage
- do not rasterize or upload unbounded retained pages inside the wheel event
- do not change native page scroll
- keep hit projection and visible rows coherent with the published transaction

This is the critical path for the 120 fps-class target and the first production
proof that the transaction model is not just another repair layer.

This step and the retained-slice publication step are one acceptance unit. It is
fine to implement them incrementally, but retained scroll must not be considered
complete while the old retained publication or pre-publish repair path still
owns visible correctness for migrated retained surfaces.

Deletion checkpoint:

- remove pre-publish retained-scroll repair as the steady-state mechanism for
  the migrated retained slice; missing exact coverage must be a blocked/held
  transaction plus scheduled work, not an unbounded synchronous repair loop

### 6. Replace Frame Publication For The Retained Slice

Refactor `GpuFlow/flowFrame.tsx` around the transaction for migrated retained
surfaces:

1. sample runtime motion
2. collect surface actor generations
3. query coverage
4. resolve publish or hold
5. render published transaction
6. schedule follow-up work
7. emit bounded diagnostics

Remove pre-publish retained repair loops as the steady-state mechanism. Missing
visible coverage should be represented as a blocked transaction plus scheduled
work, while the previous compatible display stays visible.

This is the publication counterpart to retained-scroll runtime motion. The
retained-scroll milestone is not accepted until this publication path, the
retained-scroll runtime path, and the associated deletion checkpoints all land
together.

Deletion checkpoint:

- delete or reduce `GpuFlow/flowRetainedPageMaintenance.ts` to scheduler-only
  follow-up work for migrated surfaces before expanding to less risky surface
  classes
- remove retained display-frame code paths that can publish only after
  synchronous true-hole repair

### 7. Convert DOM Section And Overlay Textures To Surface Actors

Replace direct frame-time DOM texture registration with actor generation
updates:

- DOM section source actor
- edge label actor
- selection actor
- resize actor
- drag preview actor
- source-local portal actor where needed

The frame path should consume actor generations and coverage. Dirty DOM source
changes should update source generation readiness through the scheduler.

### 8. Replace Interaction Projection

Create the compositor-owned projector and route these paths through it:

- pointer handoff to DOM section sources
- wheel handoff to DOM section sources
- retained text-like activation
- retained dropdown/color/date/password/dropzone controls
- active CodeMirror DOM islands
- canvas popups and viewport portals

The projector should align only the active source/island, and park or leave
passive sources in capture state.

### 9. Delete Replaced Legacy Code

Because no backward compatibility is required, remove replaced code rather than
keeping adapters.

Expected deletion or heavy replacement candidates:

- retained display publication repair loops in `GpuFlow/flowRetainedPageMaintenance.ts`
- retained-only publication state in `retainedDisplayFrame.ts`
- retained page manager responsibilities that move into the unified compositor
- duplicated source transform and pointer handoff paths
- broad frame-time retained diagnostics that are not bounded transaction
  diagnostics
- obsolete tests that assert manager internals instead of behavior or
  compositor contracts

Keep focused helpers only when they verify public behavior or pure contract
logic.

Do not defer all deletion to the final cleanup step. Each migrated surface class
must include its own deletion checkpoint, and completion is blocked if old and
new production publication paths remain active for the same surface.

### 10. Verification And Reports

Run the new failing spec after each milestone and keep the same metrics format.
Targeted milestone runs are useful for fast feedback, but they do not replace
the full GPU Flow-related suite gate in `Regression Prevention Requirements`.

Required final verification:

- new transactional performance Playwright spec passes
- existing retained visual continuity specs pass
- existing pan/zoom runtime specs pass
- retained control interaction specs pass
- focused compositor Vitest suite passes
- full GPU Flow-related Vitest gate passes on the final code
- full GPU Flow-related Playwright gate passes on the final code
- CDP visual verification on desktop and mobile-sized viewport
- before/after report under `perf/reports/`

The final report must include:

- idle/display baseline
- hardware, OS, browser version
- display refresh class
- scene size
- per-gesture p50/p95/p99/max frame intervals
- long tasks
- repeated multi-frame gap count
- visual sample statistics
- native page scroll check
- before/after comparison
- full GPU Flow-related Vitest command and result
- full GPU Flow-related Playwright command and result
- any manual-only trace checks run or intentionally omitted
- explanation if 120 fps-class behavior is impossible on that machine/browser

## Acceptance Criteria

- The first failing observed-behavior tests are added before renderer changes.
- Browser regression tests assert realistic observed behavior, not renderer
  implementation details.
- All Settings large-scene pan, zoom, retained scroll, mixed scroll-plus-zoom,
  and switch-plus-zoom pass 120 fps-class gates when the measured display
  baseline supports them.
- Retained section scroll no longer has sustained p95 around one 60 Hz frame on
  a 120 Hz-capable baseline.
- Any claim that 120 fps-class behavior is impossible includes measured proof
  and a fallback target still in the measured refresh-rate range.
- No visible frame exposes true holes, blank retained rows, or placeholder
  bands.
- Cold first-load behavior is explicitly represented as first-coverage loading
  or held publication, not as "hold previous" without a previous coherent
  transaction.
- Interaction frames do not perform unbounded passive uploads, unbounded retained
  rasterization, or broad React/source transform churn.
- Active DOM controls remain native and correctly aligned.
- Hit testing, focus, selection, text editing, dropdowns, color controls,
  popups, drag/drop, and edge interactions continue to work.
- The full GPU Flow-related Vitest and Playwright gates pass after all renderer
  changes and follow-up fixes.
- Replaced legacy code is removed instead of left behind as a compatibility
  path.
- The retained-scroll vertical slice deletes the replaced retained repair and
  retained-only publication paths before broader surface migration is accepted.
- The retained-scroll runtime-motion milestone and retained-slice publication
  milestone are accepted together, not as independently shippable half-steps.

## Risks

- Holding a previous compatible transaction can produce momentary stale content
  if invalidation is wrong. Mitigation: generation ids, source keys, and
  rejection reasons must be part of coverage proof and diagnostics.
- A unified coverage store can become too general. Mitigation: keep actors
  concrete and test the core contract with small fake surfaces before converting
  production paths.
- The refactor can become a second renderer layered over the current retained
  repair path. Mitigation: prove the retained-scroll vertical slice first and
  make deletion checkpoints block each migrated milestone.
- Retained text-like rows can regress if source readiness is conflated with
  texture readiness. Mitigation: track source generation, paint readiness, and
  texture readiness separately.
- Interaction projection can steal gestures from native controls. Mitigation:
  make pointer/wheel ownership explicit in the projector and test each retained
  control family.

## Execution Order

1. Add the failing observed-behavior Playwright spec and failing perf report.
2. Add pure surface compositor contracts and contract tests.
3. Build unified coverage store for the retained-scroll slice.
4. Convert retained parameter content and text-like snapshots to actors.
5. Move retained scroll fully onto runtime motion and pair it with retained-slice
   transaction publication semantics.
6. Complete retained-slice frame publication and delete replaced retained
   repair/publication code.
7. Convert DOM section and overlay textures to actors.
8. Replace interaction projection.
9. Delete remaining legacy retained repair/publication code.
10. Run full verification and write the before/after report.
