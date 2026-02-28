import logging
from typing import TYPE_CHECKING, Any

from litellm.types.llms.openai import ChatCompletionToolParam
from mcp.types import CallToolResult

from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.history import ChatHistory
from setta.mcp.client import MultiMCPClient
from setta.types.chat_messages import ToolCall, ToolChatMessage
from setta.types.chat_stream_events import ToolResultEvent
from setta.types.id import ID
from setta.utils.timestamps import get_now_timestamp
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

from .actions import (
    AppendMessagesAction,
    EmitChunkAction,
    ExecuteToolCallsAction,
    ManagedAction,
    SetSystemPromptAction,
    UpdateAIFollowAction,
    UpdateAIFollowResultAction,
)
from .ai_follow import build_tool_result_follow_ids
from .sanitization import sanitize_tool_arguments
from .tool_runner import build_disallowed_tool_result, build_missing_tool_result
from .tool_search import build_search_tool_chat_message, run_local_search_tool
from .utils import is_setta_tool_name

if TYPE_CHECKING:
    from setta.mcp.tool_metadata import SettaToolAnnotations


class ManagedActionExecutor:
    def __init__(
        self,
        *,
        chat_history: ChatHistory,
        websocket_msg_handler: WMHFrontendSender,
        mcp_client: MultiMCPClient,
        dbe: DBE,
        search_tool_name: str,
        logger: logging.Logger,
    ) -> None:
        self._chat_history = chat_history
        self._websocket_msg_handler = websocket_msg_handler
        self._mcp_client = mcp_client
        self._dbe = dbe
        self._search_tool_name = search_tool_name
        self._logger = logger

    async def apply(self, action: ManagedAction) -> list[ManagedAction]:
        if isinstance(action, EmitChunkAction):
            await self._websocket_msg_handler.send_streaming_response(
                action.chat_id,
                action.chunk,
            )
            return []
        if isinstance(action, AppendMessagesAction):
            self._chat_history.append(action.chat_id, action.messages)
            return []
        if isinstance(action, SetSystemPromptAction):
            self._chat_history.set_system_prompt(
                action.chat_id,
                action.system_prompt,
            )
            return []
        if isinstance(action, UpdateAIFollowAction):
            await self._websocket_msg_handler.broadcast_ai_follow_tool_arguments_update(
                action.project_config_id,
                action.chat_id,
                action.ids_by_type,
            )
            return []
        if isinstance(action, UpdateAIFollowResultAction):
            await self._websocket_msg_handler.broadcast_ai_follow_tool_result_update(
                action.project_config_id,
                action.chat_id,
                action.ids_by_type,
            )
            return []
        if isinstance(action, ExecuteToolCallsAction):
            return await self._execute_tool_calls(action)
        return []

    async def _execute_tool_calls(
        self, action: ExecuteToolCallsAction
    ) -> list[ManagedAction]:
        if not action.tool_calls:
            return []
        follow_actions: list[ManagedAction] = []
        for tool_call in action.tool_calls:
            tool_result_actions = await self._execute_single_tool_call(
                action,
                tool_call,
            )
            follow_actions.extend(tool_result_actions)
        return follow_actions

    async def _execute_single_tool_call(
        self,
        action: ExecuteToolCallsAction,
        tool_call: ToolCall,
    ) -> list[ManagedAction]:
        tool_name = tool_call.function.name.strip()
        if not tool_name:
            raise ValueError(
                f"Tool call {tool_call.id} in chat {action.chat_id} is missing a function name"
            )
        arguments = dict(tool_call.function.arguments or {})
        allowed_server_ids = action.allowed_server_ids
        available_tools: dict[str, ChatCompletionToolParam] = {}
        annotations_by_name: dict[str, "SettaToolAnnotations"] = {}
        if tool_name == self._search_tool_name:
            if allowed_server_ids is None:
                server_id_set = set(self._mcp_client.server_configs.keys())
            else:
                if not allowed_server_ids:
                    raise ValueError("Search tool requires configured MCP server IDs.")
                server_id_set = set(allowed_server_ids)
            if not server_id_set:
                raise ValueError("Search tool requires configured MCP server IDs.")
            available_tools = (
                self._mcp_client.discoverable_tool_definitions_for_servers(
                    server_id_set
                )
            )
            annotations_by_name = self._mcp_client.tool_annotations_for_servers(
                server_id_set
            )
            provided_server_ids = arguments.get("serverIds")
            if provided_server_ids is not None:
                if not isinstance(provided_server_ids, list):
                    raise ValueError("serverIds must be a list of strings.")
                normalized_server_ids: list[str] = []
                for entry in provided_server_ids:
                    if not isinstance(entry, str):
                        raise ValueError("serverIds must be a list of strings.")
                    normalized = entry.strip()
                    if not normalized:
                        raise ValueError("serverIds must be non-empty strings.")
                    normalized_server_ids.append(normalized)
                unknown = [
                    entry
                    for entry in normalized_server_ids
                    if entry not in server_id_set
                ]
                if unknown:
                    raise ValueError(
                        f"serverIds contain unknown MCP servers: {unknown}"
                    )
                arguments["serverIds"] = normalized_server_ids
            elif allowed_server_ids is not None:
                arguments["serverIds"] = list(allowed_server_ids)

        started_at = get_now_timestamp()
        if tool_name == self._search_tool_name:
            call_result = run_local_search_tool(
                arguments=arguments,
                available_tools=available_tools,
                annotations_by_name=annotations_by_name,
            )
        else:
            route = self._mcp_client.routing.get(tool_name)
            if route is None:
                self._logger.warning(
                    "MCP tool %s is not registered; skipping call",
                    tool_name,
                )
                call_result = build_missing_tool_result(
                    tool_name,
                    self._search_tool_name,
                )
            else:
                server_id, _ = route
                if (
                    allowed_server_ids is not None
                    and server_id not in allowed_server_ids
                ):
                    self._logger.warning(
                        "MCP tool %s is not allowed; skipping call",
                        tool_name,
                    )
                    call_result = build_disallowed_tool_result(tool_name)
                else:
                    try:
                        meta = None
                        if is_setta_tool_name(tool_name):
                            meta_payload: dict[str, Any] = {
                                "projectConfigId": str(
                                    action.agentic_context.project_config_id
                                ),
                                "chatId": (
                                    str(action.agentic_context.chat_id)
                                    if action.agentic_context.chat_id is not None
                                    else None
                                ),
                                "sectionId": (
                                    str(action.agentic_context.section_id)
                                    if action.agentic_context.section_id is not None
                                    else None
                                ),
                            }
                            meta_payload["frontendWebsocketId"] = (
                                action.agentic_context.frontend_websocket_id
                                if isinstance(
                                    action.agentic_context.frontend_websocket_id,
                                    str,
                                )
                                and action.agentic_context.frontend_websocket_id.strip()
                                != ""
                                else None
                            )
                            if action.agentic_context.allow_unscoped:
                                meta_payload["allowUnscoped"] = True
                            if action.share_session_id:
                                meta_payload["shareSessionId"] = action.share_session_id
                            meta = meta_payload
                        elif action.share_session_id:
                            meta = {"shareSessionId": action.share_session_id}
                        call_result = await self._mcp_client.call_tool(
                            tool_name,
                            arguments,
                            meta=meta,
                        )
                    except Exception:
                        self._logger.exception(
                            "MCP tool invocation failed for chat %s (tool=%s)",
                            action.chat_id,
                            tool_name,
                        )
                        raise
        completed_at = get_now_timestamp()

        sanitized_arguments = sanitize_tool_arguments(self._dbe, arguments)
        tool_chat_message = self._build_tool_chat_message(
            chat_id=action.chat_id,
            tool_name=tool_name,
            tool_call=tool_call,
            call_result=call_result,
            sanitized_arguments=sanitized_arguments,
            started_at=started_at,
            completed_at=completed_at,
            available_tools=available_tools,
        )
        actions: list[ManagedAction] = [
            EmitChunkAction(
                chat_id=action.chat_id,
                chunk=ToolResultEvent(result=tool_chat_message),
            )
        ]
        follow_ids = build_tool_result_follow_ids(
            tool_name=tool_name,
            call_result=call_result,
            dbe=self._dbe,
            annotations_by_name=self._mcp_client.tool_annotations_by_name,
        )
        if follow_ids:
            actions.append(
                UpdateAIFollowResultAction(
                    project_config_id=action.project_config_id,
                    chat_id=action.chat_id,
                    ids_by_type=follow_ids,
                )
            )
        return actions

    def _build_tool_chat_message(
        self,
        *,
        chat_id: ID,
        tool_name: str,
        tool_call: ToolCall,
        call_result: CallToolResult,
        sanitized_arguments: dict[str, Any],
        started_at,
        completed_at,
        available_tools: dict[str, ChatCompletionToolParam],
    ) -> ToolChatMessage:
        if tool_name == self._search_tool_name and not call_result.isError:
            tool_chat_message, referenced_tool_names = build_search_tool_chat_message(
                tool_name=tool_name,
                tool_call=tool_call,
                call_result=call_result,
                arguments=sanitized_arguments,
                started_at=started_at,
                completed_at=completed_at,
                available_tools=available_tools,
            )
            if self._logger.isEnabledFor(logging.DEBUG):
                self._logger.debug(
                    "[chat %s] search tool returned %s tools: %s",
                    chat_id,
                    len(referenced_tool_names),
                    referenced_tool_names,
                )
            return tool_chat_message
        return ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=tool_name,
            arguments=sanitized_arguments,
            content=call_result.content,
            is_error=call_result.isError,
            result=call_result.model_dump(),
            started_at=started_at,
            completed_at=completed_at,
        )
