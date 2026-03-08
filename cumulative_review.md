## 2026-03-09 15:45:22 PDT

Implemented the branch-blocking review fixes rather than layering more local-state patches on top.

Frontend state and rendering:
- Per-window `chatId` is now authoritative for project chat windows. Workspace windows and standalone window-space windows pass `chatId` through `UnifiedChatSurface` into `ProjectChat`, and new-thread creation writes back to the owning window instead of only updating the global active chat.
- Removed the browser-local shadow persistence for `projectChatWindowing`. Backend snapshots are authoritative again, with optimistic frontend ops replayed only while still pending.
- Fixed window-space restore semantics so saved floating windows replace existing floating workspace windows in place, while collisions with live non-floating windows get remapped to fresh ids.
- Removed stale slug caches in `windowSpacePaths` and `sectionSlugPaths`; route resolution now reflects live project state without requiring reload.
- Added a save-flow sync step for window spaces so the current workspace layout is persisted before a window-space snapshot is created. This was required after removing the local shadow because the backend model had been dropping project chat windowing during merge.

Backend/state-model fixes:
- Added shared chat continuity validation in `backend/setta/agentic/chat_continuity.py` and reused it from both linked-chat invocation and standard AI-run startup, preventing mixed engine/project histories on reused `chatId`s.
- Changed MCP retry behavior to be metadata-driven. `invoke_linked_chat` stays scope-compatible as a read tool but explicitly opts out of retry-on-disconnect, preventing duplicate side effects after reconnects.
- Fixed the backend project-state persistence model so `projectChatWindowing` survives `merge_single_config_into_backend()` / `convert_backend_to_single_config()` round trips by storing it per project config in backend state. Before this, backend-authoritative loading looked correct in some code paths but windowing writes were silently discarded on merge.

Verification:
- Frontend Vitest coverage added/updated for per-window chat identity, standalone window-space hydration, backend-authoritative project-windowing sync, restore-collision behavior, save-flow ordering, and slug invalidation.
- Backend pytest coverage added for project-chat-windowing backend round-trips, MCP retry metadata, linked-chat disconnect retry behavior, and managed/external chat continuity conflicts.
- Playwright coverage added for distinct project chat threads per saved window-space window and verified the full standalone window-space spec passes.
- CDP visual verification completed against workspace floating chat windows and standalone window-space rendering at desktop and smaller viewport sizes; no clipping or overlap regressions observed in the checked flows.
