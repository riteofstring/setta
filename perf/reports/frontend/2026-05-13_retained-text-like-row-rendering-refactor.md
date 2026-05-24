# Retained Text-Like Row Rendering Refactor Follow-Up

Date: 2026-05-13
Area: frontend

## Goal

Close the May 13 retained text-like row blanking regressions from
`docs/plans/retained-text-like-row-rendering-refactor-plan.md`, especially the
All Settings rows called out by the diagnostics:

- `sectionSizingPolicy.metaControlByType.TextParam.minHeight`
- `callableSectionDefault.columnWidth`

## Before

Source: `perf/reports/retained-text-like-row-diagnostics-20260513.md`,
recording `recording-20260513-094544`.

- Visible passive text-like rows peaked at 403.
- Worst passive readiness had 352 missing passive rows, including 350 fully
  blank rows.
- Final snapshot state still had 89 missing passive rows and 81 fully blank
  passive rows out of 371.
- Snapshot maintenance was budget-exhausted on 280 of 356 events.
- Snapshot maintenance uploaded about 786 MB across 1,049 uploads.
- Peak queued/missing retained page work reached 233 items.
- Diagnostics were dominated by visible `lod-refinement` work.
- The recording had 19 frame-gap events, average 98.2 ms, max 391.7 ms.
- The recording had 13 long tasks, max 350 ms.
- The `TextParam.minHeight` preflight source element was missing and its canvas
  probe was all-zero pixels.
- The `callableSectionDefault.columnWidth` source element was present and
  current, but its canvas probe was still all-zero pixels.

## Fixes

- Missing retained texture page descriptors without drawable fallback are now
  queued as `first-visible` work instead of passive `lod-refinement`. Sharper
  pages that are already covered by stale or lower-LOD fallback remain
  `lod-refinement`.
- `first-visible` work now orders before stale visible content work and remains
  uploadable during active viewport interaction.
- Retained text-like snapshot sources now receive scene updates after retained
  section scroll and keyboard/drag scroll commits, so the hidden row snapshot
  DOM tracks the imperative retained scene instead of staying on the original
  React scene prop.
- The All Settings E2E row probes now require the row sample point to be inside
  the retained canvas clip before treating a debug row as visible.
- CodeMirror pixel analysis now recognizes warm token colors such as the red
  `null` token in `callableSectionDefault.columnWidth`.
- Retained text-like snapshot page uploads now defer the page when Chromium has
  not cached a paint record for a current source element yet. The failed
  candidate texture is discarded, a new paint is requested, and the queued page
  retries instead of surfacing an upload error.
- Retained snapshot source updates now request a fresh canvas paint when the
  row source key changes without remounting the hidden source element.
- Text-like snapshot uploads now call `copyElementImageToTexture` on the
  `GPUQueue` receiver instead of invoking the WebGPU method as a detached
  function. This keeps native uploads and the E2E performance probe wrappers on
  the same supported call path.

## After

The new targeted E2E first reproduced the original failure for
`TextParam.minHeight` with `passiveInk: null` and an all-grid screenshot before
the runtime fixes. After the changes:

- `TextParam.minHeight` has visible passive retained pixels before click.
- `TextParam.minHeight` remains nonblank on immediate activation.
- `TextParam.minHeight` active CodeMirror text ink stays aligned with the
  passive preview and remains visible.
- `TextParam.minHeight` returns to nonblank passive retained pixels after blur.
- `callableSectionDefault.columnWidth` has visible passive retained pixels for
  its `null` token before click.
- The existing retained scroll E2E no longer counts rows outside the retained
  canvas clip as visible work and passes all retained CodeMirror scroll checks.
- CDP visual verification loaded All Settings with the required
  `CanvasDrawElement`/WebGPU flags, showed retained settings content, and
  produced no retained upload console errors after the paint-record deferral
  and GPUQueue receiver fix.

No new interactive Chrome repro bundle was captured for this follow-up. The
after evidence is the automated pixel, scroll, and frame-budget guardrails
below.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/retainedContentControllers.test.tsx src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/retainedTextureWorkQueue.test.ts src/gpuFlow/retainedTextureUploadScheduler.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/retainedContentFrameGeneration.test.ts src/gpuFlow/GpuFlow/retainedTextLikeRowSnapshotSources.test.ts`
  - 7 files passed, 41 tests passed.
- `./scripts/go.sh test ./internal/settingsstate`
  - Passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-text-like-row-rendering.spec.ts`
  - 1 test passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-codemirror-activation.spec.ts`
  - 3 tests passed.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-codemirror-scroll.spec.ts`
  - 5 tests passed after the visibility predicate correction.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-interaction-stability.spec.ts -g "fast settings zoom remains visibly responsive and does not blank content"`
  - 1 test passed.
  - Guardrail asserts p95 frame interval below 28 ms, slow-frame ratio below
    0.18, and nonblank retained content after fast zoom.
- `./scripts/run-playwright-e2e.sh settings/settings-retained-scroll-performance.spec.ts`
  - 1 test passed.
  - Guardrail asserts retained section wheel scrolling does not refill the
    texture backlog, does not perform broad retained reuploads, keeps content
    visible, and keeps worst sampled frame interval below its budget.
- CDP visual check
  - Loaded `http://127.0.0.1:59568/settings` against a live E2E backend with
    `CanvasDrawElement`, unsafe WebGPU, and WebGPU developer features enabled.
  - All Settings rendered with retained row debug count 476.
  - Retained text-like snapshot source count was 401.
  - Screenshot:
    `/tmp/setta-retained-all-settings-cdp-final.png`.
  - Console after reload had no retained upload errors; only Vite dev logs, the
    React DevTools info message, the existing React Router future-flag warning,
    and an existing form-field accessibility issue remained.
- `./scripts/quality/check.sh`
  - Passed.

## Conclusion

The remaining May 13 blank-row failure was caused by two distinct problems:
missing visible pages were treated as deferrable LOD refinement, and row snapshot
source DOM did not follow imperative retained section scroll scene updates. The
runtime now prioritizes uncovered visible retained pages, refreshes row snapshot
sources when retained content scrolls or source keys change in place, preserves
native GPUQueue receiver semantics for snapshot copies, and defers only the
specific Chromium missing-paint-record race until the source can be copied. The
two diagnostic All Settings rows have direct pixel coverage, and the adjacent
retained editor scroll and fast zoom guardrails pass.
