# GPU Flow Scroll-First Retained Compositor Refactor Plan

## Context

The atomic retained display frame commit fixed one class of blanking by refusing
to publish prepared frames with missing visible coverage. It also introduced a
new user-facing failure: retained section scroll can freeze for a long time and
then jump to the final scroll position.

The latest Chrome recording is sufficient to identify the cause:

- Recording: `recording-20260515-115307`.
- Retained scroll flush is not the bottleneck: 311 flushes averaged about
  `0.004ms` commit time, with max flush latency about `8.7ms`.
- The display-frame publisher held 314 frames in
  `hold-previous-frame-with-scroll-lag`.
- The worst scroll lag reached `3269px` and lasted `1532.7ms`.
- During that stall, desired scroll revision advanced from `222` to `356` while
  the published scroll revision stayed pinned at `222`.
- Frame `557` finally published revision `356`, which matches the observed
  behavior: the section content appears stationary and then jumps to the final
  state.
- Texture maintenance was draining visible work one upload at a time, with
  budget exhaustion in most maintenance events. The user-visible motion was
  blocked on texture coverage becoming complete.

The current implementation treats retained section scroll as part of the same
publication transaction as texture coverage. That is the wrong abstraction.
Scroll is motion; texture readiness is content. Motion must remain continuous
even while content refinement is catching up.

## Goal

Refactor retained content around a scroll-first compositor:

1. Section scroll, viewport pan, viewport zoom, hit testing, and native island
   placement publish from the current interaction motion frame.
2. Retained texture pages publish independently as content becomes ready.
3. Existing valid content translates immediately under the current motion.
4. Only newly exposed, not-yet-rasterized strips are allowed to show an explicit
   pending/fallback treatment.
5. Missing texture coverage must never freeze the entire section.

No backward compatibility, transitional dual paths, legacy shims, migrations,
old-field aliases, or compatibility adapters are needed. Replace the current
owners directly and delete obsolete code as each new owner becomes authoritative.

## Regression Prevention Gates

This refactor is not complete unless both gates are satisfied:

1. Add realistic tests that assert observed user behavior, not implementation
   details.
2. Run the full GPU Flow-related test suite, not only the new focused tests.

The first gate means tests must use production rendering paths, realistic
fixtures, real browser input where applicable, frame cadence measurements, and
visual evidence such as screenshot crops or observed DOM/canvas motion. Debug
counters can help explain failures, but they must not be the thing that makes a
test pass.

The second gate means targeted tests are useful while implementing, but they are
not sufficient before cleanup or handoff. The final verification must include
the full related Vitest and Playwright coverage listed in Step 8, plus
`./scripts/quality/check.sh`.

## Performance Target

Aim for 120 fps-class interaction in large, realistic GPU Flow scenes,
including panning, viewport zooming, and retained section scrolling.

The primary target on capable hardware is:

- p95 frame interval at or below `8.33ms` during steady-state interaction,
- no long tasks over `50ms`,
- no repeated dropped-frame streaks,
- continuous visible motion with no multi-frame stalls or final-state jumps,
- bounded main-thread interaction work that leaves time for browser
  compositing and input processing.

If the local or CI environment is capped below 120 Hz, use refresh-aware
thresholds, but do not treat that as proof of true 120 fps-class behavior. A
lower-refresh run should record:

- observed refresh cadence,
- p95 frame interval relative to that cadence,
- max frame interval,
- long-task count and max duration,
- visible movement continuity,
- whether the run happened on hardware/browser settings capable of 120 Hz.

For a capped environment, the expected result is still "near display cadence"
with no long tasks over `50ms`, no repeated dropped-frame streaks, and no
visible stall. The final implementation report should explicitly say whether a
120 Hz-capable run was completed or what residual risk remains.

## Ideas To Borrow From The Example Repos

Use the examples for lifecycle and ownership principles, not for direct code.

### WICG HTML-In-Canvas Model

Relevant paths:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-official`
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-dot-dev/spec`
- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/hot-tips/html-in-canvas`

Principles to borrow:

- Drawing and DOM synchronization are separate. `drawElementImage()` draws a
  snapshot, while the returned transform synchronizes DOM hit testing and
  accessibility.
- CSS transform changes do not imply a new paint snapshot. Motion can move a
  source without invalidating content.
- The paint event represents a snapshot lifecycle. Work that depends on a new
  snapshot must wait for one; transforms and hit geometry do not.
- Canvas pixel buffer size, CSS size, and DPR are one subsystem's job.

Setta equivalent:

- Scroll and viewport transforms are motion-only changes unless content itself
  changes.
- Retained source snapshots are inputs to texture preparation, not prerequisites
  for publishing the next motion frame.
- Native DOM islands are synchronized from current motion geometry, while
  passive texture refresh follows the snapshot lifecycle.

### Three HTML Render Interaction Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/three-html-render/src/raycastInteractionManager.ts`

Principles to borrow:

- Interaction is event-driven and scoped to the active surface under the
  pointer.
- A single native HTML element can be moved so the browser performs native hit
  testing, focus, selection, caret, and input behavior.
- Interaction alignment uses texture-space coordinates and current motion; it
  does not require rebuilding every texture before the event is handled.

Setta equivalent:

- Wheel ownership and active island placement should use current motion plus
  stable retained scene geometry.
- Focusing a text input should attach one native island from current geometry,
  not force a full passive source replacement before interaction continues.

### Html-In-Canvas-Cracks Resource Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/html-in-canvas-cracks/src/main.js`

Principles to borrow:

- Geometry is stored in viewport CSS pixels, while shaders sample content using
  current scroll-dependent offsets.
- Scroll changes update uniforms and transforms immediately.
- Texture objects remain stable while underlying GPU allocations can be
  reallocated when size changes.
- Paint owns source buffer size, DPR clamping, and texture readiness.
- The first frame uses a known valid background while the HTML texture is not
  ready.

Setta equivalent:

- Retained pages should be keyed in stable content coordinates, not by a
  scroll-window identity that changes as the viewport moves.
- Scroll should change the sample transform from content coordinates to surface
  viewport coordinates.
- The renderer may show explicit pending strips at newly exposed edges, but
  already-covered content should keep moving.

### Compiz-Web Transition Model

Relevant path:

- `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos/compiz-web/src/transitions/TransitionEngine.ts`

Principles to borrow:

- Old and new textures can coexist while the current visual state advances.
- A new target does not need to replace the old target until both sides are
  available.

Setta equivalent:

- Keep old content pages drawable while new pages are prepared.
- Do not make the whole display frame wait for every target page. Compose
  current motion from the best available compatible pages plus explicit pending
  strips.

## Target Architecture

Replace the current desired/prepared/published frame model with four explicit
owners:

1. `RetainedMotionFrame`
   - Current viewport transform, retained section scroll offsets, scroll
     revision, pointer interaction state, and active island placement inputs.
   - Published every animation frame during interaction.
   - Never waits for texture upload, rasterization, or page coverage.

2. `RetainedContentSnapshotFrame`
   - Source identity, content versions, row layout, text-like snapshot sources,
     native island source metadata, and content-coordinate geometry.
   - Changes when content or layout changes, not merely because scroll moves.

3. `RetainedPageFrame`
   - Page descriptors, committed page cache, pending work, content-coordinate
     coverage, texture readiness, and budget state.
   - May lag behind motion.
   - Produces drawable page quads in content coordinates.

4. `RetainedDisplayFrame`
   - The frame rendered this animation tick.
   - Composes `RetainedMotionFrame` with the best compatible
     `RetainedPageFrame`.
   - Carries a visible coverage proof that distinguishes:
     - content already covered by exact pages,
     - content covered by compatible fallback pages,
     - newly exposed pending strips,
     - impossible-to-draw content that should fail loudly in tests.

Critical invariant:

- Texture readiness may decide which pixels are exact, fallback, or pending.
  It may not decide whether scroll motion is published.

## Core Refactor

### Stable Content Coordinates

Retained page descriptors should use absolute retained content coordinates:

- `surfaceId`
- content identity/version
- content rect in the retained section's full content coordinate space
- scale/LOD/DPR bucket
- tile row/column in content coordinates

Do not include scroll-window origin in the page identity. The current
scroll-window origin should be a rasterization input and draw transform input,
not a cache key that invalidates fallback compatibility.

Current problem to remove:

- A scroll change can produce a different source window.
- Fallback compatibility requires matching scroll origin.
- Existing pages then stop being drawable even though most visible content is
  still the same content translated by scroll.
- The publisher freezes the previous frame until all new pages catch up.

Target behavior:

- A scroll change computes a new visible content rect.
- Existing committed pages that intersect that rect draw immediately at their
  new screen positions.
- New leading-edge strips are queued first.
- If strips are missing, only those strips show pending treatment.

### Motion-First Drawing

The retained renderer should build flat visuals from:

- current surface layout,
- current scroll offset,
- current viewport transform,
- committed page content rects,
- active island geometry,
- explicit pending strip rects.

The draw transform should be:

```text
content rect -> subtract current section scroll -> apply surface clip/layout -> apply viewport
```

The prepared page frame should not contain a baked scroll position that prevents
reuse under current motion.

### Publication Policy

Delete unbounded `hold-previous-frame-with-scroll-lag` behavior.

Allowed publication modes:

- `publish-motion-frame`: current motion published with exact or fallback
  retained pages.
- `publish-motion-frame-with-pending-strips`: current motion published; missing
  coverage is limited to newly exposed strips with explicit pending visuals.
- `publish-initial-loading-state`: only before there is any usable retained
  content for the surface.
- `reject-content-snapshot`: only for true content/layout incompatibility where
  drawing old content would be incorrect. This must not block motion for
  scroll-only changes.

The display frame should fail loudly in development/tests if a scroll-only
motion frame cannot use any compatible prior content for the previously visible
area.

### Scheduler And Budgeting

Page scheduling should prioritize in this order:

1. exact pages for the currently visible rect,
2. missing leading-edge strips in the active scroll direction,
3. active native island backing content,
4. near-viewport overscan corridor,
5. LOD refinement,
6. offscreen prefetch.

Budgets should reserve memory for current visible coverage and active islands
before refinement or prefetch. If the hard budget is insufficient for current
visible coverage at the target LOD, choose an explicit lower LOD for the current
visible rect rather than freezing motion.

### Native Islands And Hit Testing

Hit testing should use current motion geometry, not the lagging texture frame.

Native island attach/detach should be transactional around content identity:

- Scroll-only motion updates reposition active islands immediately.
- Focus activation attaches from current motion geometry.
- Blur/detach waits only if revealing passive content would expose stale or
  missing content for the active row.
- Passive rows should not be remounted or re-keyed just because an active island
  exists.

### Source Snapshot Lifecycle

Text-like snapshots and source roots should be stable across scroll-only
motion:

- Source identity changes only for content/layout changes.
- Snapshot readiness affects page upload, not motion publication.
- A missing text-like snapshot blocks only the page that needs that row snapshot.
- Existing compatible pages remain drawable until the replacement page commits.

## Step 1: Add Failing User-Visible Regression Tests

This must be the first implementation step. The tests should fail against the
current checkout because the current compositor freezes published scroll while
texture pages catch up.

The tests must be realistic enough to catch regressions in the actual product:

- Use the real app route and GPU Flow rendering stack.
- Use large retained sections with dense rows, mixed controls, text-like inputs,
  and enough content to require internal section scrolling.
- Use browser input and browser frame timing rather than mocks.
- Measure observable behavior: visual motion, frame intervals, long tasks,
  blank/pending area, and screenshots.
- Avoid tautological assertions that recompute the implementation's internal
  decisions.

Do not assert implementation counters such as `scrollPublicationMode`,
`scrollLagCssPx`, `missingPageCount`, or rejected frame counts. These counters
can remain useful diagnostics, but they are not acceptance criteria.

Add tests that measure what a user observes:

1. `retained section scroll moves continuously while texture work is pending`
   - Open Settings in All Settings/GPU Flow mode.
   - Scroll to a dense retained section comparable to
     `settings-section__sectionSizingPolicy:param-content:unpinned`.
   - Ensure the section has enough content to require internal scrolling.
   - Start a wheel gesture inside the retained section.
   - Collect `requestAnimationFrame` timestamps and small screenshots of the
     section viewport during the gesture.
   - Use image comparison or visual feature tracking on the screenshot crop to
     prove there are multiple intermediate visual positions before the final
     position.
   - Assert no visual stall longer than a small refresh-aware threshold, for
     example no more than 2-3 missed frames or 50ms on a capped environment.
   - Assert p95 frame interval stays near observed display cadence and no long
     task over 50ms occurs during the scroll window.

2. `fast retained section scroll does not jump directly to the final state`
   - Use a large wheel delta sequence similar to the recording.
   - Record visual displacement per sampled frame.
   - Assert displacement progresses over time instead of remaining near zero
     for most of the gesture and then jumping.
   - Include direction reversal because the recording includes scrolling down
     and back up.

3. `newly exposed retained strips may be pending but covered content keeps
   moving`
   - Start from a stable retained section.
   - Trigger a fast scroll that exposes new content beyond the current page
     cache.
   - Sample the central portion of the previously visible content and the
     leading edge separately.
   - Assert previously visible content translates continuously.
   - Allow explicit pending treatment only in the newly exposed edge strip.

4. `focused retained input does not freeze surrounding section scroll`
   - Focus a text-like retained input inside a dense retained section.
   - Wheel-scroll the section while the input is active.
   - Assert surrounding content moves continuously and frame cadence remains
     comparable to the unfocused case.
   - Mask only caret/blink pixels if screenshots are used.

5. `high zoom retained section scroll remains motion-first`
   - Zoom to a level that increases page pressure.
   - Scroll a dense retained section.
   - Assert motion continuity, bounded pending strips, and no multi-frame
     disappearance of the already-covered content.

Add large-scene performance tests that use an All Settings-like scene:

1. `large complex scene panning targets 120 fps-class interaction`
   - Use a realistic fixture comparable to the Settings project's All Settings
     page.
   - Include many nodes, retained sections, dense parameter rows, text inputs,
     dropdowns, sliders, switches, nested rows, and enough retained content to
     require internal scrolling.
   - Pan the canvas for a fixed distance and duration using real pointer or
     wheel input.
   - Measure requestAnimationFrame cadence, p95/max frame interval, long tasks,
     dropped-frame streaks, and visual movement continuity.
   - Target p95 at or below `8.33ms` on 120 Hz-capable runs, or near observed
     display cadence on capped runs with the capped cadence recorded.

2. `large complex scene zooming targets 120 fps-class interaction`
   - Use the same All Settings-like fixture.
   - Zoom through the range that creates retained page pressure.
   - Assert continuous visible zoom motion, no blanking of already-covered
     retained content, no long tasks over `50ms`, and p95 frame interval within
     the target for the observed display cadence.
   - Allow high-resolution refinement after active zoom, but active zoom
     interaction must not stall while refinement catches up.

3. `large complex retained section scrolling targets 120 fps-class interaction`
   - Use a dense retained section inside the same fixture.
   - Scroll the section while unfocused and while a text-like input inside the
     section is focused.
   - Assert comparable cadence between focused and unfocused cases.
   - Assert continuous section movement, no final-state jump, bounded pending
     strips, no long tasks over `50ms`, and p95 frame interval within the target
     for the observed display cadence.

Recommended measurement helpers:

- `requestAnimationFrame` interval recorder.
- `PerformanceObserver` for long tasks.
- Small screenshot crop around the retained section viewport.
- Image-difference or feature-correlation helper that estimates visual
  displacement between samples.
- Refresh-aware thresholds that record observed cadence in the test report.

Expected initial failure:

- The current implementation will show many frames where visual displacement is
  near zero while wheel input and desired scroll advance, then one large visual
  jump after coverage catches up.

## Step 2: Replace The Frame Contracts

Introduce the new contracts in frontend GPU Flow owners:

- `RetainedMotionFrame`
- `RetainedContentSnapshotFrame`
- `RetainedPageFrame`
- `RetainedDisplayFrame`
- `RetainedVisibleCoverageProof`
- `RetainedPendingStrip`

Remove tests that assert previous-frame retention for scroll-only missing
coverage. Replace them with tests that assert motion publication with pending
strips.

The type split should make it impossible to pass a lagging page frame's scroll
offset to hit testing or active island placement.

## Step 3: Move Retained Pages To Content Coordinates

Refactor retained page descriptors, cache keys, coverage, and visual generation:

- Page keys use content-coordinate rects and content identity.
- Scroll-window origin is removed from fallback compatibility.
- Coverage is computed against the current visible content rect.
- Flat visuals are generated by applying current motion to page content rects.
- Existing pages can cover any intersecting visible content after scroll.

Delete old compatibility predicates that require matching scroll-window origin
for scroll-only fallback.

## Step 4: Make Scroll A Motion-Only Frame Update

Retained scroll handling should update the current motion frame and request a
render frame immediately.

The render frame should:

1. read current motion,
2. compose available retained pages through that motion,
3. draw pending strips where needed,
4. queue page work for missing strips,
5. never block motion on page work.

React/store updates can still persist scroll state, but the visible compositor
must not wait for React to rebuild a retained content snapshot when only motion
changed.

## Step 5: Rework Page Maintenance Around Visible Strip Priority

Refactor maintenance so scroll-driven missing work is queued by visible need:

- current visible rect first,
- leading edge in scroll direction next,
- overscan corridor next,
- refinement after usable coverage exists.

Maintenance should be allowed to continue after interaction, but active
interaction frames must spend only bounded work per frame. If the scheduler
cannot finish visible-edge work in one frame, display pending strips and keep
motion publishing.

## Step 6: Reposition Native Islands From Current Motion

Refactor retained native island transactions so scroll-only motion does not
block active input positioning:

- active island rects are derived from current motion and stable content
  geometry,
- attach/detach uses content identity readiness,
- passive texture replacement is independent from island positioning,
- stale passive reveal is blocked only for the affected row or content rect.

## Step 7: Delete Obsolete Atomic-Hold Paths

Remove these concepts once the new compositor is authoritative:

- unbounded `hold-previous-frame-with-scroll-lag`,
- tests that approve frozen scroll as the fallback for missing coverage,
- scroll-window-origin fallback compatibility for scroll-only motion,
- any dual desired/prepared/published API that can leak lagging scroll geometry
  into hit testing or drawing.

Keep useful diagnostics, but rename them around motion continuity:

- visual stall duration,
- max pending strip area,
- exact/fallback/pending visible coverage ratios,
- visible-edge queue depth,
- motion frame publication cadence.

## Step 8: Verification

Run focused verification first:

- New failing-then-passing retained scroll continuity E2E tests.
- Existing retained section scroll interaction tests.
- Existing retained input focus/scroll tests.
- GPU Flow unit tests covering retained page descriptors, fallback coverage,
  visual generation, hit testing, and native island transactions.

Before finishing, run the full GPU Flow-related suite. The exact list may grow
as tests are added, but this refactor should at minimum cover:

- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/gpu-flow`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-close-zoom-visual.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-activation.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-codemirror-scroll.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-interaction-stability.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-pan-ownership.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-switch-zoom-flash.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts`
- `./scripts/quality/check.sh`
- Chrome recording of the original repro.

Do not substitute a small targeted pass for the full related suite. If an
environment capability is missing, record the exact command, failure, and
residual risk; do not silently skip broad categories.

Final success criteria:

- The original recording scenario no longer shows a long stationary interval
  followed by a final jump.
- Large complex All Settings-like panning, zooming, and retained section
  scrolling meet the 120 fps-class target on capable hardware, or record
  refresh-aware capped results plus residual risk when such hardware is not
  available.
- Scroll visual motion publishes every frame or within the refresh-aware
  threshold even under retained page pressure.
- Panning and zooming keep continuous visible motion in large scenes without
  multi-frame stalls, blanking of already-covered retained content, or long
  tasks over `50ms`.
- Missing newly exposed content is limited to explicit pending strips.
- Existing visible content keeps moving during scroll.
- Focused inputs do not degrade retained section scroll continuity.
- High zoom increases pending/refinement work but does not freeze motion.

UI verification remains required for this frontend work:

- Final implementation response must include `CDP visual check: done (...)` or
  `CDP visual check: not run (reason)`.
