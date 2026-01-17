from setta.api.generated_listener_endpoints import RouterEndpointAPI
from setta.llm.chat_toolkit import (
    assistant_message,
    message_image_url,
    message_text,
    message_thinking,
    system_message,
    tool_reference,
    user_message,
)
from setta.mcp.tool_metadata import ToolArgumentPreviewIdType, ToolArgumentPreviewKind
from setta.types.chat import Chat, ChatMetadata
from setta.types.chat_messages import ToolCall, ToolChatMessage
from setta.types.chat_stream_events import (
    LLMStreamingResponseChunk,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    MessageTextDelta,
    MessageThinkingDelta,
    ToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)
from setta.types.generated.chat_messages import BaseChatMessageUnion
from setta.types.id import ID


class ChatHistoryClient:
    def __init__(self, project_manager: RouterEndpointAPI) -> None:
        self._project_manager = project_manager

    async def create(
        self,
        *,
        llm_config_id: str,
        first_message: BaseChatMessageUnion,
    ) -> Chat:
        payload: dict[str, object] = {
            "llmConfigId": llm_config_id,
            "firstMessage": first_message,
        }
        return _coerce_chat(await self._project_manager.create_chat(payload))

    async def get(
        self,
        *,
        chat_id: ID,
    ) -> Chat:
        payload: dict[str, object] = {"chatId": chat_id}
        return _coerce_chat(await self._project_manager.get_chat(payload))

    async def append(
        self,
        *,
        chat_id: ID,
        messages: list[BaseChatMessageUnion],
    ) -> Chat:
        payload: dict[str, object] = {"chatId": chat_id, "messages": messages}
        return _coerce_chat(await self._project_manager.append_chat_messages(payload))

    async def delete(
        self,
        *,
        chat_id: ID,
    ) -> None:
        payload: dict[str, object] = {"chatId": chat_id}
        await self._project_manager.delete_chat(payload)

    async def set_system_prompt(
        self,
        *,
        chat_id: ID,
        system_prompt: str,
    ) -> Chat:
        payload: dict[str, object] = {
            "chatId": chat_id,
            "systemPrompt": system_prompt,
        }
        return _coerce_chat(await self._project_manager.set_chat_system_prompt(payload))

    async def get_all_metadata(self) -> list[ChatMetadata]:
        return _coerce_chat_metadata_list(
            await self._project_manager.get_all_chat_metadata({})
        )


class ChatStreamEmitterClient:
    def __init__(
        self,
        project_manager: RouterEndpointAPI,
        *,
        section_id: ID | None = None,
    ) -> None:
        self._project_manager = project_manager
        self._section_id = section_id

    def with_section(self, section_id: ID) -> "ChatStreamEmitterClient":
        return ChatStreamEmitterClient(self._project_manager, section_id=section_id)

    async def emit_message_start(
        self,
        *,
        chat_id: ID,
        message: BaseChatMessageUnion,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageStartEvent(message=message),
        )

    async def emit_text_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        text: str,
        section_id: ID | None = None,
        index: int = 0,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageDeltaEvent(
                message_id=message_id,
                content=[MessageTextDelta(index=index, text=text)],
            ),
        )

    async def emit_thinking_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        thinking: str,
        section_id: ID | None = None,
        index: int = 0,
        signature: str | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageDeltaEvent(
                message_id=message_id,
                content=[
                    MessageThinkingDelta(
                        index=index,
                        thinking=thinking,
                        signature=signature,
                    )
                ],
            ),
        )

    async def emit_tool_call_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        tool_call_id: str,
        arguments_delta: str,
        tool_name: str | None = None,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolCallDeltaEvent(
                message_id=message_id,
                tool_call_id=tool_call_id,
                arguments_delta=arguments_delta,
                tool_name=tool_name,
            ),
        )

    async def emit_tool_argument_preview_delta(
        self,
        *,
        chat_id: ID,
        message_id: str,
        tool_call_id: str,
        tool_name: str,
        arguments_delta: str,
        preview_kind: ToolArgumentPreviewKind,
        target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]],
        preview_value_delta: str,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolArgumentPreviewDeltaEvent(
                message_id=message_id,
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                arguments_delta=arguments_delta,
                preview_kind=preview_kind,
                target_ids_by_type=target_ids_by_type,
                preview_value_delta=preview_value_delta,
            ),
        )

    async def emit_tool_result(
        self,
        *,
        chat_id: ID,
        message: ToolChatMessage,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=ToolResultEvent(result=message),
        )

    async def emit_message_stop(
        self,
        *,
        chat_id: ID,
        message_id: str,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageStopEvent(message_id=message_id),
        )

    async def emit_message_finalized(
        self,
        *,
        chat_id: ID,
        message: BaseChatMessageUnion,
        section_id: ID | None = None,
    ) -> None:
        await self._emit(
            section_id=section_id,
            chat_id=chat_id,
            chunk=MessageFinalizedEvent(message=message),
        )

    async def _emit(
        self,
        *,
        chat_id: ID,
        chunk: LLMStreamingResponseChunk,
        section_id: ID | None = None,
    ) -> None:
        resolved_section_id = section_id or self._section_id
        if resolved_section_id is None:
            raise ValueError("section_id is required for chat stream emission")
        await self._project_manager.emit_chat_stream_delta(
            {
                "sectionId": resolved_section_id,
                "chatId": chat_id,
                "chunk": chunk,
            }
        )


class ChatToolRunnerClient:
    def __init__(self, project_manager: RouterEndpointAPI) -> None:
        self._project_manager = project_manager

    async def run(
        self,
        *,
        chat_id: ID,
        tool_calls: list[ToolCall],
    ) -> list[ToolChatMessage]:
        payload: dict[str, object] = {"chatId": chat_id, "toolCalls": tool_calls}
        return _coerce_tool_messages(await self._project_manager.run_mcp_tools(payload))


def _coerce_chat(payload: Chat | dict[str, object]) -> Chat:
    if isinstance(payload, Chat):
        return payload
    return Chat.model_validate(payload)


def _coerce_chat_metadata_list(
    payload: list[ChatMetadata | dict[str, object]],
) -> list[ChatMetadata]:
    return [ChatMetadata.model_validate(entry) for entry in payload]


def _coerce_tool_messages(
    payload: list[ToolChatMessage | dict[str, object]],
) -> list[ToolChatMessage]:
    return [ToolChatMessage.model_validate(entry) for entry in payload]


__all__ = [
    "ChatHistoryClient",
    "ChatStreamEmitterClient",
    "ChatToolRunnerClient",
    "assistant_message",
    "message_image_url",
    "message_text",
    "message_thinking",
    "system_message",
    "tool_reference",
    "user_message",
]
