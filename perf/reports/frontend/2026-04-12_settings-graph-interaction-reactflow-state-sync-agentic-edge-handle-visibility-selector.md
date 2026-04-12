# Settings graph `interactionReactFlowStateSync`: agentic edge-handle visibility selector

Date: 2026-04-12
Owner: `interactionReactFlowStateSync`
Canonical lane: normalized `All Settings` focused on `rotaryParamCodeObjDefault`

## Summary

- Goal: remove one remaining mounted section-handle subscription fan-out by
  keeping `AgenticEdgeHandles` off unrelated `projectConfig.agenticEdges`
  updates.
- Slice: narrow the mounted agentic-handle selector from the full
  `agenticEdges` array to per-section incoming/outgoing visibility.

## What changed

- Updated
  `frontend/src/components/Section/Container/AgenticEdgeHandles.tsx` so the
  mounted handle surface subscribes through a derived
  `{ hasIncoming, hasOutgoing }` selector keyed to the current section instead
  of reading the whole `projectConfig.agenticEdges` array.
- Added focused profiler coverage in
  `frontend/src/components/Section/Container/AgenticEdgeHandles.test.tsx` to
  prove:
  - the mounted handle surface does not commit when an unrelated agentic edge
    is added for other sections
  - the handle surface still re-renders when this section gains a new incoming
    edge

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Container/AgenticEdgeHandles.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Container/AgenticEdgeHandles.tsx src/components/Section/Container/AgenticEdgeHandles.test.tsx`
  - passed
- Fresh-context headless CDP smoke on the restarted worktree `/settings`
  session:
  - one allowed lifecycle recovery was used after the pre-recovery session
    stalled on a loading spinner:
    - `env BOOTSTRAP_ENABLED=0 DEVTOOLS_OPEN_WITH_CHROME=0 DEVTOOLS_HEADLESS=1 PLAYWRIGHT_HEADLESS=1 ./aireset.sh`
  - refreshed runtime facts showed session `0c409b` on frontend `3075`,
    backend `8075`, debug port `9297`
  - bootstrap health: healthy
  - `/settings` mounted successfully
  - no obvious layout or section handle-chrome regression was visible

## Reading

- This closes the last obvious inconsistency inside the mounted section-handle
  family: chat-shared and workflow handles were already visibility-scoped, and
  agentic handles now follow the same subscription shape.
- The next bounded frontier should remain attribution-led and identify the next
  largest mounted section-body/chrome subscriber or shared write fan-out on the
  canonical lane before another product reduction.
