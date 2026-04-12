# Settings Graph `interactionReactFlowStateSync` state-machine edge node-geometry selector

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Summary

- `StateMachineEdgeRenderer` now subscribes to `useNodeInternals` through a
  geometry-only comparator instead of the raw node-internals map identity.
- This keeps the mounted workflow-edge surface from re-committing when
  unrelated node-internals fields such as `tempZIndex` change.

## Files

- `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx`
- `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
- Chrome DevTools MCP smoke on live worktree `/settings` graph surface
