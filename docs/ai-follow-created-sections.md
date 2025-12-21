# AI Follow Created Sections Plan

## Goal

Enable the frontend to highlight and optionally focus sections that the LLM just created.
This should be separate from the existing "ai follow" behavior that is tied to tool
call arguments and the duration of a tool call.

## Design Summary

- Use tool metadata (annotations) to mark which MCP tools return ai-follow IDs in tool
  results and how to extract them.
- Keep tool-result follow updates separate from the existing ai-follow updates (tool
  arguments) so the frontend can time out highlights independently.

## Backend Plan

1. Extend `SettaToolAnnotations` to include an `aiFollowToolResult` metadata field.
   - Example shape:
     - `aiFollowToolResult: { idType: "section", paths: ["sectionId"] }`
   - `paths` can be a small, consistent selector format (ex: `sectionId`,
     `sectionIds[*]`) scoped to the tool result payload.
2. Update `project_state_tool` to accept the new metadata and attach it to tool
   registration.
3. Tag `create_top_level_section` with the metadata so it is treated as a follow-result
   tool.
4. Update `MCPClient` to cache tool annotations by tool name so the chat manager can
   access metadata during tool execution.
5. In `LLMChatManager._dispatch_tool_call`, inspect the tool result when the metadata
   indicates followable section IDs:
   - Parse the tool result payload.
   - Convert temporary IDs to canonical IDs (like existing ai-follow logic).
   - Broadcast a new websocket message dedicated to "created section" updates.
6. Add a new websocket message type and payload in `backend/setta/types/websocket.py`,
   then regenerate frontend types via:
   ```bash
   source activate.sh && cd frontend && pnpm generate
   ```
7. Add a focused unit test in `tests/llm/` that asserts create_top_level_section
   tool results trigger a follow-result update when metadata is present.

## Frontend Plan

1. Add a new store for tool-result follow highlights, keyed by project + chat.
2. Handle the new websocket message in `frontend/src/state/actions/websocketReceive.ts`.
3. Apply a timeout-based cleanup for tool-result follow highlights (separate from
   ai-follow).
4. Update `useAiSectionHighlight` (or a sibling hook) to include tool-result follow
   highlights in its result.
5. Optionally add a "focus on created sections" effect that runs once per update
   (distinct from `useAIFollowViewport` so it does not fight the in-progress follow).

## Follow-up Extensions

- Add metadata to additional creator tools (ex: `group_sections`, `create_child_sections`)
  once they return explicit created IDs that can be extracted with the same metadata.
