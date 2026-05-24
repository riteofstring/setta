# GPU Flow DOM-Control Projection Horizon

Date: 2026-05-19
Area: frontend

## Goal

Close the remaining DOM-control projection gap in the principled projection
runtime. Retained DOM-control hosts should be prepared from a bounded
near-future horizon and promoted from the current projection sample without
waiting for a React content commit.

## Change

- Runtime hit-test surfaces now sample retained row scenes with enough scroll
  overscan to cover the DOM-control projection horizon.
- Retained DOM-control source extraction keeps near-future controls in the
  committed runtime frame while preserving clipped visible geometry for actual
  projection.
- The DOM-control projection manager can mount prepared `outside-viewport`
  controls once the retained scroll sample brings them into range.
- The DOM-control plane refreshes host assignments from the live viewport and
  retained-scroll offsets during overlay projection, instead of only deriving
  hosts from the React-rendered frame.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/GpuFlow/retainedDomControlSources.test.ts src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/committedSurfaceFrame.test.ts`
  passed (`40` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-dom-control-observed-regressions.spec.ts`
  passed (`4` tests).
- `./scripts/quality/check.sh` passed for the current changes.
- `pnpm -C frontend exec tsc --noEmit --pretty false --noErrorTruncation` still
  fails on existing unrelated frontend type errors. Filtering the compiler
  output for the changed GPU Flow runtime files produced no local errors.
- CDP loaded `/settings` with `CanvasDrawElement` and WebGPU flags enabled. The
  retained surface reported a publishable committed frame with
  `viewportOverscanCssPx: 720`, `domControlActorCount: 358`, and
  `projectedVisibleNonemptyDomControlCount: 17`; the DOM-control plane mounted
  `25` visible control hosts. Browser screenshot capture timed out in this
  debug session, so visual confirmation used the CDP accessibility snapshot and
  live DOM/projection diagnostics.

## Conclusion

The runtime now has a concrete bounded DOM-control preparation horizon and can
promote prepared controls directly from projection samples. This removes the
remaining React-commit dependency for DOM-control host selection while keeping
the mounted host budget bounded.
