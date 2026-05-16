# GPU Flow Transactional Retained Compositor Verification

Date: 2026-05-15

## Scenario

- Implemented transactional retained compositor contracts for region manifests, committed coverage queries, replacement transactions, eviction protection, and visible true-hole scheduling budgets.
- Final follow-up tightened active viewport deferral so visible true-hole frames still run retained maintenance, and covered-refinement frame-cache reuse no longer applies to cached true-hole frames.
- Exercised the All Settings retained-content flow with viewport zoom, viewport pan, retained-section scroll, retained-hover zoom, and retained text activation.
- Browser: Chrome for Testing Canary 150.0.7835.0, macOS arm64.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow`
  - 115 files passed, 743 tests passed.
- `pnpm -C frontend exec vitest run src/components/Pages/Project/GpuProjectSurface src/components/Pages/Project/gpuFlowCompatibilityMatrix.test.ts src/components/Pages/Project/gpuFlowCompatibilityFixture.test.ts`
  - 29 files passed, 166 tests passed.
- `pnpm -C frontend exec vitest run tests/e2e/gpuFlowInteractionLatencyProbe.test.ts tests/e2e/gpuFlowLargeGraphStressFixture.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts tests/e2e/gpuFlowVisualParityProbe.test.ts`
  - 4 files passed, 17 tests passed.
- `./scripts/run-playwright-e2e.sh tests/e2e/gpu-flow tests/e2e/settings/settings-gpu-retained-interaction.spec.ts`
  - 7 tests passed.
  - Final rerun logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-e2e-logs-setta.go-rewrite-20260515-212228`.
- `./scripts/run-playwright-e2e.sh <explicit settings-retained-*.spec.ts list>`
  - 36 tests passed.
  - Final rerun logs: `/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-e2e-logs-setta.go-rewrite-20260515-212352`.
- `./scripts/quality/check.sh`
  - Passed.

`pnpm -C frontend typecheck` was also attempted, but the current frontend typecheck fails on broad existing errors outside this change, starting in `AppHeader`, `Chat`, and `utils`.

## Chrome Recording

- Bundle: `/private/var/folders/7t/11607ml14sjf_yx1xt0hg54h0000gn/T/setta-chrome-recordings/setta.go-rewrite-transactional-retained-20260515-210310`
- Latest resolver: `./scripts/latest-chrome-recording.sh --json`
- Texture summary command: `.venv/bin/python scripts/chrome_repro_gpuflow_texture_report.py --artifact-dir <bundle> --markdown`

Summary:

- GPU-flow frames: 424.
- Retained page uploads: 194 frames, 381,855,040 bytes.
- Max retained committed memory: 243,798,528 bytes.
- Final retained display frames converged to `coverageReadiness: "covered"`, `trueHoleRectCount: 0`, `exactPageCount: 92`, `compatiblePageCount: 0`.
- During the post-gesture repair window, compatible lower-LOD coverage was published while exact replacement pages uploaded, then exact coverage replaced it.

Residual recording note:

- The recording includes the first All Settings warm-up before retained pages are committed. That initial population still reports large `initial-loading`/`true-holes` regions because no prior compatible coverage exists for newly exposed All Settings content.
- The recording is not a clean 120 Hz proof. The recorder/Vite/dev path reported long tasks and high frame interval variance, while the dedicated Playwright performance specs above passed their refresh-rate-aware budgets.

## Result

The retained publication path now has explicit region compatibility and mapping proof instead of treating page-grid/source-rect identity as semantic truth. The added regression coverage verifies that a coarse committed page with different page-derived content version can safely cover a zoomed target subset when row segment proof matches.

The final deferral/cache gate keeps interaction-time maintenance active for prepared frames with visible true holes, while still allowing already-covered refinement backlog to defer during active viewport frames.
