from typing import Literal

from pydantic import BaseModel

from setta.types.chat_messages import ChatRole, ToolCall
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.generated.chat_messages import (
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID


class CreateChatRequest(BaseModel):
    projectConfigId: ID | None = None
    llmConfigId: str
    firstMessage: BaseChatMessageUnionWithDiscriminator


class GetChatRequest(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID


class AppendChatMessagesRequest(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID
    messages: list[BaseChatMessageUnionWithDiscriminator]


class DeleteChatRequest(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID


class SetChatSystemPromptRequest(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID
    systemPrompt: str


class GetAllChatMetadataRequest(BaseModel):
    projectConfigId: ID | None = None


class RunMcpToolsRequest(BaseModel):
    projectConfigId: ID | None = None
    chatId: ID
    toolCalls: list[ToolCall]


class EmitChatStreamDeltaRequest(BaseModel):
    projectConfigId: ID | None = None
    sectionId: ID
    chatId: ID
    chunk: LLMStreamingResponseChunk


class ChatSendEvent(BaseModel):
    action: Literal["send"] = "send"
    sectionId: ID
    messageId: str
    text: str
    role: ChatRole
    timestampMs: int
    managed: bool


class ChatStopEvent(BaseModel):
    action: Literal["stop"] = "stop"
    sectionId: ID
    timestampMs: int
    managed: bool


ChatActionEvent = ChatSendEvent | ChatStopEvent
