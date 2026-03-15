from mcp.types import CallToolResult, TextContent

from setta.agentic.agentic_scope import AgenticContext
from setta.types.chat_messages import ToolCall
from setta.types.id import ID

from .actions import ExecuteToolCallsAction


def build_execute_tool_calls_action(
    *,
    project_config_id: ID,
    chat_id: ID,
    tool_calls: list[ToolCall],
    allowed_server_ids: set[str] | None,
    share_session_id: str | None,
    agentic_context: AgenticContext,
) -> ExecuteToolCallsAction | None:
    if not tool_calls:
        return None
    resolved_allowed_server_ids = (
        set(allowed_server_ids) if allowed_server_ids is not None else None
    )
    return ExecuteToolCallsAction(
        project_config_id=project_config_id,
        chat_id=chat_id,
        tool_calls=tool_calls,
        allowed_server_ids=resolved_allowed_server_ids,
        share_session_id=share_session_id,
        agentic_context=agentic_context,
    )


def build_missing_tool_result(
    tool_name: str,
    search_tool_name: str,
) -> CallToolResult:
    message = (
        f"MCP tool '{tool_name}' is not registered. "
        f"Call '{search_tool_name}' to find the correct tool name."
    )
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent={"error": message, "tool_name": tool_name},
        isError=True,
    )


def build_disallowed_tool_result(
    tool_name: str,
) -> CallToolResult:
    message = f"MCP tool '{tool_name}' is not allowed for this chat."
    return CallToolResult(
        content=[TextContent(type="text", text=message)],
        structuredContent={"error": message, "tool_name": tool_name},
        isError=True,
    )
