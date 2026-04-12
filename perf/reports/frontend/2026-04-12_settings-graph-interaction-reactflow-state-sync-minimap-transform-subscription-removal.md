# Settings Graph `interactionReactFlowStateSync`: minimap transform subscription removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the render-path React Flow viewport subscription from
  `frontend/src/forks/xyflow/minimap/MiniMap.tsx`.
- `MiniMap` now renders from the current viewport once and keeps the mounted
  SVG `viewBox` plus mask path synchronized imperatively via
  `useReactFlow.subscribe(...)`.
- Added focused regression coverage in
  `frontend/src/forks/xyflow/minimap/MiniMap.test.ts` to assert:
  - the mounted minimap does not commit when only the React Flow transform
    changes
  - the reactive `viewBox` and mask path still update to the latest viewport
    state

## Expected effect

- Keeps the default-visible minimap panel out of pan/zoom transform commits on
  the legacy React Flow surface.
- Preserves the live viewport rectangle/mask behavior by updating the mounted
  SVG attributes directly from the store subscription.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/minimap/MiniMap.test.ts`
  - passed (`1` file, `8` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/minimap/MiniMap.tsx src/forks/xyflow/minimap/MiniMap.test.ts`
  - passed
- headless Chrome DevTools MCP smoke after one bounded lifecycle recovery
  - initial worktree CDP session dropped before the page reached live content
  - one bounded recovery restarted the worktree lifecycle with the loop
    headless env and refreshed runtime facts
  - post-recovery smoke reached live `/settings` graph content with visible
    section cards and no blank graph region or canvas collapse
  - minimap DOM/SVG structure was present with a non-empty `viewBox`; the panel
    was clipped against the far-right viewport edge, so this remains a
    structural smoke check rather than a full visibility/parity pass

## Reading

- This is another bounded product-side motion-surface reduction inside the
  measured `interactionReactFlowStateSync` owner, not another harness pass.
- With viewport, background, and minimap transform-path subscriptions all
  removed from React render, the next useful frontier should be a fresh
  attribution rerun on the canonical lane or the next measured mounted
  subscriber it names.
