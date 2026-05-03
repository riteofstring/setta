# GpuFlow Retained Content Scroll Performance Plan

## Goal

Make retained-content scrolling in GpuFlow fast enough to decide whether this
branch is viable. This plan is intentionally narrower than the retained-content
stabilization plan: scrolling performance is the only priority.

The branch should not continue broader canvas migration until retained
scrolling feels native under the Settings repro and has measured frame cadence
that supports that claim. If this cannot be achieved without broad special
cases, stop moving scroll-heavy form content into retained canvas surfaces and
keep those controls DOM-owned.

Completion sentinel for automated loops:

`GPUFLOW_RETAINED_CONTENT_SCROLL_PERFORMANCE_PLAN_COMPLETE`

Suggested loop command:

```sh
./scripts/run-codex-plan-loop.sh \
  --plan docs/plans/gpuflow-retained-content-scroll-performance-plan.md \
  --sentinel GPUFLOW_RETAINED_CONTENT_SCROLL_PERFORMANCE_PLAN_COMPLETE \
  --name gpuflow-retained-content-scroll-performance \
  --commit-prefix "gpuflow-scroll:"
```

## Current Evidence

The earlier stabilization loop committed retained scroll fixes through
`6a3a9c5c3`, but its final evidence is not sufficient:

- `perf/reports/frontend/2026-05-06_gpuflow-retained-content-final-stabilization.md`
  reports retained wheel windows at about `16fps` and `15fps`.
- That report explains the low cadence as intentionally spaced wheel events,
  which means it did not prove the plan's `55fps` scroll acceptance target.
- Current scroll handling already coalesces wheel input with rAF in
  `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`.
- The rAF flush still calls through
  `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts` to:
  - clone/apply a retained scene scroll offset
  - rebuild visible retained rows through
    `createGpuRetainedRowContentSceneWithScrollOffset`
  - sync active DOM island geometry
  - redraw the retained source canvas
  - mark the WebGPU html-surface texture dirty
  - request paint/frame
- `frontend/src/gpuFlow/retainedContentScene.ts` currently recomputes row
  metrics and row order from all retained rows when rebuilding a scrolled
  retained scene, even though each scroll frame only needs a small visible
  window.

## Scope Rules

- Do not work on switches, text activation, visual fidelity, dropdowns, or
  other retained-content bugs unless they directly block scroll measurement.
- Do not move more Settings or project param controls into canvas.
- Do not add hidden fallback renderers, old/new render switches, or silent DOM
  compatibility paths.
- Do not declare success from intentionally spaced wheel events. Measure frame
  cadence during continuous scroll input.
- Keep fixes in the renderer-owned retained-content path first. Only narrow
  canvas ownership if the measured renderer path cannot meet the acceptance
  target.
- Preserve fail-loud validation for non-finite scroll offsets, invalid
  dimensions, and missing retained-scene source metadata.

## Acceptance Criteria

Run every acceptance check at `1200x672` and at one larger desktop viewport
such as `1440x900`, with Chrome flags:

`--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features`

Required scroll targets:

- `/settings`
- `settings-section__sectionSizingPolicy:param-content:unpinned`
- at least one dense Settings surface such as
  `settings-section__backend:param-content:unpinned`

Performance acceptance:

- Continuous wheel scrolling over retained content has no sustained frame
  cadence below `55fps` after initial warmup.
- Active scroll frame-gap `p95 <= 22ms`, excluding only navigation and the
  first warmup upload window.
- No scroll-window long task above `50ms`.
- No page errors during the repro.
- No retained/GPU console errors during the repro.
- Wheel input must update retained offset on the next animation frame while
  scroll range remains available.
- A scroll gesture must not produce a React scene rebuild or React commit per
  wheel event.
- Texture uploads during sustained scroll must be limited to the affected
  retained surface, and full-surface uploads must not repeat every scroll frame
  after warmup unless the implementation proves that cost still meets cadence.

Correctness acceptance:

- Wheel up/down at scroll boundaries clamps without throwing.
- Shift-wheel horizontal scrolling clamps correctly.
- Scrollbar thumb and wheel scrolling read/write the same scroll state.
- Active DOM editor islands follow retained scroll without remounting while the
  active row stays visible, and hide when the row leaves the clipped area.
- Search reveal and keyboard navigation use the same durable scroll state as
  wheel scrolling.

## Phase 1: Build A Real Scroll Baseline

Files likely involved:

- `scripts/chrome_repro_perf_report.py`
- `scripts/record-chrome-repro.sh`
- a new focused benchmark script under `scripts/` if the recording workflow is
  too manual
- `perf/reports/frontend/`

Work:

- Capture a fresh `/settings` retained-scroll recording before changing code.
- Use continuous wheel input, not intentionally spaced wheel events.
- Mark the scroll window separately from navigation, fit-view, and initial
  texture warmup.
- Record:
  - wheel event count and interval distribution
  - retained offset start/end
  - frame-gap average, median, p95, and max
  - long tasks during the marked window
  - `gpu-flow-frame` duration stats
  - dirty retained surface count per frame
  - texture upload count and uploaded byte estimates
  - React commits or scene recomputes during the marked scroll window
- Save the baseline as an append-only report under `perf/reports/frontend/`.

Acceptance:

- The baseline report explains whether the current bottleneck is input cadence,
  retained-scene rebuild, canvas redraw, texture upload, React work, or a
  combination.
- The baseline uses the exact acceptance viewports and target surfaces.

## Phase 2: Add Scroll-Hot-Path Instrumentation

Files likely involved:

- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/htmlSurfaces/textures.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`

Work:

- Add narrowly scoped performance marks or app-published debug metrics for:
  - wheel events seen by the retained scroll controller
  - scroll results that changed offsets
  - rAF flush count and surface ids per flush
  - time spent applying scroll offset to the retained scene
  - time spent syncing DOM islands
  - time spent redrawing retained source canvases
  - dirty texture count, source rect, and upload byte estimate
  - project scene recompute count during the scroll window
- Keep instrumentation deterministic and cheap. It must not create the
  performance issue it is measuring.
- Make the recording/perf report consume these metrics instead of relying on
  manual interpretation.

Acceptance:

- A single recording can identify which step dominates the scroll frame budget.
- Metrics distinguish initial warmup uploads from sustained scroll uploads.

## Phase 3: Remove Avoidable Wheel-Event Work

Files likely involved:

- `frontend/src/gpuFlow/interactions/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/components/Pages/Project/GpuProjectSurface/projectGpuLayoutAdapter.ts`
- `frontend/src/gpuFlow/retainedContentScroll.test.ts`
- `frontend/src/gpuFlow/interactions/retainedContentScroll.test.ts`

Current risk:

- `resolveGpuRetainedContentWheelScroll` allocates a new `Map` for changed
  offsets on wheel events.
- The controller keeps pending offsets but still performs hit resolution and
  offset map work for every wheel event.
- `setTransientContentScrollOffsets` clones the offset map during flush even
  though wheel scrolling is renderer-owned transient state.

Work:

- Introduce a renderer-owned retained scroll offset store that supports
  per-surface mutation inside the hot path and exposes immutable snapshots only
  to durable consumers.
- Keep wheel-event handling to:
  - hit-test the retained surface
  - compute/clamp the target surface offset
  - update pending per-surface offset
  - schedule one rAF flush
- Avoid cloning the full scroll offset map for every wheel event.
- Avoid React state updates for transient wheel scrolling.
- Preserve deterministic durable commits for keyboard navigation, search
  reveal, and any semantic scroll operation that must affect layout.

Acceptance:

- Tests prove multiple wheel events before one rAF produce one flush with the
  final offset.
- Tests prove transient wheel scroll does not increment the project scene
  version or force React state.
- Baseline metrics show wheel-event CPU cost is negligible compared with frame
  budget.

## Phase 4: Make Retained Scene Scroll Updates Incremental

Files likely involved:

- `frontend/src/gpuFlow/retainedContentScene.ts`
- `frontend/src/gpuFlow/retainedContentSceneSourceMetadata.ts`
- `frontend/src/gpuFlow/retainedContentDrawCommands.ts`
- `frontend/src/gpuFlow/retainedContentScroll.ts`
- `frontend/src/gpuFlow/retainedContentScene.test.ts`

Current risk:

- `createGpuRetainedRowContentSceneWithScrollOffset` rebuilds the retained row
  content scene from source metadata on scroll.
- That path recomputes row metrics and row order from all retained rows, then
  maps the visible row range.

Work:

- Extend retained-scene source metadata with precomputed immutable row metrics,
  row order, content rect, and any other values that do not change during
  scroll.
- Add a scroll-frame scene update path that:
  - validates the new scroll offset
  - resolves visible range from cached metrics
  - rebuilds only visible rows, draw commands, hit records, port anchors, and
    scrollbar state
  - preserves source metadata without restating downstream TypeScript mirrors
- Keep the existing full scene creation path for semantic changes such as row
  content edits, active popup changes, search state changes, or layout changes.

Acceptance:

- Scrolling a large retained surface is `O(visible rows + log total rows)`, not
  `O(total rows)`.
- Unit tests cover variable row gaps, overscan boundaries, scrollbar hit
  records, and source metadata preservation.
- Perf metrics show retained scene update time stays well below the frame
  budget on dense Settings surfaces.

## Phase 5: Stop Reuploading More Texture Than Needed

Files likely involved:

- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/htmlSurfaces/textures.ts`
- `frontend/src/gpuFlow/htmlSurfaces/textureDirtyTiles.ts`
- `frontend/src/gpuFlow/htmlSurfaces/textureSourceRectUpload.ts`

Current risk:

- `redrawGpuFlowRetainedContentSurfaceSources` marks retained content dirty
  without a source rect, so sustained scroll can upload more texture than the
  newly exposed content requires.

Work:

- Make retained source redraw return the dirty source rect when only a strip or
  scrollbar region changed.
- Pass that source rect into `markSurfaceTextureDirty`.
- For pure scrollbar visual-state changes, dirty only the scrollbar region.
- For scroll updates, dirty only the newly exposed vertical strip when the
  retained source cache can be shifted/reused; use full-surface upload only
  when the scroll jump invalidates the cache window.
- Keep diagnostics that report full upload vs source-rect upload.

Acceptance:

- Sustained small wheel deltas do not upload the full retained source every
  frame.
- Texture upload diagnostics show affected source rects and byte estimates.
- Visual output remains correct after slow wheel, fast wheel, scrollbar drag,
  and jump-to-boundary scrolls.

## Phase 6: Add A Retained Scroll Cache If Needed

Do this phase only if Phases 3-5 do not meet the frame-cadence target.

Files likely involved:

- `frontend/src/gpuFlow/GpuRetainedContentSurfaces.tsx`
- `frontend/src/gpuFlow/GpuFlow/retainedContentControllers.ts`
- `frontend/src/gpuFlow/scene.ts`
- `frontend/src/gpuFlow/htmlSurfaces/frame.tsx`
- `frontend/src/gpuFlow/htmlSurfaces/textures.ts`

Work:

- Add a per-surface retained scroll cache window:
  - cached scroll origin
  - cached source rect
  - overscan band above and below the viewport
  - dirty strip tracking
- During small scroll deltas inside the cache window, move the sampled content
  window and redraw/upload only newly exposed strips.
- Rebuild the cache window only when:
  - the scroll offset jumps outside the cached band
  - row content changes
  - row state changes in a visible/cached row
  - active popup or active DOM island ownership changes
  - viewport size or device pixel ratio changes
- If the current html-surface renderer cannot sample a shifted source window,
  extend the renderer contract explicitly rather than adding a hidden fallback.

Acceptance:

- Continuous wheel scrolling mostly reuses cached pixels.
- Repeated full retained source uploads disappear from sustained scroll.
- Cache invalidation is deterministic and covered by unit tests.

## Phase 7: Browser Verification Gate

Required checks:

```sh
pnpm -C frontend exec vitest run \
  src/gpuFlow/retainedContentScroll.test.ts \
  src/gpuFlow/interactions/retainedContentScroll.test.ts \
  src/gpuFlow/retainedContentScene.test.ts \
  src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx \
  src/gpuFlow/GpuRetainedContentSurfaces.test.tsx
```

Then run:

```sh
./kill.sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./ai.sh
```

Use Chrome DevTools MCP on `/settings` for:

- continuous wheel scroll at `1200x672`
- continuous wheel scroll at `1440x900`
- scrollbar drag on the same retained surface
- active text editor island following scroll, if an editor is active

Record a fresh Chrome repro:

```sh
CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features" ./scripts/record-chrome-repro.sh
```

Write the final before/after report under `perf/reports/frontend/`.

Acceptance:

- The final report includes the baseline and after metrics in the same format.
- The after metrics meet every performance acceptance criterion.
- CDP visual verification confirms the scroll movement is smooth and the
  scrollbar remains aligned.
- `./scripts/quality/check.sh` passes before completion.

## Decision Checkpoint

If retained canvas scrolling still misses the acceptance criteria after the
incremental scene update and texture-upload work, do not keep extending special
cases in the canvas renderer.

Instead:

- keep GpuFlow for graph layout, edges, culling, selection, minimap, and
  read-mostly row previews
- make scroll-heavy Settings/project param content DOM-owned for inactive and
  active states
- keep retained canvas only for dense read-only or low-interaction surfaces
- document that ownership boundary before any more migration work

Do not emit `GPUFLOW_RETAINED_CONTENT_SCROLL_PERFORMANCE_PLAN_COMPLETE` unless
the measured scroll path passes, the final report is checked in, CDP visual
verification is done, and quality checks pass.
