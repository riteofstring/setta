# Settings graph interactionReactFlowStateSync: agentic edge multi-select split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the `multiSelectionActive` React Flow subscription from
  `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx` so the
  mounted agentic-edge SVG no longer re-renders on modifier flips that only
  affect additive selection semantics.
- Kept the existing `width` / `height` selector scoped with `shallow`
  equality and moved the additive-selection modifier lookup to click time via
  `useReactFlow.getState()`.
- Added focused profiler coverage in
  `frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.test.tsx` to
  prove the mounted renderer does not commit when only
  `multiSelectionActive` changes and that edge selection still sees the live
  modifier state.

## Expected effect

- Removes one more shared mounted-surface invalidation from the product path
  currently attributed to `interactionReactFlowStateSync`.
- Prevents agentic-edge redraw churn from selection-modifier changes while
  preserving additive-selection clicks.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/AgenticEdgeRenderer.test.tsx`
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx src/forks/xyflow/core/container/AgenticEdgeRenderer.test.tsx`
- Required CDP smoke recorded in the handoff/history for this iteration.
