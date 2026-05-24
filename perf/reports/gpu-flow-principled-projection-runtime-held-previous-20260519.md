# GPU Flow Principled Projection Runtime Held-Previous Follow-Up

Date: 2026-05-19
Area: frontend

## Goal

Close the remaining held-previous coherence gap in retained-scroll projection.
When a motion sample cannot prove retained page coverage, the visible
transaction now uses the previous coherent projection sample instead of pairing
previous retained pixels with newer DOM/hit/debug state.

## Change

- Retained-scroll projection resolves the desired sample first, checks missing
  coverage, and switches to a `held-previous` projection transaction when a
  previous coherent projection exists.
- Held projection preserves the previous committed frame id and projection
  sample id, while retaining maintenance debt for the missing desired coverage.
- Motion projection rendering passes the selected transaction sample's viewport
  into canvas rendering and node-layer state, so debug attributes, DOM
  transforms, hit state, and drawn pixels stay tied to one sample.

## Verification

- `pnpm -C frontend exec vitest run src/gpuFlow/GpuFlow/flowProjectionFrame.test.ts src/gpuFlow/GpuFlow/flowFrame.test.ts src/gpuFlow/projectionRuntime.test.ts src/gpuFlow/GpuFlow/domControlPlane.test.ts src/gpuFlow/committedSurfaceFrame.test.ts`
  passed (`27` tests).
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-retained-compositor-scroll-continuity.spec.ts`
  passed (`2` tests).
- `./scripts/quality/check.sh` passed for the current changes.
- `pnpm -C frontend exec tsc --noEmit --pretty false --noErrorTruncation` still
  fails on existing unrelated frontend type errors. Filtering the compiler
  output for `src/gpuFlow/GpuFlow/(flowProjectionFrame|flowSurfaceFramePublication|flowFrame)`
  produced no local errors.

## Notes

CDP visual verification was not rerun for this patch because the change is a
transaction coherence guard with focused unit coverage and no visible styling or
layout change.
