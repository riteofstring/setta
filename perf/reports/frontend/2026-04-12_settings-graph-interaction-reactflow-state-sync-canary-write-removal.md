# Settings Graph Interaction ReactFlow State Sync Canary Write Removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Remove canary-only mirroring of viewport interaction flags into the legacy
React Flow store now that the graph-substrate root attribute owns the shell
motion hint and the canary path no longer reads those store fields.

## Product slice

- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts`
  no longer writes `paneDragging` / `viewportInteractionActive` into the
  React Flow store from `syncViewportInteractionState(...)`
- `frontend/src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  now asserts canary interaction sync leaves existing React Flow interaction
  flags untouched while the root attribute still toggles

## Verification

- `pnpm -C frontend exec vitest run src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryInstrumentation.test.ts src/forks/xyflow/core/container/Pane.test.tsx`
  - passed (`3` files, `18` tests)
- `pnpm -C frontend exec prettier --check src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.ts src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed
- fresh-context headless CDP smoke on explicit worktree/reference `/settings`
  URLs
  - both settings graph surfaces mounted successfully after a short startup
    wait
  - no obvious graph-substrate visual drift observed for this slice

## Reading

- This closes the remaining canary-owned write path for
  `interactionReactFlowStateSync` rather than only pruning subscribers to it.
- The legacy `ZoomPane` path still owns those React Flow flags for the
  non-canary substrate; this slice only removes the canary mirror.
