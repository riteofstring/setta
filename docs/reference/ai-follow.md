# AI Follow Logic

This page explains how AIFollow works end-to-end, covering the backend metadata and update broadcasts plus the frontend follow + highlight behavior.

## Backend flow
- Tool definitions attach AIFollow metadata via `project_state_tool(...)` so each MCP tool can declare where to find ids in arguments or results (`backend/setta/mcp/tools/project_state_registry.py`, `backend/setta/mcp/tool_metadata.py`).
- The MCP server registers those annotations so the chat manager can read `aiFollowToolArguments` and `aiFollowToolResult` for each tool name (`backend/setta/mcp/server.py`).
- While the model streams tool calls, `LLMChatManager` parses partial argument buffers, uses the metadata paths to extract ids, maps temporary ids to canonical ids, filters to known ids, and broadcasts `AIFollowToolArgumentsUpdate` when the follow set changes (`backend/setta/llm/llm_chat_manager.py`).
- After tool calls finalize, the manager re-parses full arguments, re-canonicalizes ids, stores per-chat follow state, and broadcasts a stable `AIFollowToolArgumentsUpdate` (same file).
- When a tool call returns and declares result metadata, the manager parses the `CallToolResult` payload, extracts ids, and broadcasts `AIFollowToolResultUpdate` for highlight-only follow events (same file).
- The websocket sender wraps these updates into typed frontend messages (`backend/setta/websockets/msg_handlers/frontend_sender.py`).
- The `/getAIFollowSnapshot` route returns the in-memory per-chat follow state for a project config so the UI can hydrate on reload (`backend/setta/routers/ai.py`).

## Backend data model
- Follow id types are currently `section` and `codeObj` (`backend/setta/mcp/tool_metadata.py`).
- `pathsByIdType` values are dot-delimited JSON paths; `$` means the entire payload. Argument extraction allows dict keys to count as ids, while result extraction only reads values.
- Follow state is stored per chat id in memory. It is not persisted and resets on server restart (`backend/setta/llm/llm_chat_manager.py`).

## Frontend flow
- AIFollow state lives in a zustand store keyed by `projectConfigId` and `chatId`, plus a frontend-only follow mode (`off`, `all`, `selected`) and per-project selections (`frontend/src/state/definitions.ts`). The current frontend default is `all`.
- Websocket messages update the store:
  - `AIFollowToolArgumentsUpdate` replaces the ids for the chat (or clears them when the payload is empty).
  - `AIFollowToolResultUpdate` appends ids and schedules an auto-clear after 2 seconds so highlights are brief (`frontend/src/state/actions/aiFollow.ts`).
- The snapshot endpoint is requested when loading a project config or reconnecting the websocket (`frontend/src/state/actions/project/loadProject.ts`, `frontend/src/state/actions/websocketReceive.ts`).
- The "Follow AI" menu only controls viewport + highlight filtering. It does not change backend behavior and supports `Off`, `Follow all`, or `Follow selected` (project chat + specific Chat sections) (`frontend/src/components/AppHeader/FollowAIToggleButton.tsx`).
- `useAIFollowViewport` filters ids by the selected chat/section list, groups tool-result bursts within 300ms, computes bounds, and animates a 500ms zoom/pan to keep the sections in view (`frontend/src/state/hooks/aiFollow.ts`).
- Pan and zoom gestures are disabled only while a follow transition is running (`isFollowTransitioning`), not for the entire follow mode (`frontend/src/forks/xyflow/core/container/FlowRenderer.tsx`).
- Sections add a gradient border while they are in the active follow set or highlighted by tool results. The highlight lingers for 650ms after ids clear to avoid flicker (`frontend/src/components/Section/Container/utils.tsx`, `frontend/src/components/Section/Container/SectionContainerCore.tsx`).
- When follow is active (all/selected), agentic edges highlight if they touch tool-argument or tool-result sections, and edges originating from a streaming Chat section get a run highlight (`frontend/src/forks/xyflow/core/container/AgenticEdgeRenderer.tsx`).

## Current limitations
- Only `section` ids drive viewport and highlighting; `codeObj` ids are tracked but not yet consumed in the UI (`frontend/src/state/aiFollowUtils.ts`).
- The snapshot only returns argument-based follow ids, not transient tool-result highlights.
- If a tool call does not carry any annotated ids, no follow updates are emitted.
- Follow selections are frontend-only and reset on reload.
