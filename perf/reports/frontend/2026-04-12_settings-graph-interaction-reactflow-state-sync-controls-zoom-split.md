# Settings Graph Interaction ReactFlow State Sync Controls Zoom Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce canary motion re-render fan-out inside the mounted controls stack by
keeping the React Flow zoom-bound subscription scoped to the zoom buttons
instead of the whole controls toolbar.

## Product slice

- `frontend/src/forks/xyflow/controls/Controls.tsx`
  now renders the zoom in / zoom out buttons through a memoized
  `ControlsZoomButtons` child that owns the `useZoomReached()` subscription
- the rest of `Controls` no longer subscribes to `transform[2]`, so watch-code
  portal state and the non-zoom toolbar buttons stay out of the zoom update
  fan-out path
- `frontend/src/forks/xyflow/controls/Controls.test.ts`
  now verifies the zoom button disabled state still tracks React Flow zoom
  bounds correctly after the split

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/controls/Controls.test.ts`
  - passed (`1` file, `3` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/controls/Controls.tsx src/forks/xyflow/controls/Controls.test.ts`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - verified the controls toolbar rendered with visible zoom in / zoom out
    buttons and no obvious control-stack layout regression

## Reading

- This slice does not remove zoom-bound updates entirely; it narrows their
  React render surface from the full toolbar to the two zoom buttons that
  actually need the current zoom-bound disabled state.
- The next product-side `interactionReactFlowStateSync` slice should keep
  looking for mounted controls or DOM-backed section-body chrome that still
  subscribe to motion-heavy React Flow state on the canonical lane.
