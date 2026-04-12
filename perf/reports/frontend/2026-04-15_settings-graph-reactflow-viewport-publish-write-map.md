# 2026-04-15 Settings Graph React Flow Viewport Publish Write Map

- canonical lane: `rotaryParamCodeObjDefault`
- scope:
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  - `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
- purpose:
  - produce the required closed-form ownership map for the remaining
    `reactFlowViewportPublish` branches before taking another viewport-runtime
    micro-cut

## Remaining real publish reasons

- `initialTransformDiff`
  - still real
  - meaning:
    - the first runtime sync must still publish when React Flow starts on a
      different transform than the canary's resolved authoritative viewport
- `zoomDiff`
  - still real
  - meaning:
    - once the transform has already been published, any later zoom change
      still has to republish into React Flow, including locally owned zoom
- `nonLocalPanDiff`
  - still real
  - meaning:
    - non-local ownership (`shared` / `auto-fit`) still has to publish `x` /
      `y` transform changes so React Flow stays aligned with the authoritative
      viewport

## Closed publish reasons

- local pan-only drift with unchanged zoom
  - closed
  - evidence:
    - `resolveReactFlowViewportPublishReason(...)` returns `null` when the
      owner is `local` and only `x` / `y` changed
- already-synced shared rerender
  - closed
  - evidence:
    - identical shared rerenders now resolve to `null`
- already-synced first mount
  - closed
  - evidence:
    - unsent initial mounts now resolve to `null` when React Flow already
      matches the authoritative viewport
- fit-view bootstrap flag settling without a transform diff
  - closed
  - evidence:
    - the runtime still syncs `fitViewOnInit` / `fitViewOnInitDone`, but that
      path no longer republishes `transform`

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts`
  - passed (`2` files, `24` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed

## Reading

- the next viewport-runtime pass should not guess at more no-op paths
- the only remaining legitimate publish branches are now explicit:
  `initialTransformDiff`, `zoomDiff`, and `nonLocalPanDiff`
- the next production cut should target one of those reasons directly, or use a
  trusted live probe to rank which one still dominates on the canonical lane
