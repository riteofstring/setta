from pydantic import BaseModel

from setta.types.chat_messages import ToolCall
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.generated.chat_messages import (
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID


class CreateChatRequest(BaseModel):
    llmConfigId: str
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
    toolCalls: list[ToolCall]


class EmitChatStreamDeltaRequest(BaseModel):
    sectionId: ID
    chatId: ID
    chunk: LLMStreamingResponseChunk
