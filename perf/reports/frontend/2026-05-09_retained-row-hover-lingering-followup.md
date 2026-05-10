# Retained Row Hover Lingering Follow-up

Date: 2026-05-09

## Baseline

Latest Chrome recording inspected:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260509-231105`

The recording contained `559` `gpu-flow-frame` app-state events and no
per-hover retained-row redraw events. For the Settings `gui` retained content
surface, frame-sampled hover updates had matching paint-frame texture uploads,
dirty source rects covered the sampled hovered row, and sampled frame durations
stayed below `8 ms`. That ruled out an obvious frame-cost regression but left a
diagnostic blind spot: the recording did not capture every pointer row
transition that occurred between frames.

## Change

- Retained row hover redraws now include a bounded recent-row dirty set
  (`16` rows per surface) so rows crossed during fast movement are redrawn and
  re-uploaded even if they are no longer the immediate previous/current target.
- A one-frame follow-up flush reuses that recent-row set after target changes to
  reduce stale texture windows when pointer movement and paint uploads interleave.
- Chrome repro logging now emits `gpu-flow-retained-row-hover-redraw` with the
  previous/next target, recent rows, dirty rows, dirty source rects, and redrawn
  surfaces.

## After

CDP check command:

`CHROME_EXTRA_ARGS="--enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu --enable-webgpu-developer-features --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion" ./ai.sh`

Settings `gui` row hover checks:

- Source canvas pixel samples: row 0 hover changed only row 0; row 1 hover
  cleared row 0 and changed only row 1; rapid sweep across 12 visible rows left
  only `Pan On Scroll Speed` highlighted; moving outside returned all sampled
  rows to baseline.
- Display screenshots sampled through CDP: row 0 hover delta was `30` only for
  `Default Zoom Level`; rapid sweep delta was `30` only for
  `Pan On Scroll Speed`; cleared screenshot deltas were `0` for all sampled rows.
- Repro logging produced `gpu-flow-retained-row-hover-redraw` events. The rapid
  sweep clear event dirtied all 12 recently hovered GUI rows with a source rect
  of `{ x: 0, y: 0, width: 552, height: 288 }`.

Artifacts:

- `perf/artifacts/2026-05-09_retained-row-hover-display-row0.png`
- `perf/artifacts/2026-05-09_retained-row-hover-display-rapid-final.png`
- `perf/artifacts/2026-05-09_retained-row-hover-display-cleared.png`

Focused tests:

`pnpm -C frontend exec vitest run src/gpuFlow/retainedContentRowHover.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx`

## Shortcuts Lingering Follow-up

Latest Chrome recording inspected:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260509-232916`

The recording did show the reported `shortcuts` case. Clear redraw events for
`settings-section__shortcuts:param-content:unpinned` computed the expected dirty
rows and dirty source rects, but some of those clears were followed by texture
uploads on a frame whose reason was only `manual`. That meant the retained
source canvas had been redrawn, but the WebGPU texture could still sample the
browser's previous element paint record before the requested html-in-canvas
paint completed.

Change:

- Explicit retained row hover dirties now mark the texture as waiting for the
  source surface's next paint, not merely the next frame tagged `paint`.
- Paint invalidation now reports `paintedSurfaceIds`, including explicit dirty
  sources, so the texture manager can release that wait only after the matching
  retained source canvas has actually painted.
- Post-paint upload-budget spillover is allowed to continue on later
  `texture-upload` frames because the stale-paint risk has already passed.

After CDP check:

- Fast hover/leave sweep over 12 visible `shortcuts` rows for 5 cycles.
- `gpu-flow-retained-row-hover-redraw` clear events: `5`.
- `shortcuts` texture uploads after those clears on non-paint frames: `0`.
- Source canvas samples after the final leave matched baseline for all sampled
  rows, and `__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__()` reported no hovered
  `shortcuts` rows.

Artifact:

- `perf/artifacts/2026-05-09_retained-row-hover-shortcuts-cleared.png`

Focused tests:

`pnpm -C frontend exec vitest run src/gpuFlow/htmlSurfaces/texturePaintDeferral.test.ts src/gpuFlow/htmlSurfaces/textures.test.ts src/gpuFlow/htmlSurfaces/frame.test.tsx src/gpuFlow/htmlSurfaces/paintInvalidation.test.ts src/gpuFlow/retainedContentRowHover.test.ts src/gpuFlow/GpuRetainedContentSurfaces.test.tsx src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx src/gpuFlow/GpuFlow/retainedContentSources.test.tsx`
