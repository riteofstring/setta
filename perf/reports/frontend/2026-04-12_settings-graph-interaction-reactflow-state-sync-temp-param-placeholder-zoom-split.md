# Settings Graph Interaction ReactFlow State Sync Temp Param Placeholder Zoom Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce mounted temp-param placeholder re-render fan-out on the canary lane by
keeping the React Flow `transform[2]` subscription scoped to the placeholder
size-normalization row instead of the full temp placeholder DnD wrapper.

## Product slice

- `frontend/src/components/Params/ParamSwitch.tsx`
  now renders temp placeholder rows through a memoized
  `TempParamPlaceholderRow` child that owns the
  `useReactFlow((state) => state.transform[2])` subscription
- the temp placeholder DnD wrapper state stays in `TempParamSwitch`, while the
  zoom-driven width/height normalization moved into the memoized row child so
  the outer temp placeholder shell stays off the React Flow zoom update path
- `frontend/src/components/Params/ParamSwitch.test.tsx`
  adds focused render-boundary coverage:
  - the placeholder shell does not commit when React Flow zoom changes
  - the placeholder row still updates its normalized dimensions as zoom changes

## Verification

- `pnpm -C frontend exec vitest run src/components/Params/ParamSwitch.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Params/ParamSwitch.tsx src/components/Params/ParamSwitch.test.tsx`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - used the current loop runtime session
  - `/settings` mounted successfully
  - no obvious broken layout was observed in the visible settings page chrome
    from this slice

## Reading

- This does not remove zoom-driven temp placeholder size updates; the
  placeholder still needs the current zoom to normalize DnD placeholder width
  and height.
- The win is narrowing the subscribed React surface so the outer temp param
  placeholder wrapper does not participate in every zoom tick just to forward
  normalized dimensions into the row.
- The next bounded frontier should stay inside
  `interactionReactFlowStateSync` and isolate the next mounted DOM-backed
  body, param, or chrome surface on the canonical lane that still subscribes
  directly to motion-heavy React Flow state.
