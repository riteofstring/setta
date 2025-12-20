# AI Follow Plan

## Scope

Add a "Follow AI" toggle in the frontend nav that keeps the viewport centered on the sections the AI is actively working on. The backend will derive the active section IDs from tool-call arguments as they stream in (before tool execution) and broadcast them to the frontend over a new websocket message.

## Decisions

- Store name: `useAIFollow`.
- `sectionIds` becomes empty: follow stays enabled and the viewport does not change.
- Follow persists until the user toggles it off.
- Manual pan/zoom is disabled while follow is enabled.

## Backend changes

1. Add a new websocket message type + payload model for AI-follow updates in `backend/setta/types/websocket.py`.
2. Add a sender method (e.g., `broadcast_ai_follow_update`) in `backend/setta/websockets/msg_handlers/frontend_sender.py`.
3. In `backend/setta/llm/llm_chat_manager.py`, detect `sectionId` or `sectionIds` in tool-call arguments as soon as arguments are parsed and broadcast updates immediately (do not wait for tool results).
4. Clear sectionIds to `[]` after tool calls finish (so follow stops moving but remains enabled).

## Frontend changes

1. Generate updated websocket unions (`source activate.sh && cd frontend && pnpm generate`).
2. Add `useAIFollow` zustand store in `frontend/src/state/definitions.ts` with `sectionIds: Array<ID>` and a boolean `enabled` (or equivalent).
3. Handle the new websocket message in `frontend/src/state/actions/websocketReceive.ts` and update `useAIFollow.sectionIds`.
4. Implement follow behavior:
   - When enabled and `sectionIds.length > 0`, compute a bounding rect for those sections (via `getSectionRect`) and apply a viewport transform using `getViewportForBounds` + d3 transform (mirroring `goToSection`).
   - When enabled and `sectionIds.length === 0`, do nothing (keep current viewport).
   - Disable manual pan/zoom while follow is enabled (hook into ReactFlow store flags or event handling; decide the exact entry point after code review).
5. Add a "Follow AI" toggle button in `frontend/src/components/AppHeader/ProjectNav.tsx` (or a small component nearby) that flips `useAIFollow.enabled`.

## Notes / Open questions

- Confirm how to block pan/zoom in the forked xyflow store (likely via `paneDragging`, zoom handlers, or relevant flags) while keeping programmatic transforms for follow.
- Decide whether fit behavior should include nested sections or only top-level sections when computing bounds.
