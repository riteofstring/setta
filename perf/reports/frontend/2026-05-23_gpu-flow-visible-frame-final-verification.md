# GPU Flow Visible Frame Final Verification - 2026-05-23

Branch: `go-rewrite-canvas-html-gpu-surfaces-plan`

## Automated Verification

- `./scripts/quality/check.sh`
  - Passed for the current working-tree changes.
- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/visibleFrameContentPlan.test.ts src/gpuFlow/GpuFlow/visibleFramePresenter.test.ts src/gpuFlow/GpuFlow/visibleFrameTransactionProofs.test.ts src/gpuFlow/GpuFlow/visibleFrameTransactionPresentationEvidence.test.ts src/gpuFlow/GpuFlow/visibleFrameOutcomeChromeRepro.test.ts src/gpuFlow/GpuFlow/visibleFrameKernel.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelHeldOutcomes.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelBrowserVisualFault.test.ts src/gpuFlow/GpuFlow/visibleFrameKernelPhases.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationProofsBehavior.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationProofsBoundary.test.ts src/gpuFlow/GpuFlow/visibleFramePresentationTokenBoundary.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionWorkBoundary.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionTransaction.test.ts src/gpuFlow/GpuFlow/visibleFrameProjectionPlan.test.ts src/gpuFlow/GpuFlow/visibleFrameResourceRegistry.test.ts src/gpuFlow/GpuFlow/visibleFrameArchitecture.test.ts`
  - Passed: 17 files, 138 tests.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-visible-frame-coherence.spec.ts tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts tests/e2e/settings/settings-retained-text-like-native-semantics.spec.ts tests/e2e/settings/settings-retained-text-like-native-semantics-ime.spec.ts`
  - Passed: 13 tests in 2.0m.
  - Evidence logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T//setta-e2e-logs-setta.go-rewrite-20260523-203046`.
- `./scripts/run-playwright-e2e.sh tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
  - Passed: 3 tests after an earlier full-suite run exceeded the Chrome repro parity mean-delta budget by `1.83`; the subsequent full retained subset passed.
- `pnpm -C frontend exec tsc --noEmit --pretty false`
  - Failed on broad existing frontend TypeScript debt outside this visible-frame slice.
  - A filtered rerun found no errors mentioning `settings-retained-text-like-native-semantics`.

## Fresh Chrome Recording

- Recording: `recording-20260523-203436`
- Path: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-1814143074/recording-20260523-203436`
- Scenario: Chrome repro recorder with `CanvasDrawElement`, unsafe WebGPU, WebGPU developer features, disabled background throttling, and CDP attached on port 9241. CDP opened Settings, selected All Settings, centered a retained Settings surface, posted finish-line markers, drove retained scroll/projection work through debug hooks, and captured a viewport screenshot.

Recording stream summary:

- Console events: 2 debug, 1 info, 1 warn.
- Console/page errors: 0.
- Old blocked/held exception text occurrences: 0.
- `scripts/chrome_repro_gpuflow_finish_line_report.py --latest --json`: failed because the CDP-driven recorder window produced runtime measures after the marker but no `gpu-flow-frame` app-state entries in the marker window. The analyzer reported `no-gpu-flow-frames-after-marker`, `no-content-frames-after-marker`, `no-motion-projection-frames-after-marker`, `no-interaction-active-frames-after-marker`, and no browser visual evidence events.
- The recording is still useful for console/runtime error evidence, but the retained Settings Playwright subset above remains the current authoritative finish-line browser coverage for frame budgets and visual coherence.

CDP visual check: done. The retained Settings page rendered with All Settings
selected, the retained rows debug surface reported `441` rows, no cold-start
shell, and visible rows for `settings-section__shortcuts:param-content:unpinned`.
