# Settings Graph Interaction ReactFlow State Sync Zoom-Activation Wheel Gate Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce mounted renderer re-render fan-out on the canary lane by keeping the
React Flow `zoomActivationKeyPressed` state off the always-mounted flow shell
while preserving the same wheel zoom activation behavior.

## Product slice

- `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
  no longer subscribes the full flow renderer shell to
  `zoomActivationKeyPressed`
- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  now resolves zoom-activation wheel behavior from the current store state at
  interaction time instead of taking a zoom-modifier prop from the parent
  render path
- `frontend/src/forks/xyflow/core/container/FlowRenderer.test.tsx`
  now verifies the mounted flow shell does not commit when only
  `zoomActivationKeyPressed` changes
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  now verifies a pan-on-scroll surface switches to wheel zoom after the zoom
  activation key turns on post-mount

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/FlowRenderer.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - passed (`2` files, `10` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/FlowRenderer.tsx src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/FlowRenderer.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - bootstrap session mounted successfully on `/settings`
  - visible settings graph surface, top controls, and section cards showed no
    obvious layout regression from this slice

## Reading

- This keeps zoom-activation modifier churn off the always-mounted flow shell
  while `ZoomPane` still resolves the same wheel intent from the live store at
  gesture time.
- The behavior stays the same for modifier-driven wheel zoom, but toggling the
  zoom activation key no longer needs to re-render the top-level flow renderer.
- The next bounded `interactionReactFlowStateSync` slice should keep isolating
  mounted shared-surface selector/write fan-out on the canonical lane instead
  of reopening the unstable cross-worktree probe by default.
