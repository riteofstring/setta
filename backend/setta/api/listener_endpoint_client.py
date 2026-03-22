from typing import Awaitable, Callable, NotRequired, TypedDict

from setta.types.chat import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    Chat,
    ChatMetadata,
    ChatSectionState,
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    SystemChatMessage,
    ToolCall,
    ToolChatMessage,
    ToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
    UserChatMessage,
)
from setta.types.id import ID

ListenerEndpointCaller = Callable[[str, object], Awaitable[object]]


class ListenerCreateChatRequestPayload(TypedDict):
    engineConfigId: NotRequired[ID | None]
    firstMessage: (
        SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
    )


class ListenerGetChatRequestPayload(TypedDict):
    chatId: ID


class ListenerAppendChatMessagesRequestPayload(TypedDict):
    chatId: ID
    messages: list[BaseChatMessageUnion]


class ListenerDeleteChatRequestPayload(TypedDict):
    chatId: ID


class ListenerSetChatSystemPromptRequestPayload(TypedDict):
    chatId: ID
    systemPrompt: str


class ListenerGetAllChatMetadataRequestPayload(TypedDict):
    pass


class ListenerGetChatSectionChatIdRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]
    sectionId: ID


class ListenerSetChatSectionChatIdRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]
    sectionId: ID
    chatId: ID | None


class ListenerEmitChatStreamDeltaRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]
    sectionId: ID
    chatId: ID
    chunk: (
        MessageStartEvent
        | MessageDeltaEvent
        | ToolCallDeltaEvent
        | ToolResultEvent
        | ToolArgumentPreviewDeltaEvent
        | MessageStopEvent
        | MessageFinalizedEvent
    )


class ListenerRunMcpToolsRequestPayload(TypedDict):
    chatId: ID
    sectionId: ID
    frontendAffinityToken: NotRequired[str | None]
    toolCalls: list[ToolCall]


class ListenerSetChatSectionStateRequestPayload(TypedDict):
    projectConfigId: NotRequired[ID]
    sectionId: ID
    state: ChatSectionState


class RouterEndpointAPI:
    """Thin Python client for the active Go-owned listener endpoint set."""

    def __init__(self, caller: ListenerEndpointCaller) -> None:
        self._caller = caller

    async def create_chat(self, payload: ListenerCreateChatRequestPayload) -> Chat:
        return await self._caller("route_create_chat", payload)

    async def get_chat(self, payload: ListenerGetChatRequestPayload) -> Chat:
        return await self._caller("route_get_chat", payload)

    async def append_chat_messages(
        self, payload: ListenerAppendChatMessagesRequestPayload
    ) -> Chat:
        return await self._caller("route_append_chat_messages", payload)

    async def delete_chat(self, payload: ListenerDeleteChatRequestPayload) -> None:
        return await self._caller("route_delete_chat", payload)

    async def set_chat_system_prompt(
        self, payload: ListenerSetChatSystemPromptRequestPayload
    ) -> Chat:
        return await self._caller("route_set_chat_system_prompt", payload)

    async def get_all_chat_metadata(
        self, payload: ListenerGetAllChatMetadataRequestPayload
    ) -> list[ChatMetadata]:
        return await self._caller("route_get_all_chat_metadata", payload)

    async def get_chat_section_chat_id(
        self, payload: ListenerGetChatSectionChatIdRequestPayload
    ) -> str | None:
        return await self._caller("route_get_chat_section_chat_id", payload)

    async def set_chat_section_chat_id(
        self, payload: ListenerSetChatSectionChatIdRequestPayload
    ) -> None:
        return await self._caller("route_set_chat_section_chat_id", payload)

    async def emit_chat_stream_delta(
        self, payload: ListenerEmitChatStreamDeltaRequestPayload
    ) -> None:
        return await self._caller("route_emit_chat_stream_delta", payload)

    async def run_mcp_tools(
        self, payload: ListenerRunMcpToolsRequestPayload
    ) -> list[ToolChatMessage]:
        return await self._caller("route_run_mcp_tools", payload)

    async def set_chat_section_state(
        self, payload: ListenerSetChatSectionStateRequestPayload
    ) -> None:
        return await self._caller("route_set_chat_section_state", payload)
