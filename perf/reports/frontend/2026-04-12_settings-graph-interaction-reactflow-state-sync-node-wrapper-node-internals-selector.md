## Summary

- Lane: `rotaryParamCodeObjDefault`
- Measured owner: `interactionReactFlowStateSync`
- Slice: narrow mounted `NodeWrapper` subscriptions to the node-internals
  fields that actually affect the wrapper render output

## Why this slice

- Recent runs already removed several control and edge-shell subscriptions.
- The next likely mounted fan-out boundary was the top-level node wrapper,
  because every mounted section body sits under `NodeWrapper`.
- Before this change, `NodeWrapper` subscribed to the entire node-internals
  entry with deep equality even though the wrapper render path only used:
  - `position`
  - `tempZIndex`
- That meant unrelated node-internals updates such as measured size or
  handle-bounds churn could still force full section-wrapper commits.

## Change

- `frontend/src/forks/xyflow/core/components/wrapNode.tsx`
  now selects only `{ position, tempZIndex }` from `useNodeInternals(...)`.

## Focused evidence

- Added profiler regression coverage in
  `frontend/src/forks/xyflow/core/components/wrapNode.test.tsx`.
- The new test proves `NodeWrapper` does not commit when the same node only
  changes:
  - `width`
  - `height`
  - `measured`
  - `handleBounds`
- A paired test proves the wrapper still re-renders when `position` changes,
  so drag/layout movement remains live.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/components/wrapNode.test.tsx`
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/components/wrapNode.tsx src/forks/xyflow/core/components/wrapNode.test.tsx`

## Reading

- This is a worktree-side product slice inside `interactionReactFlowStateSync`,
  not another harness-only pass.
- The expected payoff is lower mounted section-body/chrome commit fan-out when
  shared node-internals metadata updates without a visible position/z-index
  change.
