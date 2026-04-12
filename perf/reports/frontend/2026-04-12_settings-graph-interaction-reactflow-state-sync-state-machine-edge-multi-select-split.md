# Settings graph interactionReactFlowStateSync: state-machine edge multi-select split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the `multiSelectionActive` React Flow subscription from
  `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx` so
  the mounted workflow-edge SVG no longer re-renders on modifier flips that
  only affect additive selection semantics.
- Tightened the React Flow selector in that renderer to `width`/`height` with
  `shallow` equality instead of an unguarded object selector.
- Kept workflow-edge selection behavior unchanged by resolving
  `multiSelectionActive` from `useReactFlow.getState()` inside the click
  handler.
- Added focused profiler coverage in
  `frontend/src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
  to prove the mounted renderer does not commit when only
  `multiSelectionActive` changes and that click selection still sees the live
  modifier state.

## Expected effect

- Removes one shared mounted-surface invalidation from the product path
  currently attributed to `interactionReactFlowStateSync`.
- Prevents workflow-edge redraw churn from selection-modifier changes while
  preserving additive-selection clicks.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/StateMachineEdgeRenderer.tsx src/forks/xyflow/core/container/StateMachineEdgeRenderer.test.tsx`
- Required CDP smoke recorded in the handoff/history for this iteration.
