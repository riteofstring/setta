# Settings Graph Interaction ReactFlow State Sync Spreadsheet Zoom Split

Date: 2026-04-12
Lane: `rotaryParamCodeObjDefault`

## Goal

Reduce mounted spreadsheet-section re-render fan-out on the canary lane by
keeping the React Flow `transform[2]` subscription scoped to the glide editor
instead of the full `SpreadsheetArea` shell.

## Product slice

- `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx`
  now renders the lazy glide spreadsheet editor through a memoized
  `SpreadsheetGlideEditor` child that owns the
  `useReactFlow((state) => state.transform[2])` subscription
- the section shell, drag/drop wrappers, and drop-target highlight now live in
  a separate memoized `SpreadsheetAreaShell` component that stays out of the
  React Flow zoom update path
- `frontend/src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  adds focused render-boundary coverage:
  - the shell does not commit when React Flow zoom changes
  - the inner glide editor still receives the updated `flowZoom` value

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/SpreadsheetArea.tsx src/components/Section/Layouts/SpreadsheetArea.test.tsx`
  - passed
- headless Chrome DevTools MCP smoke on worktree `/settings`
  - used the current loop runtime session
  - `/settings` mounted successfully
  - no spreadsheet surface was visibly present in the current bootstrap state,
    so the check stayed at the global `/settings` smoke level
  - no obvious global layout regression was observed from this slice

## Reading

- This does not remove zoom-driven spreadsheet editor updates; the glide editor
  still needs the current zoom to pick its density multiplier.
- The win is narrowing the subscribed React surface so the outer spreadsheet
  section chrome does not participate in every zoom tick just to forward
  `flowZoom`.
- The next bounded frontier should stay inside
  `interactionReactFlowStateSync` and isolate the next mounted DOM-backed body
  or chrome surface that still subscribes to motion-heavy React Flow state on
  the canonical lane.
