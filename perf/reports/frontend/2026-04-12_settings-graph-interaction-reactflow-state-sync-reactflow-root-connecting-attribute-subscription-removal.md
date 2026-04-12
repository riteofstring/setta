# Settings Graph `interactionReactFlowStateSync`: ReactFlow root connecting attribute subscription removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the `connectionStartHandle !== null` React Flow subscription from
  `frontend/src/forks/xyflow/core/container/ReactFlow.tsx`.
- Kept the root `data-connecting` DOM attribute in sync through an imperative
  `useReactFlow.subscribe(...)` effect on the mounted root element instead of a
  React render-path subscription.
- Added focused profiler coverage in
  `frontend/src/forks/xyflow/core/container/ReactFlow.test.tsx` to assert:
  - the `ReactFlow` root does not commit when only
    `connectionStartHandle` changes
  - the root `data-connecting` attribute still flips from `false` to `true`

## Expected effect

- Removes one whole-root render fan-out from the measured
  `interactionReactFlowStateSync` owner during connection-start state changes.
- Preserves the existing CSS-driven handle/connection-line affordance behavior
  that already keys off `.react-flow[data-connecting="true"]`.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/ReactFlow.test.tsx`
  - passed (`1` file, `1` test)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/ReactFlow.tsx src/forks/xyflow/core/container/ReactFlow.test.tsx`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - `/settings` loaded successfully
  - visible settings graph surface mounted
  - no obvious layout collapse or blank graph region was observed

## Reading

- This is still a bounded product-side reduction inside
  `interactionReactFlowStateSync`, but it removes churn from the mounted
  ReactFlow root rather than another per-section leaf subscriber.
- The next bounded frontier should stay attribution-led and identify the next
  remaining mounted section-body/chrome subscriber or shared write fan-out with
  a larger payoff than another opportunistic micro-split.
