from typing import Literal

from pydantic import BaseModel, Field

from setta.types.chat_messages import ChatFileAttachment, ChatRole, ToolCall
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.generated.chat_messages import (
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID


class CreateChatRequest(BaseModel):
    engineConfigId: ID | None = None
    firstMessage: BaseChatMessageUnionWithDiscriminator


class GetChatRequest(BaseModel):
    chatId: ID


class AppendChatMessagesRequest(BaseModel):
    chatId: ID
    messages: list[BaseChatMessageUnionWithDiscriminator]


class DeleteChatRequest(BaseModel):
    chatId: ID


class SetChatSystemPromptRequest(BaseModel):
    chatId: ID
    systemPrompt: str


class GetAllChatMetadataRequest(BaseModel):
    pass


class RunMcpToolsRequest(BaseModel):
    chatId: ID
    sectionId: ID
    frontendWebsocketId: str | None = None
    toolCalls: list[ToolCall]


class EmitChatStreamDeltaRequest(BaseModel):
    projectConfigId: ID
    sectionId: ID
    chatId: ID
    chunk: LLMStreamingResponseChunk


class ChatSendEvent(BaseModel):
    action: Literal["send"] = "send"
    sectionId: ID
    messageId: str
    text: str
    attachments: list[ChatFileAttachment] = Field(default_factory=list)
    role: ChatRole
    timestampMs: int
    managed: bool


class ChatStopEvent(BaseModel):
    action: Literal["stop"] = "stop"
    sectionId: ID
    timestampMs: int
    managed: bool


ChatActionEvent = ChatSendEvent | ChatStopEvent
