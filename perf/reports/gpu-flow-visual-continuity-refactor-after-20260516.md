# GPU Flow Visual Continuity Refactor After Report - 2026-05-16

Implementation and verification report for `docs/plans/gpu-flow-visual-continuity-refactor-plan.md`.

## Baseline

Before-refactor Chrome recording:

- Recording: `recording-20260515-234334`
- Artifact directory: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260515-234334`
- Source command: `./scripts/latest-chrome-recording.sh --json`

Baseline visual-continuity signals from that recording:

- Max retained true-hole area: `5,381,066` CSS px.
- Continuous true-hole window above `1,000,000` CSS px: `1343ms`.
- Aggregate true-hole time above `100,000` CSS px: `17,076ms`.
- Representative passive text-like frame `1740`: `401` passive rows, `30` ready, `371` missing, `368` blank.
- Representative blank retained sections: `shortcuts` had `49/62` blank rows, `sectionSizingPolicy` had `48/58` blank rows.

## Implementation Summary

- Retained display publication now rejects true-hole visual debt instead of publishing hole overlays.
- A deterministic pre-publish retained-page repair pass runs before display-frame publication and only allows publication once true-hole coverage is resolved.
- Snapshot-exact retained text-like rows wait for source readiness before upload descriptors are treated as ready.
- Retained coverage planning now preserves target metadata for uncovered regions, so identical local rects on different settings surfaces repair the correct surface.
- Switch interaction visuals keep the target state protected through zoom until the target scene has remained stable.
- The retained text-like row Playwright helper now handles post-spec settings state by exhausting the exact target search before using a same-surface passive fallback.

## Recorded Large-Scene Sample

- JSONL artifact: `perf/reports/gpu-flow-visual-continuity-refactor-after-20260516.jsonl`
- Source command: `SETTA_RETAINED_COMPOSITOR_PERF_JSONL=perf/reports/gpu-flow-visual-continuity-refactor-after-20260516.jsonl ./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-large-scene-performance.spec.ts`
- Browser: repo Chrome for Testing Canary `150.0.7835.0`.
- Cadence lane: refresh-aware `ci-capped`, not a claimed 120 Hz hardware run.
- Recorded at: `2026-05-16T18:30:01.097Z`.

Large scene shape:

- Nodes: `46`
- Retained rows: `476`
- Retained surfaces: `45`
- Control kinds: `color-picker`, `dropdown`, `nested`, `switch`, `text-like`
- Sampled retained surface: `settings-section__shortcuts:param-content:unpinned`
- Visible retained rows in sampled surface: `15`

Latest representative frame cadence:

- Pan: frame p95 `9.1ms`, max `25.0ms`, slow-frame ratio `0.008`, long-task max `0ms`.
- Viewport zoom: frame p95 `8.9ms`, max `9.4ms`, slow-frame ratio `0`, long-task max `0ms`.
- Retained-hover zoom: frame p95 `9.0ms`, max `9.3ms`, slow-frame ratio `0`, long-task max `0ms`.
- Retained section scroll: frame p95 `16.8ms`, max `33.4ms`, slow-frame ratio `0.052`, long-task max `0ms`.
- Scroll then retained-hover zoom: frame p95 `9.2ms`, max `25.1ms`, slow-frame ratio `0.037`, long-task max `0ms`.

Visible content checks from the recorded sample:

- Placeholder band count was `0` for all six large-scene screenshots.
- Before retained visual nonblank ratio: `0.9811`.
- After retained visual nonblank ratio: `0.9819`.
- Native page scroll stayed fixed at `0` during retained section scrolling.
- Retained scroll signature changed from first-row Y `144` to `-1150.3`.
- Control cadence p95 was `41.7ms`, max `49.9ms`.

## Verification Summary

- `pnpm -C frontend exec vitest run src/gpuFlow/retainedContentSwitchAnimation.test.ts src/gpuFlow/retainedContentSwitchVisuals.test.ts src/gpuFlow/retainedCommittedCoverageStore.test.ts src/gpuFlow/retainedVisibleCoveragePlanner.test.ts src/gpuFlow/retainedContentTexturePageManager.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/retainedTextureWorkQueue.test.ts`: passed, `7` files and `67` tests.
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-switch-zoom-flash.spec.ts frontend/tests/e2e/settings/settings-retained-text-like-row-rendering.spec.ts`: passed, `2` tests.
- Broad retained/GPU Playwright batch covering `frontend/tests/e2e/gpu-flow` and retained settings continuity specs: passed, `39` tests.
- `pnpm -C frontend exec vitest run src/gpuFlow src/components/Pages/Project/GpuProjectSurface src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts src/components/Pages/Project/GpuProjectSurface.grid.test.ts src/forks/dnd-kit`: passed, `157` files and `992` tests.
- Large-scene JSONL perf sample command above: passed, `1` test.

## Residual Risk

This report uses local refresh-aware cadence thresholds. It does not claim true 120 Hz hardware behavior. The recorded large-scene sample had no long tasks over `50ms`, no horizontal placeholder bands, and retained content stayed nonblank across the measured pan, zoom, retained-scroll, and mixed gestures.
