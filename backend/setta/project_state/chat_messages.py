from typing import Literal

from anthropic.types import ContentBlock
from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field


class ToolResult(BaseModel):
    type: Literal["tool_result"]
    tool_use_id: str
    content: list[TextContent | ImageContent | EmbeddedResource]
    is_error: bool


class ChatMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: list[ContentBlock] = Field(default_factory=list)
    toolResult: ToolResult | None = None


class Chat(BaseModel):
    id: str
    name: str
    lastUpdated: str = ""
    messages: list[ChatMessage]


class FullMessageStop(BaseModel):
    type: Literal["full_message_stop"]
    messages: list[ChatMessage]
    toolResults: dict[str, ToolResult]
