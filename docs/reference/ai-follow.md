# AI Follow Logic

This page explains how AIFollow works end-to-end, covering the backend metadata and update broadcasts plus the frontend follow + highlight behavior.

## Backend flow

- Go tool definitions attach AIFollow metadata through the canonical tool metadata layer (`internal/tools/metadata.go`) and the MCP tool catalog/runtime (`internal/mcpx`).
- Managed chat tool-preview parsing lives in `internal/managedllm/tool_preview.go`, while tool-result follow emission lives in `internal/managedllm/result_follow.go`.
- External-agent runs keep their per-chat follow snapshot in `internal/externalagents/follow.go`, which extracts ids from the live tool-call state and broadcasts `AIFollowToolArgumentsUpdate` whenever the effective follow set changes.
- When a tool call returns and declares result metadata, the Go runtime parses the tool result payload and broadcasts `AIFollowToolResultUpdate` for highlight-only follow events (`internal/managedllm/result_follow.go`).
- The websocket layer wraps these updates into typed frontend messages through `internal/realtime/messages.go`.
- The `/getAIFollowSnapshot` route returns the in-memory per-chat follow state for a project config so the UI can hydrate on reload (`internal/httpapi/ai_routes.go` plus `internal/externalagents/follow.go`).

## Backend data model

- Follow id types are currently `section` and `codeObj` (`internal/tools/metadata.go`).
- `pathsByIdType` values are dot-delimited JSON paths; `$` means the entire payload. Argument extraction allows dict keys to count as ids, while result extraction only reads values.
- Follow state is stored per chat id in memory. It is not persisted and resets on server restart (`internal/externalagents/follow.go`).

## Frontend flow

- AIFollow state lives in a zustand store keyed by `projectConfigId` and `chatId`, plus a frontend-only follow mode (`off`, `all`, `selected`) and per-project selections (`frontend/src/state/definitions.ts`). The current frontend default is `all`.
- Websocket messages update the store:
  - `AIFollowToolArgumentsUpdate` replaces the ids for the chat (or clears them when the payload is empty).
  - `AIFollowToolResultUpdate` appends ids and schedules an auto-clear after 2 seconds so highlights are brief (`frontend/src/state/actions/aiFollow.ts`).
- The snapshot endpoint is requested when loading a project config or reconnecting the websocket (`frontend/src/state/actions/project/loadProject.ts`, `frontend/src/state/actions/websocketReceive.ts`).
- The "Follow AI" menu only controls viewport + highlight filtering. It does not change backend behavior and supports `Off`, `Follow all`, or `Follow selected` (project chat + specific Chat sections) (`frontend/src/components/AppHeader/FollowAIToggleButton.tsx`).
- `useAIFollowViewport` filters ids by the selected chat/section list, groups tool-result bursts within 300ms, computes bounds, and animates a 500ms zoom/pan to keep the sections in view (`frontend/src/state/hooks/aiFollow.ts`).
- Pan and zoom gestures are disabled only while a follow transition is running (`isFollowTransitioning`), not for the entire follow mode (`frontend/src/canvasflow/CanvasFlowInteractions.ts`).
- Sections add a gradient border while they are in the active follow set or highlighted by tool results. The highlight lingers for 650ms after ids clear to avoid flicker (`frontend/src/components/Section/Container/utils.tsx`, `frontend/src/components/Section/Container/SectionContainerCore.tsx`).
- When follow is active (all/selected), the renderer tags agentic edges that
  touch tool-argument or tool-result sections. Edges originating from a
  streaming Chat section get a visible run highlight
  (`frontend/src/canvasflow/canvasFlowEdges.ts`). See
  `docs/reference/edge-styles.md` for the current visual meanings.

## Current limitations

- Only `section` ids drive viewport and highlighting; `codeObj` ids are tracked but not yet consumed in the UI (`frontend/src/state/aiFollowUtils.ts`).
- The snapshot only returns argument-based follow ids, not transient tool-result highlights.
- If a tool call does not carry any annotated ids, no follow updates are emitted.
- Follow selections are frontend-only and reset on reload.
