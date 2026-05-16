# GPU Flow Scroll-First Retained Compositor Refactor

Date: 2026-05-15

## Baseline

Original repro recording referenced by the implementation plan:

- Chrome recording: `recording-20260515-115307`
- Retained scroll flush was not the bottleneck: 311 flushes averaged about
  `0.004ms`, with max flush latency about `8.7ms`.
- Display-frame publisher held 314 frames in
  `hold-previous-frame-with-scroll-lag`.
- Worst scroll lag reached `3269px` and lasted `1532.7ms`.
- Desired scroll revision advanced from `222` to `356` while the published
  scroll revision stayed pinned at `222`, then jumped to the final revision.

## After

Verification after the scroll-first compositor refactor:

- `pnpm -C frontend exec vitest run src/gpuFlow`: 114 files, 735 tests passed.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface`:
  27 files, 157 tests passed.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts`:
  2 files, 9 tests passed.
- Retained compositor focused E2E rerun:
  `settings-retained-compositor-scroll-continuity.spec.ts` and
  `settings-retained-text-like-row-rendering.spec.ts`: 3 tests passed.
- Earlier full retained/GPU Flow Playwright batch in this implementation pass:
  40 tests passed.
- `./scripts/quality/check.sh`: passed.

Chrome recording after refactor:

- Recording: `recording-20260515-133103`
- Event count: 213
- App-state retained-scroll sequence:
  `settings-section__sectionSizingPolicy:param-content:unpinned` moved through
  offsets `0 -> 240 -> 480 -> 720 -> 1080 -> 1440 -> 1080 -> 1680 -> 960`.
- Artifact grep found no `hold-previous-frame`, `scrollLag`,
  `heldScrollFrame`, or `visiblePreparationProgress` diagnostics.

CDP visual verification:

- Live Settings GPU Flow loaded with CanvasDrawElement/WebGPU enabled.
- No GPU flow support error was present.
- Retained debug rows after scroll offset application:
  479 total retained rows, 18 visible rows for
  `settings-section__sectionSizingPolicy:param-content:unpinned`, offset
  `{ x: 0, y: 960 }`.

## Residual Risk

This local environment did not produce a 120 Hz-capable performance proof.
Native CDP input in the Chrome repro recorder did not return, macOS
accessibility input was unavailable, and the recorder page's
`requestAnimationFrame` did not tick until a recorder-only shim was applied.
The finalized recording therefore proves the retained runtime scroll state and
absence of stale hold diagnostics, but its texture report has `frameCount: 0`
and does not close the true 120 Hz hardware performance risk.
