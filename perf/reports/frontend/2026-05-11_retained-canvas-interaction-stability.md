# Retained Canvas Interaction Stability

Date: 2026-05-11

## Baseline Recording

Source: latest Chrome repro recording at
`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-101853`.

The recording exercised settings retained content hover, switch clicks, All
Settings, and repeated Ctrl+wheel zoom gestures.

Observed frame and retained-page metrics from `app_state.ndjson`:

- 2,592 `gpu-flow-frame` samples.
- p95/p99 retained frame duration was 18.3 ms / 20.0 ms.
- p95/p99 visible retained target-page demand was 4,158 / 4,244
  descriptors. The source recording predates the explicit target-descriptor
  diagnostic, so this is computed from retained draw quads plus missing target
  descriptors.
- p95/p99 missing target pages was 1,719 / 1,719.
- p95/p99 fallback draw quads was 2,439 / 2,525.
- p95/p99 fallback candidate scans was not available in the baseline recording.
- 1,321 frames reported retained page budget exhaustion.
- 1,176 viewport frames and 1,187 deferred-resolution frames.
- 744,425 total missing retained page references.
- 1,195,226 total fallback draw quads.
- 4,710 page uploads, totaling 3,974,631,072 uploaded bytes.
- Worst retained frame duration: 28.6 ms at frame 2093, zoom 10, with 1,719 missing pages.
- All Settings click produced a 128 ms long task and a frame gap.
- Repeated All Settings zoom burst window averaged 13.37 ms per retained frame, with 564,798 missing page references and 661,029,808 uploaded bytes.
- Post-switch window still reported 19,890 missing page references and 721,412,096 uploaded bytes.

Hover redraw events showed full-width dirty source rects, for example
`settings-section__gui:param-content:unpinned` dirty rects at `width: 552`.
That points away from row-state computation and toward page coverage/upload
continuity when a visible row spans multiple retained pages.

## Implemented Stabilizers

- The retained page manager now owns the active viewport zoom bucket and freezes
  it while the viewport is moving.
- Stale queued LOD refinement work is canceled when the target LOD scale changes.
- Retained page coverage can use same-surface stale content pages from a
  compatible source-window origin as visual fallback until exact current pages
  are uploaded.
- Retained row scene data now carries explicit row visual bounds; row
  background and row hit targets use those bounds while labels, controls, and
  DOM islands keep their narrower content/control geometry.
- Retained page descriptors now derive content identity from the row segments
  intersecting each page, so one changed switch row does not force every page in
  the surface to become a new content version.
- Committed page lookup is indexed by surface and source window/source-window
  origin, and adjacent draw quads sampling the same committed page are merged.
- Retained texture follow-up frames are requested only while uploadable work
  remains or a committed refinement changes drawable coverage; an upload by
  itself is no longer reported as retained page budget pressure.

## After Recording

Source: Chrome repro recording driven through the dedicated recorder with
explicit settings hover, switch click, All Settings, and repeated Ctrl+wheel
zoom:

`/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260511-114345`.

Observed frame and retained-page metrics from `app_state.ndjson`:

- 674 `gpu-flow-frame` samples.
- 646 viewport-related frames.
- 1 frame exceeded 16.7 ms.
- p95 retained frame duration was 2.5 ms; p99 was 6.7 ms.
- p95/p99 visible retained target-page demand was 90 / 90 descriptors. This
  recording predates the explicit target-descriptor diagnostic added by the
  fix, so it is computed from retained draw quads plus missing target
  descriptors; future recordings emit
  `retainedTexturePageTargetDescriptorCount` directly.
- p95/p99 missing target pages was 0 / 73.
- p95/p99 fallback draw quads was 0 / 0.
- p95/p99 fallback candidate scans was 0 / 0.
- p95/p99 merged draw quads was 0 / 0.
- p95/p99 stale fallback draw quads was 0 / 0.
- Worst retained frame duration was 23.3 ms on initial settings load, with 90
  missing pages and 1 upload.
- 23 frames reported retained page budget pressure.
- 29 frames had missing retained texture pages.
- 0 frames drew fallback retained texture pages during the recorded pass.
- 1,490 total missing retained page references.
- 0 total fallback draw quads.
- 0 total stale fallback draw quads.
- 92 page uploads, totaling 29,138,976 uploaded bytes.
- Final frame had 0 missing pages, 0 uncovered rects, 0 fallback quads, no
  retained page budget pressure, and 2.9 ms duration.

Compared with the baseline recording:

- Total missing retained page references dropped from 744,425 to 1,490.
- Total fallback draw quads dropped from 1,195,226 to 0.
- Retained uploaded bytes dropped from 3,974,631,072 to 29,138,976.
- Retained upload count dropped from 4,710 to 92.
- Budget-pressure frames dropped from 1,321 to 23.
- Worst retained frame duration dropped from 28.6 ms during zoom/page churn to
  23.3 ms during initial settings load.
- The fast zoom path now settles to fully covered retained content.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/retainedTexturePageGrid.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts`
  - 18 tests passed.
- `pnpm -C frontend exec vitest run src/gpuFlow/retainedContentScene.test.ts src/gpuFlow/retainedContentSceneVisualBounds.test.ts src/gpuFlow/GpuRetainedContentPageFrameSurfaces.test.ts src/gpuFlow/retainedTexturePages.test.ts src/gpuFlow/retainedTexturePageGrid.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/framePerformance.test.ts src/components/Pages/Project/GpuProjectSurface/projectGpuFramePerformance.test.ts`
  - 59 tests passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-interaction-stability.spec.ts --max-failures=0`
  - 3 tests passed.
- Chrome repro recorder pass:
  - `CHROME_EXTRA_ARGS="--remote-debugging-port=65379 --enable-blink-features=CanvasDrawElement --enable-unsafe-webgpu" ./scripts/record-chrome-repro.sh`
  - Reproduction was driven through Playwright-over-CDP against the recorder
    Chrome window.
