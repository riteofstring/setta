# AIFollow Streaming SectionId Plan

**Goal**
- Emit `AIFollowUpdate` as soon as a section id appears in streamed tool arguments.
- Keep the existing final `AIFollowUpdate` behavior as the authoritative override.

**Current Behavior**
- Tool-call args are buffered during streaming in `backend/setta/llm/llm_chat_manager.py`.
- `AIFollowUpdate` only fires after `_finalize_tool_calls` parses full JSON.

**Plan**
- Add a non-throwing extractor that scans partial argument buffers for `sectionId` or `sectionIds` without `json.loads`.
- Track the last emitted section id set in `ToolCallStreamState` and only broadcast when the set changes.
- Hook extraction into the streaming path (after buffer append in `_apply_tool_call_delta`) and union ids across all tool-call buffers for the message.
- Convert temporary ids to canonical before broadcasting, reusing the existing conversion utilities, then send `AIFollowUpdate`.
- Leave the finalize and clear steps as-is so the follow state always converges.

**Implementation Notes**
- Pass `project_config_id` into `_handle_stream_chunk` and `_handle_tool_call_deltas` so early broadcasts have the right context.
- Only broadcast when the extracted set is non-empty and different from the last emitted set to avoid churn.
- Keep this best-effort; partial buffers can yield incomplete lists, and later updates should overwrite.

**Validation**
- Manual: run a chat that triggers a tool call with `sectionId` and confirm the viewport follows before the tool finishes.
- Manual: verify follow clears after tool execution still sends an empty `AIFollowUpdate`.
