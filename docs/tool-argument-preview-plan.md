# Tool Argument Preview Streaming Plan

## Goal
Stream selected MCP tool arguments into the UI while the tool call is still
streaming, then fall back to canonical backend state once the tool completes.
This should work for `set_code`, `set_param_entered_value`, `set_callable`, and
be extensible to other tools.

## Current Building Blocks
- Tool call arguments are streamed as `ToolCallDeltaEvent` and buffered in
  `frontend/src/state/actions/ai.ts`.
- AI Follow already parses partial tool argument buffers and emits websocket
  updates based on tool metadata.

## Proposed Data Model
Add a new preview metadata annotation to MCP tools describing:
- Which IDs should be used to route the preview (section, codeObj, etc).
- Which argument key contains the preview value to display.

Suggested shape:
- `ToolArgumentPreviewMetadata` with:
  - `targetIdPathsByType`: dict of ID type -> list of paths
  - `previewValuePath`: dot path for the argument value
  - `previewKind`: string enum (e.g., `code`, `paramValue`, `callableName`)

Example usage:
- `set_code`: IDs -> `sectionId`, preview value -> `code`, kind `code`
- `set_param_entered_value`: IDs -> `sectionId`, `paramInfoId`, preview -> `value`,
  kind `paramValue`
- `set_callable`: IDs -> `sectionId`, preview -> `callableName`, kind `callableName`

## Backend Changes
1. `backend/setta/mcp/tool_metadata.py`
   - Add a new metadata model for preview streaming and attach/get helpers.
   - Extend `SettaToolAnnotations` to include the new field.
2. `backend/setta/mcp/tools/project_state_registry.py`
   - Accept preview metadata in `project_state_tool(...)` and attach it.
3. `backend/setta/mcp/server.py`
   - Register the preview metadata in tool annotations so the MCP client can
     cache it.
4. `backend/setta/mcp/client.py`
   - Cache the preview metadata via the updated annotations model.
5. `backend/setta/project_state/base_project_manager.py`
   - Add preview metadata to `set_code`, `set_param_entered_value`, `set_callable`.
6. `backend/setta/llm/llm_chat_manager.py`
   - Parse argument buffers for tools with preview metadata.
   - Convert temporary IDs -> canonical IDs before broadcasting.
   - Emit a new streaming event type for preview updates.

## Streaming Event Shape
Add a new streaming event in `backend/setta/types/chat_stream_events.py`:
- `ToolArgumentPreviewDeltaEvent`
  - `message_id`
  - `tool_call_id`
  - `tool_name`
  - `preview_kind`
  - `target_ids_by_type`
  - `preview_value_delta`

Prefer sending full preview value (reconstructed from buffers) to simplify
frontend state updates, even though the transport itself is streaming.

## Frontend State + UI Changes
1. Add a `useToolArgumentPreview` store in `frontend/src/state/definitions.ts`:
   - keyed by `projectConfigId` only (do not filter by active chat)
   - maps for preview values:
     - `previewCodeBySectionId`
     - `previewParamValueBySectionAndParamId`
     - `previewCallableNameBySectionId`
2. Handle the new streaming event in `frontend/src/state/actions/ai.ts` (if
   streamed) or `frontend/src/state/actions/websocketReceive.ts` (if a new
   websocket message type is used). Apply previews regardless of active chat.
3. Apply preview overrides in the UI:
   - `frontend/src/components/Section/Layouts/CodeArea.tsx`:
     show `previewCode ?? impl.code`
   - `frontend/src/components/Params/ParamItems/ParamInput.tsx`:
     show `previewValue ?? impl.value`
   - `frontend/src/components/Section/SectionParts/Search.tsx`:
     show `previewCallableName ?? codeInfoName`

## Clearing Preview State
Clear previews when:
- The tool result arrives (handle in `handleToolResult`).
- The canonical project-state update lands (optional safety net, compare to
  preview values and clear matches).

## Streaming JSON Parsing Notes
Streaming tool arguments are partial JSON. For preview values, use a minimal
string scanner:
- Find `"previewKey": "` and accumulate until a non-escaped closing quote.
- Best-effort unescape via `json.loads` on a wrapped string literal.
- Allow partial/incomplete values; keep the last valid prefix.

This mirrors the existing approach for streaming AI Follow IDs but is safer
for text payloads (quotes, newlines, escape sequences).

## Regeneration
If new websocket or streaming event types are added, regenerate frontend types:
- `source activate.sh && cd frontend && pnpm generate`

## Implementation Steps (Suggested Order)
1. Add preview metadata models + annotations in `backend/setta/mcp/tool_metadata.py`.
2. Wire metadata through tool registration and MCP annotations.
3. Add preview metadata to `set_code`, `set_param_entered_value`, `set_callable`.
4. Add the streaming event type + backend emission logic in `LLMChatManager`.
5. Add frontend store + event handler + UI overrides.
6. Clear preview state on tool result / backend project-state update.

## Risks / Edge Cases
- Partial JSON parsing may produce flicker; mitigate by only updating when the
  preview value grows or changes meaningfully.
- Multiple tool calls in-flight: store previews keyed by `tool_call_id` so the
  latest preview wins for each section/param (across chats).
- Tool args may include very large payloads; consider truncation for display
  safety in the preview store.
