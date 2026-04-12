# Settings Graph `interactionReactFlowStateSync`: edge-handle connecting subscription removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Goal

Remove connection-start React Flow subscriptions from mounted section edge
handle surfaces when the visual "connecting" affordance is already driven by
the root `.react-flow[data-connecting="true"]` CSS state.

## Product slice

- `frontend/src/components/Section/Container/AgenticEdgeHandles.tsx`
  no longer subscribes to `connectionStartHandle !== null`
- `frontend/src/components/Section/Container/ChatSharedEdgeHandles.tsx`
  no longer subscribes to `connectionStartHandle !== null`
- `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx`
  no longer subscribes to `connectionStartHandle !== null`
- `frontend/src/forks/xyflow/core/styles/style.css`
  drops the now-dead `.agentic-handle--selecting` selectors and continues to
  reveal connecting handles through the existing root
  `.react-flow[data-connecting="true"]` / connection-line CSS paths
- `frontend/src/components/Section/Container/EdgeHandles.test.tsx`
  adds profiler coverage proving the three mounted handle surfaces do not
  commit when only `connectionStartHandle` changes

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/EdgeHandles.test.tsx`
- `pnpm -C frontend exec prettier --check src/components/Section/Container/AgenticEdgeHandles.tsx src/components/Section/Container/ChatSharedEdgeHandles.tsx src/components/Section/Container/StateMachineEdgeHandles.tsx src/components/Section/Container/EdgeHandles.test.tsx src/forks/xyflow/core/styles/style.css`
- required headless Chrome DevTools MCP smoke on worktree `/settings`

## Reading

- This removes one more whole-surface render fan-out during connect-start
  gestures across mounted section chrome.
- The behavior stays rooted in the already-existing `.react-flow` connecting
  state instead of per-handle React subscriptions.
- The next bounded `interactionReactFlowStateSync` slice should continue
  isolating mounted section chrome/body subscribers that still fan out on
  shared motion or interaction state.
