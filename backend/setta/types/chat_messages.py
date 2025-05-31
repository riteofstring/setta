from datetime import datetime
from typing import Literal, Sequence

from anthropic.types import (
    ContentBlock,
)
from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field

from setta.utils.timestamps import get_now_timestamp


class ToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_use_id: str
    content: list[TextContent | ImageContent | EmbeddedResource]
    is_error: bool


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: Sequence[ContentBlock | ToolResult]


class ChatMetadata(BaseModel):
    id: str
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)


class Chat(ChatMetadata):
    messages: list[ChatMessage]


class FullMessageStop(BaseModel):
    type: Literal["full_message_stop"]
    messages: list[ChatMessage]
    toolResults: dict[str, ToolResult]
