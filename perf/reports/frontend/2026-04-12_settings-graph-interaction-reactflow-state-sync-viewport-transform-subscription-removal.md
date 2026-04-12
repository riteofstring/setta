# Settings Graph `interactionReactFlowStateSync`: viewport transform subscription removal

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`
Owner: `interactionReactFlowStateSync`

## Slice

- Removed the render-path `transform` subscription from
  `frontend/src/forks/xyflow/core/container/Viewport.tsx`.
- `Viewport` now renders once with the current transform and keeps the DOM
  `style.transform` synchronized through an imperative
  `useReactFlow.subscribe(...)` effect.
- Added focused profiler coverage in
  `frontend/src/forks/xyflow/core/container/Viewport.test.tsx` to assert:
  - the mounted viewport shell does not commit when only the React Flow
    transform changes
  - the DOM transform still updates to the latest viewport value

## Expected effect

- Keeps the always-mounted viewport shell out of pan/zoom transform commits on
  the legacy React Flow surface.
- Preserves the same visual viewport movement by updating the DOM transform
  directly from the store subscription.

## Verification

- `pnpm -C frontend exec vitest run src/forks/xyflow/core/container/Viewport.test.tsx`
  - passed (`1` file, `1` test)
- `pnpm -C frontend exec prettier --check src/forks/xyflow/core/container/Viewport.tsx src/forks/xyflow/core/container/Viewport.test.tsx`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - reached `http://127.0.0.1:3075/settings` after bootstrap
  - settings graph surface mounted with the settings header, section list, and
    bottom tabs visible
  - no obvious blank graph region, layout collapse, or viewport transform
    regression was observed

## Reading

- This is a shared-surface product reduction inside the measured
  `interactionReactFlowStateSync` owner rather than another leaf-only selector
  split.
- The next bounded frontier should stay on mounted motion-path surfaces with
  similarly wide fan-out or rerun attribution once the default probe lane is
  trustworthy again.
