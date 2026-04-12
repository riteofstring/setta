# Settings graph interactionReactFlowStateSync: node renderer pan-activation split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the `panActivationKeyPressed` React Flow subscription from
  `frontend/src/forks/xyflow/core/container/NodeRenderer.tsx` so the full
  mounted node list no longer re-renders when the hand-pan modifier toggles.
- Moved node-drag eligibility to interaction time in
  `frontend/src/forks/xyflow/core/hooks/useDrag.ts`.
- Updated `frontend/src/forks/xyflow/core/container/ZoomPane.tsx` so the hand
  pan modifier can still drag-pan from top-level node surfaces marked
  `nopan`, without changing wheel behavior on those surfaces.

## Expected effect

- Shrinks motion-path churn on the mounted settings graph by removing a
  whole-list `NodeRenderer` commit when `panActivationKeyPressed` flips.
- Preserves the existing user behavior:
  - hand-pan key blocks node dragging
  - the same key still allows pane panning from node chrome
  - locked nodes remain non-draggable

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/NodeRenderer.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts src/forks/xyflow/core/hooks/useDrag.test.ts`
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/NodeRenderer.tsx src/forks/xyflow/core/components/wrapNode.tsx src/forks/xyflow/core/hooks/useDrag.ts src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/NodeRenderer.test.tsx src/forks/xyflow/core/container/ZoomPane.test.ts src/forks/xyflow/core/hooks/useDrag.test.ts`
- Required CDP smoke recorded in the handoff/history for this iteration.
