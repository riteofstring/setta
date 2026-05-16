# GPU Flow Retained Compositor Runtime Refactor Plan

## Goal
Make GPU Flow retained settings sections behave like a real compositor surface:

- viewport pan and zoom are transform-only during input;
- retained section scroll is offset-only during input;
- hover and active-control visuals are lightweight overlays, not retained-scene mutations;
- committed retained content remains drawable until replacement coverage is ready;
- visible retained content is batched enough to sustain high frame cadence.

This is intentionally a larger refactor. Do not preserve old retained scroll paths, retained-hover scene mutation paths, compatibility adapters, dual pipelines, or transitional fallbacks.

## Current Conclusion
The latest Chrome recording is sufficient. More logging is not the next step.

Observed behavior from the recording:

- The viewport runtime path is cheap. `gpu-flow-viewport-runtime-frame` stays around `0.2-0.3ms`.
- Ctrl-wheel zoom away from retained content is cheap in CPU render duration.
- Ctrl-wheel zoom while the pointer is over a retained settings row degrades into `~33-35ms` p95 frame intervals with `41-50ms` frame gaps.
- Retained section scroll shows the same class of problem: `~34-35ms` p95 frame intervals, `41-58ms` frame gaps, and one `~51ms` long task.
- Bad windows correlate with retained composition still being in the active input path. Some bad windows show no upload/raster work, but still draw about `90-94` retained page quads; earlier or post-view-change windows reach about `222` retained page targets/quads.
- Section scroll still writes runtime scroll offsets back through retained scene sampling. That changes retained surface identity/content references and defeats the frame cache during input.

The issue is not just missing budget caps. The retained runtime still lets input state, hover state, and committed content state share too much machinery.

## Ideas To Borrow From Example Repos
Use these as architectural input, not as code to copy.

### `html-in-canvas-official`
- Treat browser-painted DOM as a committed snapshot. The `paint` event represents a stable rendering update, and DOM changes made during paint affect a later frame.
- CSS transforms on source elements do not themselves cause a repaint. This is the key invariant Setta needs: transform-only input must not invalidate retained content.
- `captureElementImage` / `copyElementImageToTexture` suggests a clean ownership split: capture committed element images separately from the compositor that consumes them.
- `drawElementImage()` returns a transform for DOM synchronization. Setta should similarly derive DOM island transforms from the same sampled compositor state used to draw retained surfaces.

### `html-in-canvas-cracks`
- Keep the visible stage fixed to the viewport so the browser compositor owns viewport pinning.
- Store geometry in CSS-pixel space and feed live scroll/viewport values into shader/UV sampling instead of moving or repainting content on scroll.
- Use a readiness gate: draw stable background/last-known-good content until the first real texture frame is ready.
- Reallocate GPU texture resources only at real texture-size boundaries, not on every input movement.

### `three-html-render`
- Use a dedicated overlay synchronizer for native DOM interaction, driven by matrix math or pointer-derived UVs.
- The raycast interaction manager is event-driven rather than per-frame for pointer hit routing. Setta can borrow that principle for retained hit testing and DOM island activation.
- Park inactive DOM overlays instead of leaving stale interactive regions under the pointer.
- Keep pseudo-state rendering and native interaction as explicit overlay responsibilities, not as broad content-snapshot invalidation.

### `compiz-web`
- Upload page textures at known visual transition boundaries, then composite them through shader passes.
- A fullscreen or batched compositor pass should be cheap and deterministic; expensive texture production should not happen inside live input frames.

## Target Architecture
Replace the current retained runtime with six explicit owners.

### 1. Retained Surface Registry
Owns retained surface identity and static layout metadata:

- surface id, owner section id, z-index, layout rect, clip rect;
- content size, viewport size, reset key, content version;
- row geometry and hit geometry in stable content coordinates;
- DOM island anchors in stable content coordinates.

It does not own live scroll offset, hover target, active control state, or viewport transform.

### 2. Runtime Interaction State
Owns live input state:

- viewport transform;
- retained surface scroll offsets;
- hovered retained row / subpart;
- active retained control or scrollbar drag;
- native DOM island activation state.

All of this must be mutable without creating a new retained scene, changing retained content surface object identity, invalidating texture pages, or requesting raster/upload work.

### 3. Committed Snapshot Store
Owns drawable retained content:

- committed page textures or atlas entries;
- page content versions;
- last-known-good visible coverage;
- stale/lower-resolution coverage for active zoom;
- committed row snapshot content for text-like controls.

Visible committed coverage is protected. A visible page or row snapshot may be stale or lower resolution during input, but it must not be replaced by blank coverage.

### 4. Snapshot Scheduler
Owns expensive work:

- DOM/source capture;
- page descriptor selection;
- row snapshot maintenance;
- raster/upload;
- atlas packing or page-table updates;
- cache pruning and retired resource draining.

It runs after input frames or in explicit idle/preload slices. It has bounded elapsed-time and work-count budgets. It prioritizes:

1. missing visible coverage;
2. stale visible coverage;
3. near-viewport prefetch;
4. passive/offscreen work.

It never competes with active pan, zoom, retained scroll, or hover frames.

### 5. Frame Composer
Owns the active frame draw path:

- sample runtime viewport/scroll/hover state once per frame;
- draw stable retained snapshots with transform and UV/source-window offsets;
- draw scrollbars, hover highlights, selection, and active-control overlays;
- draw already-committed node/edge/html textures.

It must not enumerate broad retained page targets, mutate retained scenes, rasterize pages, upload textures, maintain text-like row snapshots, or prune caches during active input.

### 6. Overlay And Hit Synchronizer
Owns native interaction alignment:

- retained hit testing from stable geometry plus sampled runtime transform/scroll;
- DOM island matrix/rect updates from the same sampled frame state as the composer;
- active native control parking/unparking;
- hover visual state as overlay state, not retained-row scene state.

Hit testing should be spatially indexed by visible surface and row geometry, not linear scans over every retained hit record on every pointer interaction.

## Core Invariants
- Input frames are compositor-only.
- Scroll offsets are sampled, not applied back into retained scene content.
- Hover state is sampled, not applied back into retained row draw commands.
- A committed retained snapshot is immutable after publication.
- Snapshot replacement is atomic per surface/page range.
- Visible content never disappears because new coverage is missing.
- Active zoom may show stale or lower-resolution retained content, but not blank content.
- DOM islands and drawn content use the same sampled runtime state.
- Retained page composition is batched enough that visible retained sections do not require one bind/draw per page.
- No backward-compatibility path exists for old retained wheel scroll, old hover mutation, or old scene-rewrite input flow.

## Performance Targets
Use frame interval as the source of truth.

For local/performance Chrome on a 120Hz-capable display, the target is 120fps-class interaction:

- p95 frame interval `<= 8.5ms` for viewport pan, viewport zoom, retained section scroll, and scroll-then-zoom;
- p99 frame interval `<= 16.7ms`;
- slow-frame ratio over `16.7ms` below the test-specific accepted threshold;
- no long task above the accepted budget during measured input windows;
- visible retained content remains nonblank through every measured gesture.

The performance workload must be a large complex scene comparable to the Settings project's All Settings page:

- enough retained settings sections to require many visible and near-visible retained pages;
- mixed retained row types, including text-like rows, switches, dropdowns, color/date/dropzone-style controls, and CodeMirror-like controls where available;
- enough canvas nodes/edges/labels around the settings sections that the scene is representative of a real GPU Flow workload, not an isolated retained widget demo;
- at least one large scrollable retained section in view while other retained sections remain visible or near-visible;
- the same viewport sizes used by realistic desktop verification, plus any mobile/narrow verification that is relevant for layout correctness.

Performance tests must separately measure:

- viewport pan over the large scene;
- viewport zoom with the pointer away from retained content;
- viewport zoom with the pointer over a retained row;
- retained section scroll;
- retained section scroll followed immediately by retained-hover zoom.

If a machine or browser is capped below 120Hz, first measure a control gesture such as empty-canvas pan/zoom to establish the environment cadence. In that case, enforce no dropped frames relative to the measured cap and record the cap explicitly. A lower-cadence environment does not remove the requirement to record local 120Hz-class results before accepting the refactor.

If 120fps-class cadence proves impossible even after the compositor refactor, document the bottleneck with Chrome traces and set the next explicit target in the same range, such as p95 `<= 11.1ms` for 90fps-class interaction, but only after the observed-behavior tests demonstrate that retained presence no longer materially worsens pan, zoom, or section scroll cadence.

## Regression Guardrails
This refactor is only acceptable if regression prevention is built into the workflow, not inferred from internal diagnostics.

Required gates:

1. Add realistic observed-behavior tests before implementation.
   - They must reproduce the exact retained-hover zoom and retained-section scroll symptoms.
   - They must fail on the current implementation before refactor work begins.
   - They must assert frame cadence, long tasks, visible movement, retained nonblank content, and scroll ownership.
   - They must not assert implementation details such as page counts, upload counts, target descriptors, draw quads, queue names, diagnostic event shapes, or store mutation counts.
2. Run the full related GPU Flow test suite before accepting the refactor.
   - This includes all GPU Flow Vitest tests under `frontend/src/gpuFlow`.
   - This includes every retained/GPU-flow Playwright spec and probe under `frontend/tests/e2e/settings/`, `frontend/tests/e2e/gpu-flow/`, and the top-level `frontend/tests/e2e/gpuFlow*.test.ts` probes.
   - Running only the new tests or only the files touched by the refactor is not enough.
3. Treat large-scene performance tests as acceptance tests, not optional profiling.
   - The large scene must be comparable to All Settings in retained content volume and control variety.
   - Pan, zoom, retained-hover zoom, retained section scroll, and scroll-then-zoom must each meet the cadence target or have a documented trace-backed target adjustment.

A clean result from logs, frame diagnostics, or targeted smoke tests is supporting evidence only. It does not replace the observed-behavior tests plus the full related suite.

## Implementation Plan

### 1. Add Failing Observed-Behavior Tests First
Add or extend Playwright coverage under `frontend/tests/e2e/settings/`. Prefer focused files such as:

- `settings-retained-compositor-cadence.spec.ts`
- `settings-retained-compositor-large-scene-performance.spec.ts`

The tests must fail on the current behavior and must assert user-observable outcomes only.

Add measured scenarios:

1. **Retained-hover zoom cadence**
   - open Settings;
   - switch to All Settings;
   - place a large scrollable retained section in view;
   - measure ctrl-wheel zoom while the pointer is over an empty/non-retained canvas area;
   - measure ctrl-wheel zoom while the pointer is over a retained row in the section;
   - assert the retained-hover zoom window sustains the same cadence class as non-retained zoom within the budget;
   - assert viewport zoom visibly changes;
   - assert visible retained rows remain nonblank.

2. **Retained section scroll cadence**
   - place a scrollable retained settings section in view;
   - perform a native wheel burst inside that section;
   - assert visible section content moves;
   - assert frame p95/max/slow-frame ratio and long-task budget;
   - assert section content remains nonblank before and after the burst.

3. **Scroll then retained-hover zoom**
   - scroll inside a retained section;
   - immediately ctrl-wheel zoom with the pointer still over the retained section;
   - assert scroll movement, zoom movement, frame cadence, no page-scroll leakage, and retained nonblank visual continuity.

4. **All Settings-scale large scene performance**
   - open a scene comparable to the Settings project's All Settings page;
   - verify the scene contains multiple retained sections, many retained rows, mixed row/control types, and surrounding GPU Flow graph content;
   - warm up until first visible retained coverage is ready;
   - measure pan, zoom, retained-hover zoom, retained section scroll, and scroll-then-retained-hover-zoom as separate windows;
   - assert 120fps-class cadence on a 120Hz-capable environment, or no dropped frames relative to a measured lower environment cap;
   - assert retained presence does not materially degrade zoom cadence compared with zoom away from retained content;
   - assert all gestures produce visible movement and retained content remains nonblank.

Measured signals:

- `requestAnimationFrame` intervals during the actual gesture window;
- `PerformanceObserver` long tasks;
- viewport transform movement sampled from public state or rendered debug state;
- screenshot nonblank/text-band ratios for the retained section clip;
- native page scroll position to catch scroll leakage.

Do not assert:

- retained page counts;
- upload counts;
- target descriptor counts;
- draw quad counts;
- internal queue names;
- diagnostic event shapes;
- store mutation counts.

Record a baseline failure in an append-only `perf/` report with exact commands, browser cadence, p50/p95/p99/max frame intervals, slow-frame ratio, long-task count/max, and visual movement/nonblank results.

### 2. Define The New Owner Boundaries
Create narrow modules for the six owners:

- retained surface registry;
- runtime interaction state;
- committed snapshot store;
- snapshot scheduler;
- frame composer inputs;
- overlay/hit synchronizer.

Keep the first slice structural and explicit. Do not add compatibility layers around old scene-mutation paths.

### 3. Remove Scroll-Time Scene Mutation
Delete the input-frame path that applies retained scroll offsets back into retained scenes.

Concrete deletion targets include the responsibilities currently represented by:

- `applyGpuRetainedContentRuntimeStateToScene` applying scroll offsets during frame sampling;
- `applyGpuRetainedContentScrollOffsetToScene`;
- DOM island rect mutation derived from rewritten retained scenes;
- scroll flush behavior that requests a normal retained scene/content frame for every scroll input.

Replacement behavior:

- wheel input updates runtime scroll state only;
- the composer samples scroll offsets and adjusts retained surface UV/source-window/clipping;
- DOM islands read sampled scroll state in the overlay synchronizer;
- scheduler receives a deferred invalidation/preload signal only after active input yields.

### 4. Remove Hover-Time Scene Mutation
Delete retained row hover mutation as a content-scene update.

Replacement behavior:

- pointer movement updates runtime hover target only;
- hover highlight is drawn as a compositor overlay using stable row geometry plus sampled viewport/scroll state;
- hover changes do not dirty retained row draw commands, retained page content, text-like snapshots, or surface layout identity.

### 5. Introduce Stable Committed Snapshot Rendering
Make retained content frames consume an immutable committed snapshot set.

Required behavior:

- committed pages are addressable by surface id, content version, LOD, and source rect;
- a visible old committed page is kept until a replacement is ready;
- missing high-resolution coverage draws stale/lower-resolution coverage when available;
- blank fallback is allowed only outside visible content or before first successful coverage, with explicit readiness gating.

### 6. Split Scheduler Work From Composer Work
Move retained page descriptor selection, upload, text-like row snapshot maintenance, and cache pruning out of active input frames.

Scheduler requirements:

- accepts dirty content/layout signals from React/scene generation;
- accepts prefetch/refresh hints from sampled viewport/scroll state;
- has hard elapsed-time and work-count budgets;
- yields completely during active pan/zoom/retained scroll unless visible coverage is truly missing and no stale coverage exists;
- publishes atomic snapshot updates to the committed store.

### 7. Batch Retained Page Composition
Reduce per-page bind/draw overhead so retained sections scale like a canvas compositor.

Preferred direction:

- pack retained pages into per-surface or shared atlases where practical;
- otherwise use texture arrays/page tables with instanced quads;
- group draw commands by pipeline/bind group/atlas;
- keep visible retained section composition to one or a few draw calls per surface/LOD instead of one bind/draw per page.

This is part of the principled fix. The recording shows bad windows even without upload/raster, which means composition overhead itself matters.

### 8. Rework Overlay And Hit Synchronization
Derive DOM islands and hit targets from stable geometry plus sampled runtime state.

Required behavior:

- active native controls stay aligned during pan, zoom, and retained scroll;
- inactive controls are parked so stale hit targets cannot receive events;
- hit testing uses visible surface culling and a row/hit spatial index;
- pointer hover updates do not force scene regeneration;
- overlay transforms are applied from the same frame sample used by the composer.

### 9. Delete Obsolete Paths
Remove old code and tests that only validate deleted behavior:

- retained wheel-scroll scene rewrite paths;
- hover scene mutation paths;
- redundant scroll ownership writers;
- page-maintenance hot paths from input frames;
- compatibility adapters introduced by previous retained runtime iterations.

Do not keep old and new retained runtimes side by side.

### 10. Verify And Profile
Run the new failing tests until they pass.

Run the full retained/GPU-flow Playwright suite, not a hand-picked subset:

- every `frontend/tests/e2e/settings/settings-retained-*.spec.ts`;
- `frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts`;
- every top-level `frontend/tests/e2e/gpuFlow*.test.ts` probe;
- every `frontend/tests/e2e/gpu-flow/*.spec.ts`;
- the new retained compositor cadence spec.

Run all GPU-flow Vitest coverage under `frontend/src/gpuFlow`:

- `pnpm -C frontend exec vitest run frontend/src/gpuFlow`

Run the Playwright suite through the repository wrapper so the backend, seeded workspace, browser, and frontend environment match normal E2E conditions:

- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-*.spec.ts frontend/tests/e2e/settings/settings-gpu-retained-interaction.spec.ts frontend/tests/e2e/gpuFlow*.test.ts frontend/tests/e2e/gpu-flow/*.spec.ts`

Use Chrome DevTools visual verification for the Settings workflow.

Run `./scripts/quality/check.sh` before finishing unless a narrower verification scope is explicitly approved and documented.

Append before/after performance results under `perf/`, including:

- exact commands;
- browser/version/display cadence;
- p50/p95/p99/max frame intervals for each gesture;
- slow-frame ratio;
- long-task count/max;
- retained-section nonblank/text-band results;
- notes on any unavailable verification item and the risk.

## Candidate File Areas
- `frontend/src/gpuFlow/GpuFlow/flowSurface.tsx`
- `frontend/src/gpuFlow/GpuFlow/flowFrame.tsx`
- `frontend/src/gpuFlow/GpuFlow/retainedContentRuntimeSceneSampling.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/interactions/retainedContentInteraction.ts`
- `frontend/src/gpuFlow/retainedContentRuntimeState.ts`
- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentRowHover.ts`
- `frontend/src/gpuFlow/retainedContentHitTest.ts`
- `frontend/src/gpuFlow/retainedContentFrameGeneration.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageManager.ts`
- `frontend/src/gpuFlow/retainedTexturePageGrid.ts`
- `frontend/src/gpuFlow/retainedTextureUploadScheduler.ts`
- `frontend/src/gpuFlow/retainedContentTexturePageTextLikeSnapshots.ts`
- `frontend/src/gpuFlow/htmlSurfaces/rendererFlat.ts`
- `frontend/src/gpuFlow/htmlSurfaces/frame.tsx`
- `frontend/tests/e2e/settings/settings-retained-compositor-cadence.spec.ts`
- `frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- existing retained settings E2E helpers under `frontend/tests/e2e/settings/`

## Acceptance Criteria
- The new tests fail before the refactor and pass after it.
- Retained-hover zoom, retained section scroll, and scroll-then-retained-hover-zoom each meet the frame-cadence budget as separate windows.
- In an All Settings-scale large scene, viewport pan, viewport zoom, retained-hover zoom, retained section scroll, and scroll-then-retained-hover-zoom meet the 120fps-class cadence target on a 120Hz-capable environment.
- If 120fps-class cadence is trace-proven impossible after the refactor, the accepted replacement target is documented in `perf/`, remains in the same range, and still proves retained content presence no longer materially worsens pan, zoom, or section scroll cadence.
- Retained section content stays visibly nonblank through every measured gesture.
- Section scroll and viewport zoom both produce visible movement.
- Native page scroll does not leak during retained section scroll.
- Active retained controls and DOM islands stay aligned during pan, zoom, and scroll.
- No retained scroll offset or hover target is applied back into retained scene content during active input.
- Active input frames do not run retained page target generation, raster/upload, text-like row maintenance, or cache pruning except for explicitly unavoidable first-visible missing coverage.
- Visible retained section composition is batched enough to avoid per-page bind/draw scaling as the dominant frame cost.
- Old retained wheel-scroll, hover mutation, and scene-rewrite input paths are deleted.
- Full retained/GPU-flow Playwright and Vitest coverage passes, or any unavailable item is documented with risk.
- A before/after perf report is appended under `perf/`.

## Risks
- Stale retained content can look slightly blurry during fast zoom.
  - Mitigation: prefer stale/lower-resolution visible coverage over blank coverage, then refresh after input idle.
- Batching retained pages may increase memory pressure.
  - Mitigation: track atlas occupancy and committed visible bytes; prune only outside active input and never evict visible last-known-good coverage.
- DOM islands can drift if overlay sampling diverges from compositor sampling.
  - Mitigation: one sampled frame state feeds both composer and overlay synchronizer.
- Tests can become image-analysis brittle.
  - Mitigation: use relative nonblank/text-band thresholds within the same run and combine them with frame cadence and movement assertions.
- Scheduler starvation can delay offscreen refresh.
  - Mitigation: explicit priority lanes and idle/preload work after visible coverage is fresh.
