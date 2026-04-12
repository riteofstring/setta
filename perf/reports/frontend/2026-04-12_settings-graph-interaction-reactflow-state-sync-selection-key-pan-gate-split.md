# Settings Graph Interaction ReactFlow State Sync Selection-Key Pan Gate Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce mounted renderer re-render fan-out on the canary lane by keeping the
React Flow `selectionKeyPressed` state off the always-mounted `ZoomPane`
surface while preserving the same selection-mode pan-drag behavior.

## Product slice

- `frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`
  now keeps the `selectionKeyPressed` subscription inside a memoized
  `FlowRendererPane` child instead of subscribing the full flow renderer shell
- `frontend/src/forks/xyflow/core/container/ZoomPane.tsx`
  now resolves the effective `panOnDrag` value from the current
  `selectionKeyPressed` store state at interaction time via
  `getSelectionAwarePanOnDrag(...)`
- `frontend/src/forks/xyflow/core/container/ZoomPane.test.ts`
  now verifies:
  - selection mode still disables drag panning
  - `ZoomPane` does not commit when only `selectionKeyPressed` changes

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/ZoomPane.test.ts`
  - passed (`1` file, `7` tests)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/FlowRenderer.tsx src/forks/xyflow/core/container/ZoomPane.tsx src/forks/xyflow/core/container/ZoomPane.test.ts`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - required one bounded lifecycle recovery:
    `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime facts after restart, then verified `/settings` mounted
  - visually checked the settings graph / controls area with no obvious layout
    regression

## Reading

- This keeps selection-mode state localized to the pane surface that actually
  needs it while `ZoomPane` reads the same gate imperatively at gesture time.
- The behavior stays the same for selection-mode drag blocking, but the
  always-mounted viewport renderer no longer needs to rerender just because the
  selection key toggled.
- The next bounded `interactionReactFlowStateSync` slice should keep isolating
  mounted shared-surface selector fan-out rather than reopening the unstable
  cross-worktree probe by default.
