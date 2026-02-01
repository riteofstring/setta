# Chat + Sub-Agent Regression Fix Plan

## Goals
- Keep assistant text/thinking visible even when tool calls (Task/sub-agent) are present.
- Prevent section move/resize actions from being reverted when sub-agent sections appear or stream updates arrive.
- Add extensive automated coverage so both regressions are caught early.

## Scope
- Frontend chat rendering (assistant content visibility when tool_calls exist).
- Frontend streaming state merge + persistence (MESSAGE_FINALIZED/TOOL_RESULT behavior).
- Optimistic project-state updates vs backend sync (pending ops during sub-agent creation/streaming).
- Unit + integration + Playwright tests that replicate the failing flows.

## Repro + Diagnostics
1. **Reproduce bug #1** (assistant text disappears when tool calls start):
   - Use Claude SDK in a chat section.
   - Prompt it to spawn sub-agents (Task tool calls).
   - Capture the streaming sequence:
     - `message_start` + `delta` for text/thinking
     - `tool_call_delta` / `message_finalized`
     - `tool_result`
   - Confirm the UI hides assistant content when `tool_calls` exist.

2. **Reproduce bug #2** (move/resize reverts with sub-agent sections):
   - Spawn sub-agent sections.
   - While they appear/stream, attempt to move or resize sections.
   - Capture:
     - pending ops array (`usePendingOperations`)
     - incoming `processProjectStateUpdateFromBackend` payloads
     - any backend responses for move/resize endpoints

## Likely Root Causes
- **Bug #1**: Chat UI hides assistant content when tool calls exist (`ChatMessages.tsx`), even if the assistant also emitted text/thinking content.
- **Bug #2**: Pending optimistic ops are being overwritten by backend updates triggered by sub-agent section creation/streaming.

## Fix Plan (Completed)
1. **Chat UI rendering**
   - Only hide assistant content when tool calls exist **and** assistant content is empty.
   - If content exists, render it alongside tool call cards.

2. **Streaming merge behavior**
   - Ensure `MESSAGE_FINALIZED` or `TOOL_RESULT` updates do not replace earlier streamed content with an empty tool-call-only message.
   - Preserve message completeness if backend updates arrive mid-stream.

## Remaining Fix Plan (Move/Resize Reverts)
1. **Instrumentation + trace**
   - Add logging for:
     - `moveSectionsWithBackend` invocations (sectionIds, positionsById, frontendOpId).
     - `debounced_route_set_top_level_section_layout` sends (topLevelSections snapshot + frontendOpId).
     - `processProjectStateUpdateFromBackend` for topLevelSections, pending ops, and which ops are dropped.
   - Reproduce by moving sub-agent sections immediately after creation while logging the op lifecycle.

2. **Root-cause analysis**
   - Validate whether:
     - Drag end fires and generates a pending op.
     - Pending op is removed before backend state reflects the new layout.
     - Backend update rebuilds node positions from stale `topLevelSections` and overwrites the pending move.

3. **Targeted fix options**
   - If pending ops are removed early: delay removal until backend layout matches the pending positions.
   - If backend updates overwrite local moves: merge `useNodeInternals` positions for sections that have pending layout/move ops.
   - If debounced layout updates race: apply layout optimistically on drag end and keep pending ops until backend confirms.

## Test Coverage (Extensive)
### Unit/UI Tests (Completed)
- **`frontend/src/components/Chat/ChatMessages.test.tsx`**
  - Assistant text/thinking remains visible when `tool_calls` exist.
  - Content is hidden only when tool call message has *no* content.

### Streaming State Tests (Completed)
- **`frontend/src/state/actions/aiSectionStreaming.test.ts`**
  - Stream text/thinking, then tool calls, then finalized tool-call message with empty content — content persists.

### Pending Ops + Backend Sync Tests (In Progress)
- **`frontend/src/state/actions/sections/topLevelLayoutPersistence.test.ts`**
  - Move a section and ensure pending layout persists over backend updates.
- **Planned**: add a case with a *newly created* sub-agent section to ensure its move doesn’t revert after backend sync.

### Playwright E2E Tests (Partially Complete)
- **`frontend/tests/e2e/subagent-streaming.spec.ts`**
  - Extended: parent assistant text is visible alongside tool calls.
- **Planned**: new E2E case that moves a sub-agent section immediately after creation and asserts the move persists after backend sync.

## Verification
- Vitest:
  - `pnpm -C frontend exec vitest run <edited tests>`
- Playwright:
  - `./scripts/run-playwright-e2e.sh`
- CDP visual check for any UI changes (per repo guidelines).

## Open Questions
- Confirm the specific Claude SDK config and whether the project was in share mode.
- Identify which backend responses (layout vs section size) are overwriting move/resize state.
