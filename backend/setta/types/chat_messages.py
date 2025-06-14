from datetime import datetime
from typing import Literal, Sequence

from anthropic.types import (
    ContentBlock,
    RawContentBlockDeltaEvent,
    RawContentBlockStartEvent,
    RawMessageStartEvent,
)
from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field, field_validator

from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str

ChatRole = Literal["user", "assistant"]


class ToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_use_id: str
    content: list[TextContent | ImageContent | EmbeddedResource]
    is_error: bool


class ChatMessage(BaseModel):
    id: str
    role: ChatRole
    content: Sequence[ContentBlock | ToolResult]


class ChatMetadata(BaseModel):
    id: str
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class Chat(ChatMetadata):
    messages: list[ChatMessage]


class FullMessageStop(BaseModel):
    type: Literal["full_message_stop"]
    messages: list[ChatMessage]
    toolResults: dict[str, ToolResult]


LLMStreamingResponseChunk = (
    FullMessageStop
    | ToolResult
    | RawMessageStartEvent
    | RawContentBlockStartEvent
    | RawContentBlockDeltaEvent
)


class LLMStreamingResponse(BaseModel):
    chatId: str
    assistantMessageId: str | None
    chunk: LLMStreamingResponseChunk
