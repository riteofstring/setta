# Settings graph chat area managed agentic-scope selector

## Goal

Reduce mounted chat-area re-render fan-out by scoping managed-chat agentic-edge
state to the current section instead of subscribing each mounted chat body to
the full `projectConfig.agenticEdges` array.

## Change

- Changed `frontend/src/components/Section/Layouts/ChatArea.tsx` so
  `ManagedChatArea` reads `hasAnyAgenticEdge` / `hasWriteScope` through the new
  per-section `useManagedChatAgenticScope(sectionId)` selector.
- The selector now derives the two booleans directly inside
  `useProjectState(...)`, so unrelated agentic-edge mutations no longer force
  mounted chat bodies to commit.
- Added focused profiler coverage in
  `frontend/src/components/Section/Layouts/chatAreaManagedScope.test.tsx` to
  prove:
  - a mounted managed-chat scope probe does not commit when an unrelated
    agentic edge is added
  - the same probe still re-renders when the current chat gains its first
    relevant `chat_chat` edge

## Why This Slice

- `ManagedChatArea` is a mounted section-body surface on the settings graph, so
  the old whole-array subscription could fan unrelated agentic-edge changes
  across every mounted chat section.
- This keeps the work on a wider section-body boundary instead of another
  handle-only or edge-only micro-split.

## Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/chatAreaManagedScope.test.tsx`
  - passed (`1` file, `2` tests)
- `pnpm -C frontend exec prettier --check src/components/Section/Layouts/ChatArea.tsx src/components/Section/Layouts/chatAreaManagedScope.test.tsx`
  - passed
- Headless CDP smoke on worktree `/settings`
  - `/settings` loaded successfully
  - settings graph surface mounted with populated sections and controls
  - chat surface was present (`Chat Window 1`)
  - no obvious blank graph region, layout collapse, or missing chat surface was observed
