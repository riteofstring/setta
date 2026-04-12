# 2026-04-15 Settings Graph React Flow Viewport Publish Reason Attribution Seam

- canonical lane: `rotaryParamCodeObjDefault`
- scope:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  - `frontend/tests/e2e/settings/graphSubstrateParityProbe.ts`
- purpose:
  - extend the existing canary motion-attribution seam so live probes can rank
    `reactFlowViewportPublish` by concrete reason instead of only by owner

## Landed seam

- the shared instrumentation snapshot now exposes
  `reactFlowViewportPublishAttribution`
- the viewport runtime now records the same duration into both:
  - owner-level `motionAttribution.reactFlowViewportPublish`
  - reason-level `reactFlowViewportPublishAttribution.<reason>`
- the shared Playwright parity/perf helper now clones and diffs that reason map
  across a capture window, so the existing live motion probe can report the
  reason breakdown without a new probe family

## Covered reasons

- `initialTransformDiff`
- `zoomDiff`
- `nonLocalPanDiff`

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed (`2` files, `25` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx tests/e2e/settings/graphSubstrateParityProbe.ts`
  - passed

## Live readout status

- direct focused Playwright attempts against the current worktree runtime did
  not produce a trusted live ranking in this pass:
  - direct `playwright test` invocation hit existing runner drift
    (`SETTA_BOOTSTRAP_TOKEN` / JSON import attribute issues)
  - a one-off browser script reached session/bootstrap friction before the
    normalized canary lane mounted
- this pass therefore lands the attribution seam only; it does not claim a new
  dominant live reason yet

## Reading

- the next canonical pass should use the existing normalized live motion probe
  on `rotaryParamCodeObjDefault` and read
  `perf.reactFlowViewportPublishAttribution`
- do not spend another iteration extending probe plumbing for this owner unless
  the live capture still cannot return the new field
