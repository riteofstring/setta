# GPU Flow Retained Snapshot Runtime Refactor Plan

## Goal
Refactor retained GPU-flow section rendering so viewport pan, viewport zoom, and native retained-section scroll remain responsive and never make section content disappear.

The target model is a browser-like retained snapshot pipeline:

- input frames are transform-only;
- DOM/content paint is a separate committed snapshot step;
- committed visible content remains drawable until a replacement is ready;
- scroll and viewport transforms do not invalidate retained paint.

This is a larger refactor plan. Do not preserve old retained wheel-scroll paths, old page-maintenance hot paths, or transitional dual-rendering behavior.

## Current Evidence
The latest Chrome recording points away from pan input handling and toward retained paint/page work.

- `gpu-flow-viewport-runtime-frame` is cheap: about `0.72ms` average and `3.10ms` max.
- `gpu-flow-frame` is not cheap during the regression: frames reach `14-36ms`.
- The bad frames correlate with retained texture/page work: `texture-upload`, hundreds of missing pages, hundreds of stale/fallback draw quads, and target descriptor counts up to about `1078`.
- Section disappearance correlates with retained coverage being unavailable: retained text-like row snapshot logs report many blank/missing passive rows while retained page logs report large missing-page counts.
- Existing retained-scroll and pan/zoom E2E coverage captures adjacent behavior, but not this exact "native section scroll, then immediate viewport pan/zoom" path with strong nonblank thresholds. The current repo has `settings-retained-scroll-performance.spec.ts`, `settings-retained-visual-regressions.spec.ts`, and `settings-retained-pan-zoom-performance.spec.ts`; it does not currently have a `settings-retained-native-scroll-runtime.spec.ts` file.

## Ideas To Borrow From The Example Repos
The examples under `/Users/kevin/Documents/AppDevelopment/example_html_in_canvas_repos` reinforce the same architecture.

- `html-in-canvas-official`
  - Treat painted DOM as a committed snapshot. The proposed `paint` event fires once per rendering update after the browser has a stable painted result.
  - DOM changes made during paint affect a later frame, not the current frame.
  - CSS transforms on source elements do not themselves cause repaint. This is the key separation Setta needs between transform input and retained paint invalidation.
  - `captureElementImage`/`OffscreenCanvas` shows a clean ownership split: main thread captures committed element snapshots, worker/canvas code consumes them.

- `html-in-canvas-cracks`
  - Keep the canvas/stage fixed to the viewport so the browser/compositor owns viewport pinning.
  - Use live scroll values as shader/uniform sampling inputs rather than moving the whole canvas with main-thread scroll compensation.
  - Keep geometry in CSS-pixel space and let texture sampling track scroll/reflow.
  - Gate display on first successful paint and avoid showing blank intermediate content while the texture pipeline warms up.

- `three-html-render`
  - Use an overlay synchronizer to keep live DOM hit targets aligned with rendered surfaces from one transform matrix.
  - Coalesce invalidations into one scheduled paint pass.
  - Track dirty DOM via resize/mutation signals.
  - Do not copy its "request repaint every frame" behavior for Setta's large settings views; Setta needs paint-on-dirty plus transform-only input frames.

- `compiz-web`
  - Texture upload is tied to a known visual transition boundary, then composition is a simple shader pass. Setta should similarly make composition cheap and keep expensive texture production out of live input frames.

## Design Decision
Replace the current retained-section runtime with a retained snapshot runtime made of four explicit stages.

1. Surface Registry
- Owns retained surface identity, static layout bounds, content version, scrollable content size, and accessibility/DOM-island anchors.
- Does not own live scroll offset or viewport transform.
- Receives structural changes from React/scene generation only when content or layout changes.

2. Runtime Transform State
- Owns the live viewport transform and live retained scroll offsets.
- Updates synchronously from pointer, wheel, keyboard, programmatic reveal, and native scroll-source input.
- Requests visual frames, but does not trigger retained raster/page generation directly.

3. Snapshot Scheduler
- Owns retained paint invalidation, page-target selection, raster work, upload work, and commit ordering.
- Runs after input frames or when input is idle, with bounded per-frame work.
- Prioritizes currently visible coverage first, stale visible coverage second, near-viewport prefetch third, and offscreen/passive work last.
- Publishes new pages atomically only after replacement coverage is ready.

4. Frame Composer
- Samples runtime transform state plus the latest committed snapshots.
- Draws using transforms, UV offsets, clipping, and already-committed texture pages.
- Never enumerates broad retained page targets, uploads textures, rasterizes pages, or performs text-like snapshot maintenance during active pan/zoom/native-scroll frames.

## Core Invariants
- Visible retained content must always have a drawable last-known-good representation.
- A visible committed page must not be evicted or replaced by a missing page.
- Scroll and viewport transform changes must not invalidate paint.
- Missing high-resolution coverage may draw lower-resolution or stale coverage, but must not draw blank content for visible text/control areas.
- Snapshot commits are versioned and atomic per surface/page range.
- One runtime scroll source exists for each retained section. There is no fallback wheel-delta scroll path.
- React scene changes describe content/layout changes only; live scroll offsets stay in runtime state.

## Execution Guardrails
- Do not start with another broad instrumentation pass. Add the behavior-level failing test first, baseline it, and only add diagnostics that directly explain that failing test.
- Keep the first implementation slice narrow: remove the scroll-time scene commit/redraw path from retained section input frames before introducing larger scheduler abstractions.
- Do not layer a compatibility path over the current retained scroll flow. The refactor should delete obsolete scroll writers as soon as the replacement path is covered.
- Keep each milestone reviewable: behavior test/baseline, runtime scroll ownership, transform-only frame composition, scheduled snapshot work, stable committed coverage, then cleanup.
- If a new test file is added, name it for the user-visible behavior it protects. Do not reference non-existent "existing" specs.

## Implementation Plan
1. Add failing behavior-level tests
- Add a Playwright test for the exact regression. Prefer extending `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts` unless the helper setup becomes too large; if it does, add a focused new file such as `frontend/tests/e2e/settings/settings-retained-scroll-pan-zoom-regression.spec.ts`.
  - open Settings;
  - switch to All Settings;
  - place a scrollable retained settings section in the viewport;
  - perform a native wheel scroll inside the section;
  - immediately pan and zoom the GPU viewport;
  - assert the retained section remains visibly nonblank before, during, and after the sequence.
- Measure observed user-facing behavior only:
  - `requestAnimationFrame` cadence during scroll/pan/zoom;
  - `PerformanceObserver` long tasks;
  - screenshot luminance/text-band/nonblank ratios for the retained section clip;
  - visible movement after section scroll and after viewport pan/zoom.
- Do not assert implementation details such as retained page counts, upload counts, target descriptors, or internal fallback-quad metrics.
- Strengthen the retained-scroll visual assertions in `settings-retained-scroll-performance.spec.ts` and the related scroll/pan/zoom assertion in `settings-retained-visual-regressions.spec.ts` where they already cover adjacent behavior.
- Keep thresholds tolerant of CI noise but strict enough to fail the current regression: p95 frame interval budget, max frame-gap budget, long-task budget, minimum retained-section nonblank ratio, and minimum text-band ratio relative to the pre-gesture capture.
- Keep setup helpers allowed to locate the target section, but keep pass/fail assertions focused on observed behavior.

2. Baseline the current failure
- Run the new/strengthened tests and record the failing metrics.
- Capture a Chrome recording for the failing scenario.
- Add an append-only `perf/` report with frame cadence, long tasks, and visual nonblank stats.

3. Define the retained snapshot runtime boundaries
- Introduce a small set of owner modules for:
  - retained surface registry;
  - live runtime transform state;
  - snapshot scheduler;
  - committed snapshot/page cache;
  - frame composer inputs.
- Move live retained scroll offsets out of scene mutation paths.
- First concrete deletion target: remove `applyGpuFlowRetainedContentScrollResult` and `applyGpuFlowRetainedContentRuntimeScrollOffsetChanges` as live-input redraw mechanisms, replacing their frame-time responsibilities with runtime scroll state sampling plus scheduled snapshot invalidation.
- Remove scroll-time scene commit logic and old wheel-delta retained scroll behavior rather than preserving compatibility branches.

4. Make input frames transform-only
- Update pan/zoom and retained native-scroll handling so input only mutates runtime transform state and requests a visual frame.
- Ensure the visual frame path samples a consistent runtime snapshot once per frame.
- Defer retained page selection, rasterization, upload, text-like row snapshot maintenance, and broad cache pruning until after the input frame.
- Assert in focused unit coverage that retained scroll input requests a viewport/visual frame without requesting immediate `texture-upload` work.

5. Refactor retained page scheduling
- Replace per-frame broad page-target enumeration with a scheduler that builds work from the current sampled viewport/scroll windows.
- Cull to actually visible retained surfaces before target generation.
- Cap work by elapsed time and by number of pages considered, not only by upload count.
- Prioritize visible stale/missing coverage before offscreen/passive rows.
- Stop follow-up RAF loops from competing with active pan/zoom/scroll frames.

6. Make committed coverage stable
- Add a versioned committed-page cache with last-known-good protection for visible coverage.
- Commit replacement pages only after they are ready.
- On zoom changes, allow temporary lower-resolution/stale coverage rather than blank coverage.
- Protect visible text-like row snapshots the same way: keep the previous drawable row representation until the replacement is ready.

7. Rework overlays and native scroll-source sync
- Keep native scroll sources as the browser-owned input surface.
- Align scroll sources and active DOM islands from the same sampled frame state used by the composer.
- Avoid post-scroll DOM island rect mutation paths that race against rendering.
- Keep custom retained scrollbars as drawn indicators of runtime scroll state, not independent scroll owners.

8. Add development-only diagnostics
- Keep diagnostics useful for debugging, but separate them from behavior-level test assertions.
- Log scheduler backlog by surface, visible coverage freshness, committed/stale/blank draw coverage, and active input phase.
- Use these logs to verify the scheduler is doing the expected work without making E2E tests depend on those internals.
- Do not add another diagnostic-only commit unless the failing behavior test cannot distinguish between scheduler starvation, blank committed coverage, and overlay drift.

9. Delete obsolete paths
- Remove old retained wheel-scroll handlers, scroll scene commits, compatibility adapters, and duplicate scroll state writers.
- Remove tests that only validate deleted behavior.
- Update unit tests around the new owner boundaries and invariants.

10. Verify and profile
- Run the new failing tests until they pass.
- Run retained settings Playwright coverage:
  - native section scroll;
  - section scroll followed by viewport pan/zoom;
  - retained close zoom visual tests;
  - retained interaction stability tests;
  - retained text-like row rendering tests.
- Run focused Vitest for changed GPU-flow modules.
- Run `./scripts/quality/check.sh`.
- Use Chrome DevTools visual verification for the settings workflow.
- Append before/after results under `perf/`.

## Candidate File Areas
- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx`
- `frontend/src/gpuFlow/GpuFlow/flowSceneStateSync.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentScrollSourceLayer.tsx`
- `frontend/src/gpuFlow/interactions/panZoom.ts`
- `frontend/src/gpuFlow/retainedContentRuntimeState.ts`
- `frontend/src/gpuFlow/retainedContentFrameGeneration.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTextureUploadScheduler.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageTextLikeSnapshots.ts`
- `frontend/tests/e2e/settings/settings-retained-scroll-performance.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-visual-regressions.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-scroll-pan-zoom-regression.spec.ts` if a focused new regression spec is cleaner than extending the existing scroll performance file.
- `frontend/tests/e2e/settings/settings-retained-pan-zoom-performance.spec.ts`

## Acceptance Criteria
- The new regression test fails before the refactor and passes after it.
- Retained section content stays visibly nonblank through native section scroll followed immediately by viewport pan/zoom.
- Active input frames meet the agreed p95 frame cadence budget on the settings scenario.
- No long tasks over the accepted budget occur during the measured interaction, aside from explicitly documented browser/test harness noise.
- Visual movement is observable for both section scroll and viewport pan/zoom.
- The implementation has one retained scroll ownership model and no backward-compatibility scroll path.
- Chrome visual verification is completed for the settings workflow.
- Before/after performance notes are appended under `perf/`.

## Risks
- Risk: stale coverage may look slightly blurry during fast zoom.
  - Mitigation: prefer stale/lower-resolution visible coverage over blank content, then refresh after input idle.
- Risk: scheduler starvation for offscreen retained rows.
  - Mitigation: priority lanes with an idle/preload lane after visible work is complete.
- Risk: DOM islands or native scroll sources drift from drawn content.
  - Mitigation: derive overlay transforms from the same sampled frame state as the composer.
- Risk: tests become image-analysis brittle.
  - Mitigation: compare relative nonblank/text-band ratios across the same run and combine them with frame cadence and movement assertions.
