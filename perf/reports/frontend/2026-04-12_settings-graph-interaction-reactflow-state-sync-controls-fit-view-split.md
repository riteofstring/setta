# Settings Graph Interaction ReactFlow State Sync Controls Fit View Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce mounted controls re-render fan-out on the canary lane by keeping the
React Flow `fitViewOnInit` subscription scoped to the fit-view button instead
of the full controls toolbar.

## Product slice

- `frontend/src/forks/xyflow/controls/Controls.tsx`
  now renders the fit-view affordance through a memoized
  `ControlsFitViewButton` child that owns the `useReactFlow((x) => x.fitViewOnInit)`
  subscription
- the rest of `Controls` no longer subscribes to `fitViewOnInit`, so the
  non-fit-view toolbar chrome stays out of that React Flow update path
- `frontend/src/forks/xyflow/controls/Controls.test.ts`
  now verifies the fit-view button active styling still follows
  `fitViewOnInit` after the split

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/controls/Controls.test.ts`
  - passed (`1` file, `4` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/controls/Controls.tsx src/forks/xyflow/controls/Controls.test.ts`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - verified the left controls rail rendered with visible `zoom in`,
    `zoom out`, and `fit view` buttons and no obvious layout regression

## Reading

- This does not remove the `fitViewOnInit` update; it narrows the subscribed
  surface from the entire controls toolbar to the single button that actually
  reflects that state.
- The next product-side `interactionReactFlowStateSync` pass should keep
  looking for another mounted controls or section-body surface whose React Flow
  subscription can be isolated without changing canary behavior.
