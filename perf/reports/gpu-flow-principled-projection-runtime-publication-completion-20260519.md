# GPU Flow Projection Publication Completion Guard

Date: 2026-05-19
Area: frontend

## Goal

Close the visible-publication completion gap in the principled projection
runtime. A selected motion, content, or maintenance lane must only be marked
drained after a visible frame actually publishes. If coverage blocks the frame
or rendering resources are unavailable, the lane remains queued and the runtime
requests another frame for the still-pending debt.

## Change

- The visible publication scheduler now returns post-completion debt and accepts
  an explicit `published` result for the selected lane.
- The GPU Flow surface frame loop reports whether motion projection or content
  publication produced a visible frame before completing the scheduler decision.
- A blocked publication keeps the selected lane debt queued, so the follow-up
  request targets the real pending lane instead of trusting the pre-render debt
  snapshot.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts`
  passed (`24` tests).
- `pnpm -C frontend exec vitest run src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/GpuFlow/flowSurface.test.tsx src/gpuFlow/framePerformance.test.ts`
  passed (`38` tests).
- `./scripts/quality/check.sh` passed for the current changes.
- CDP loaded `/settings` with `CanvasDrawElement` and WebGPU flags enabled.
  The Settings GPU Flow surface loaded without the html-in-canvas support error,
  reported one GPU Flow canvas, one DOM-control plane, `358` committed DOM
  control actors, `15` mounted DOM-control hosts, and a publishable committed
  surface frame. Browser screenshot capture timed out in this debug session, so
  visual confirmation used the CDP accessibility snapshot and live DOM/runtime
  diagnostics.

## Notes

This is a scheduler correctness guard rather than a styling change. It protects
the plan invariant that publication debt cannot be silently dropped when a
visible transaction holds or blocks before it reaches the canvas/DOM-control
surface.
