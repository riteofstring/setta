# GPU Flow Projection Transaction Diagnostics

Date: 2026-05-19
Area: frontend

## Goal

Complete the principled projection runtime diagnostic surface by carrying the
visible projection transaction identity into frame performance events and the
Playwright performance probe. Browser-observed frame cadence and content-work
guardrails can now be correlated with the committed frame id, projection sample
id, transaction id, transaction kind, projection lane, and held-previous state.

## Change

- Frame performance events include `projectionDiagnostics`.
- Content-publication and motion-projection frames report the same projection
  debug state already published to the canvas and DOM-control plane.
- The Playwright GPU Flow performance probe preserves projection diagnostics in
  node-layer frame summaries.
- The retained user-recording regression now fails if motion projection frames
  are missing transaction diagnostics.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/framePerformance.test.ts tests/e2e/gpuFlowPerformanceProbe.test.ts src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/domControlPlaneProjectionRuntime.test.tsx src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/committedSurfaceFrame.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/GpuFlow/flowFrame.test.ts`
  passed (`56` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-user-recording-regressions.spec.ts`
  passed (`2` tests).
- `./scripts/quality/check.sh` passed for the current changes.

## Notes

`pnpm -C frontend run typecheck` remains blocked by existing unrelated
repository-wide TypeScript errors outside the touched GPU Flow files. A filtered
typecheck output search found no diagnostics in the touched files.
