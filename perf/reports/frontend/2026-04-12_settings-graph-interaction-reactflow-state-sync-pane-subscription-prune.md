## 2026-04-12 17:05 UTC

Lane: `rotaryParamCodeObjDefault`

Slice:

- remove the unused `paneDragging` React Flow store subscription from
  `frontend/src/forks/xyflow/core/container/Pane.tsx`
- keep `Pane` subscribed only to `userSelectionActive`, which is the only
  selected field the component actually reads
- add a focused profiler-based regression test proving `Pane` does not commit
  when `paneDragging` flips without a selection-state change

Files:

- `frontend/src/forks/xyflow/core/container/Pane.tsx`
- `frontend/src/forks/xyflow/core/container/Pane.test.tsx`

Focused verification:

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/Pane.test.tsx src/components/Pages/Project/graphSubstrate/settingsGraphSubstrateCanaryViewportRuntime.test.tsx`
  - passed (`2` files, `12` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/Pane.tsx src/forks/xyflow/core/container/Pane.test.tsx`
  - passed

CDP status:

- headless DevTools smoke on worktree `3075` and read-only `main` `3087`
  completed
  - both `/settings` surfaces mounted with the graph substrate area visible
  - no obvious visual drift was observed for this slice

Reading:

- this is one bounded product-side follow-up inside the measured owner
  `interactionReactFlowStateSync`
- the canary still writes `paneDragging` during viewport interaction, but the
  legacy pane no longer rerenders in response when that flag is irrelevant to
  its current behavior
- next useful frontier is another product-side reduction or a fresh-runtime
  canonical perf rerun once the lane is healthy enough to measure again
