# GPU Flow Transactional Retained Content Compositor Plan

## Context

The latest Chrome recording shows that the retained-content blanking is not primarily an active-island click bug. The click path can make the issue more visible, but the recording already shows large blank regions before activation:

- The recording contained hundreds of retained display frames with true visible holes.
- Long streaks lasted multiple seconds while zooming or interacting with retained sections.
- One representative frame jumped from a small visible page set to a much larger target set, rejected most existing pages as stale or incompatible, then repaired only a tiny amount of visible coverage.
- Later frames still had large visible holes while retained page maintenance was deferred during viewport interaction, so no upload work happened even though the user-visible surface was blank.

This means the current compositor still couples three concerns too tightly:

1. The current viewport/grid/fidelity target.
2. Whether existing retained content is still semantically valid enough to draw.
3. Whether replacement content has finished rasterizing and uploading.

When those are treated as one page-level identity, normal zoom, source-rect, or layout-grid changes can invalidate large areas at once. The renderer then withholds old content before new content is ready, and the interaction deferral path can pause the repair work that would fill the holes.

Previous fixes improved pieces of the lifecycle, but they did not change this core invariant. The principled fix is to make retained content transactional: keep drawing the last committed compatible content until replacement coverage is ready, while motion state stays current every frame.

No backward-compatibility path or transitional dual implementation is required. The refactor should replace the old retained page identity and publication model directly.

## Relevant Ideas From Example Repositories

Borrow the following ideas from `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos`:

- `html-in-canvas-official/Examples/webgpu-jelly-slider`: treat browser paint or snapshot updates as lifecycle events separate from the render loop. The scene can continue animating from the current or previous texture while a new paint arrives.
- `html-in-canvas-cracks`: keep stable texture objects and viewport-space geometry, then update backing content and scroll uniforms independently. Resize or scroll should not force every consumer to drop its valid texture reference.
- `three-html-render`: keep native interaction placement event-driven and independent from texture recapture. Moving or focusing an active DOM island should not require whole-surface retained texture invalidation.
- `compiz-web`: keep old and new page textures alive during a visual transition, then commit to the new target only after the new texture is available.

The shared principle is that visual continuity is a first-class contract. Content replacement is committed when ready; it is not exposed as blank intermediate state.

## Goal

Refactor GPU Flow retained content around a transactional compositor model with these invariants:

- Viewport motion, transforms, scroll offsets, and hit-test geometry are always current.
- Existing compatible retained content remains drawable until replacement coverage for the same visual region is ready.
- Zoom, DPR, page-grid, source-rect, and LOD changes are fidelity changes unless the underlying row or document content actually changed.
- Newly exposed areas may show an explicit loading or empty state only when there is no committed compatible content for that visual region.
- Pointer activation and active native islands invalidate only the affected rows or regions, not an entire retained section.
- Upload and raster work may be throttled during interaction, but visible true-hole repair must not be fully deferred.

## Non-Goals

- Do not preserve the old retained page lifecycle behind a compatibility layer.
- Do not add heuristic stale-content fallbacks.
- Do not make test assertions against internal counters such as retained page counts, true-hole log lines, or page keys.
- Do not trade blanking for visibly stale wrong content. Compatibility must be typed and region-based.

## Regression Prevention Requirements

Regression prevention is part of the refactor, not a cleanup task after it:

- The first tests added must be realistic observed-behavior tests. They should exercise the production UI and assert user-visible frame pacing and pixel continuity, not internal implementation state.
- Those tests must fail against the current bug before the compositor refactor starts.
- Performance tests must cover panning, zooming, and retained-section scrolling in a large complex scene comparable to the Settings project's All Settings page.
- Internal retained-compositor logs may be attached as diagnostics, but they must not be the pass/fail oracle.
- The final verification must run the full GPU Flow-related Vitest and Playwright suites, not only the new tests and not only the files edited in the refactor.
- Any skipped, quarantined, or non-deterministic GPU Flow-related test must be recorded in the `perf/` report with the reason, owner, and follow-up path. Do not silently narrow the suite to get a pass.

## Performance Targets

The refactor should aim for 120 fps-class interaction on capable hardware for large retained-content scenes.

The performance tests should report refresh-rate-aware results instead of assuming every test machine can present at 120 Hz:

- On a 120 Hz-capable browser/display path, target p95 `requestAnimationFrame` interval at or below 8.5 ms for steady-state panning, zooming, and retained-section scrolling.
- If the measured environment cannot present at 120 Hz, scale the pass threshold to the detected refresh interval and still require low variance. For example, a 60 Hz environment should stay near 16.7 ms p95, not hide 30-50 ms stalls behind a lower target.
- Record p99 frame interval, worst frame interval, dropped-frame bursts, and long tasks separately from the p95 target.
- Treat any main-thread long task over 50 ms during the measured interaction window as a failure unless the test proves it came from outside the app under test.
- Run each workload after warm-up and during a coverage-repair case. Warm steady-state performance should be near the display target; repair cases may use a slightly wider budget but must not produce visible blanking or multi-frame stalls.

If 120 fps-class performance is proven impossible for a specific scene or device class, document the measured ceiling in `perf/` with trace evidence and set an explicit fallback budget. Do not silently lower the target.

## Plan

### 1. Add Failing Observed-Behavior Tests First

Create failing tests that reproduce the user-visible blanking before any compositor behavior changes.

The tests should drive production UI paths through Playwright or the existing browser E2E harness. They should capture observed behavior and user impact, not implementation details:

- Open the large Settings or All Settings flow that exhibits retained sections with dense content.
- Capture a stable baseline frame after first paint.
- Perform zoom-in, zoom-out, retained-section scrolling, pointer click or focus on visible retained text, and mixed rapid zoom/scroll/click sequences.
- Include separate measured workloads for canvas panning, viewport zooming, and internal retained-section scrolling on an All Settings-scale scene.
- Record animation-frame timestamps, long tasks, screenshots or canvas crops, and viewport dimensions during the interaction window.
- Use canvas or screenshot pixel analysis to detect large blank regions, repeated placeholder bands, or full-section near-empty frames.
- Assert that large blank areas do not persist across multiple consecutive frames during interaction.
- Assert that frame pacing meets the performance targets for the detected environment, with 120 fps-class p95 frame intervals as the goal on capable hardware.
- Assert that the click target area is visibly nonblank before activation and remains visibly nonblank after activation settles.

Allowed diagnostics:

- Attach retained compositor logs, true-hole counts, upload counts, and page rejection reasons to failure artifacts.
- Save the Chrome trace or local recording bundle for debugging.

These diagnostics must not be the acceptance oracle. The primary assertions should be visible pixels and frame pacing.

Expected result before the refactor: these tests fail by observing multi-frame or multi-second blank retained regions under the recorded interactions.

### 2. Add A Focused Repro Measurement Harness

Add a small reusable helper for the E2E tests that records:

- `requestAnimationFrame` intervals for the interaction window.
- Long tasks through `PerformanceObserver`.
- Detected presentation interval or refresh-rate estimate from a pre-test calibration window.
- Screenshots or canvas crops at fixed frame cadence.
- Device pixel ratio, viewport size, zoom level, and active pointer location.
- Optional compositor debug summaries as attachments.

Keep this helper generic and test-facing. It should not depend on retained-page implementation details.

### 3. Define Region-Level Content Identity

Replace page-level semantic identity with a region-level content manifest.

The manifest should describe what makes content semantically valid:

- Surface or document identity.
- Section or row ownership.
- Row content version or renderer-owned data version.
- Theme and font-affecting style generation.
- Active or passive render mode when that changes pixels.
- Clip or content-coordinate region covered.

The manifest should not include page-grid coordinates, viewport source rects, current zoom transforms, upload texture coordinates, or other fidelity and placement details as semantic invalidators.

Compatibility should be explicit and typed. A candidate retained region is drawable when its manifest proves it covers the requested content-coordinate region with the same semantic content, even if it was rasterized at a different page grid, source rect, or LOD.

### 4. Introduce A Committed Coverage Store

Create a retained drawable coverage store that owns the currently committed visible content.

Responsibilities:

- Track committed drawable regions in content coordinates.
- Answer coverage queries for the current viewport target.
- Return exact coverage, compatible lower-fidelity coverage, and uncovered regions separately.
- Keep committed coverage drawable until replacement regions are uploaded and atomically published.
- Protect visible committed regions from eviction until replacement coverage exists or the region leaves the protection window.

This store should become the compositor's source of truth for what can be drawn. The current frame target should ask for coverage; it should not directly decide to blank a page because a new page descriptor differs.

### 5. Split Target Computation From Publication

Refactor retained frame preparation into two separate phases:

1. Compute the ideal target coverage for the current viewport, scroll, zoom, DPR, and LOD.
2. Publish a drawable frame using committed coverage plus any newly completed replacement regions.

The published frame should include:

- Current motion and transform state.
- Drawable retained regions selected from committed coverage.
- Explicit uncovered regions only where no compatible committed content exists.
- Pending refinement work for higher fidelity or changed content.

This makes transforms current without forcing content replacement to be synchronous.

### 6. Replace Page-Level Invalidation With Transactional Replacement

When a target region needs new pixels:

- Allocate or reuse an upload resource for the replacement.
- Rasterize and upload the replacement in the background queue.
- Validate that the source manifest still matches the requested content at completion time.
- Commit the replacement region atomically into the coverage store.
- Release superseded coverage only after the replacement is committed and not needed by any in-flight frame.

If the replacement is obsolete by completion time, discard it loudly in debug diagnostics and keep the old committed coverage.

### 7. Refactor Scheduling Around Visible Coverage Repair

Change retained maintenance scheduling so interaction deferral only delays fidelity refinement and prefetch work.

The scheduler should prioritize:

1. Visible uncovered regions.
2. Regions near the pointer or active native island.
3. Newly exposed scroll or zoom frontier.
4. Lower-fidelity compatible regions that need refinement.
5. Offscreen prefetch.

Visible true-hole repair must continue during zooming, scrolling, and clicking. It may be budgeted, but it should not be skipped entirely because the viewport is moving.

### 8. Make Texture Resources Stable Across Fidelity Changes

Introduce stable resource handles for drawable retained content.

The handle should separate:

- Semantic content manifest.
- Content-coordinate region.
- GPU texture allocation.
- Raster fidelity metadata.
- Last-used and protection state.

The compositor should be able to keep drawing an existing handle while a replacement texture allocation is being prepared. Reallocation, resize, or grid changes should not make the visible content disappear.

### 9. Make Active Native Islands Region-Scoped

Refactor active native island handling so activation is a local transaction:

- Compute active island placement from current motion and hit-test geometry.
- Hide or replace only the rows or regions covered by the active native element.
- Keep neighboring retained content committed and drawable.
- On deactivation, rasterize and commit only the affected passive regions.

The active island should be coordinated with the same coverage store rather than using a separate whole-section invalidation path.

### 10. Remove Old Retained Page Identity Paths

Delete or replace the old concepts that caused broad invalidation:

- Page semantic versions derived from source rectangles or page-grid descriptors.
- Whole-section incompatibility decisions caused by layout or LOD-only changes.
- Interaction-time maintenance paths that return without checking visible uncovered regions.
- Publication paths that expose target pages before drawable coverage exists.

Because no backward compatibility is required, do not keep adapters that translate the new model back into the old page lifecycle.

### 11. Verify And Record Before/After Results

Run the failing E2E tests from step 1 and confirm they pass after the refactor.

Also run the full GPU Flow-related test surface. The exact list should be discovered at implementation time so newly added tests are included, but the suite must include at least:

- Every Vitest file under `frontend/src/gpuFlow`.
- Project GPU integration tests outside `frontend/src/gpuFlow`, including `frontend/src/components/Pages/Project/GpuProjectSurface` and `frontend/src/components/Pages/Project/gpuFlowCompatibility*.test.ts`.
- Retained-content and GPU Flow browser suites under `frontend/tests/e2e/gpu-flow`.
- Retained Settings browser suites under `frontend/tests/e2e/settings/settings-retained-*.spec.ts` and `frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts`.
- Root GPU Flow probe tests under `frontend/tests/e2e/gpuFlow*.test.ts`.

Expected command shape:

- `pnpm -C frontend exec vitest run src/gpuFlow`
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts`
- `./scripts/run-playwright-e2e.sh tests/e2e/gpu-flow tests/e2e/settings/settings-retained-*.spec.ts tests/e2e/settings/settings-gpu-retained-interaction.spec.ts tests/e2e/gpuFlow*.test.ts`

Then run broader verification:

- A new Chrome recording of the original repro flow.
- `./scripts/quality/check.sh` before finishing unless the scope is explicitly narrowed.

Record before/after performance and visual results under `perf/` as an append-only report, including:

- Test scenario.
- Machine and browser details.
- Detected refresh interval and target frame budget.
- Frame pacing summary.
- p95, p99, worst frame interval, dropped-frame burst count, and long-task summary for panning, zooming, and retained-section scrolling.
- Blank-region detection summary.
- Relevant trace or recording bundle path.
- Any remaining residual risk.

## Acceptance Criteria

- The first-step observed-behavior tests fail before compositor changes and pass after the refactor.
- Zooming retained sections does not produce multi-frame blank regions for content that was already visible and semantically unchanged.
- Scrolling retained sections may expose new edge content, but existing compatible content does not disappear while replacement pages are prepared.
- Clicking or focusing retained text does not blank unrelated rows or sections.
- Interaction-time scheduling continues visible-hole repair even when refinement work is deferred.
- Panning, zooming, and retained-section scrolling on an All Settings-scale scene meet the refresh-rate-aware performance target, aiming for 120 fps-class p95 frame intervals on capable hardware.
- The full GPU Flow-related Vitest and Playwright suites pass after the refactor, including existing retained-content, interaction, viewport, Settings retained, and GPU Flow probe coverage.
- New Chrome recordings do not show multi-second streaks of large true holes or `uploadCount=0` periods while visible uncovered regions are repairable.
- The old retained page identity and whole-section invalidation paths are removed rather than preserved behind compatibility code.

## Risks And Mitigations

- **Wrong stale content:** Use typed region manifests from owner data, not visual heuristics, and validate manifests again before commit.
- **Memory growth:** Protect visible committed coverage, but evict superseded or offscreen coverage through explicit generation reference counts and budget accounting.
- **Scheduler starvation:** Reserve a small per-frame budget for visible uncovered regions before refinement and prefetch queues.
- **Test flake:** Use frame-window assertions, refresh-rate-aware thresholds, and screenshot/canvas analysis over multiple consecutive frames rather than single-frame exact pixel expectations.
- **Refactor size:** Land behind direct replacement boundaries by module, but do not keep old compatibility behavior alive once each boundary is replaced.
