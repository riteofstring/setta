import json
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field, field_validator

from setta.database.utils import create_new_id
from setta.utils.timestamps import get_now_timestamp

JSONValue = dict[str, Any] | list[Any] | str | int | float | bool | None


class ChatRole(str, Enum):
    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class MessageTextContent(BaseModel):
    type: Literal["text"] = "text"
    text: str


class MessageImageUrl(BaseModel):
    url: str
    detail: Literal["auto", "low", "high"] | None = None


class MessageImageUrlContent(BaseModel):
    type: Literal["image_url"] = "image_url"
    image_url: MessageImageUrl


class MessageThinkingContent(BaseModel):
    type: Literal["thinking"] = "thinking"
    thinking: str = ""
    summary: str | None = ""
    signature: str | None = ""


MessageContent = MessageTextContent | MessageImageUrlContent | MessageThinkingContent


class ToolReferenceContent(BaseModel):
    type: Literal["tool_reference"] = "tool_reference"
    tool_name: str


class ToolCallFunction(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)

    @field_validator("arguments", mode="before")
    @classmethod
    def parse_arguments(cls, value: Any):
        if isinstance(value, dict):
            return value
        if isinstance(value, str) and value.strip():
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return {}
        return {}


class ToolCall(BaseModel):
    id: str = Field(default_factory=create_new_id)
    type: Literal["function"] = "function"
    function: ToolCallFunction


class BaseChatMessage(BaseModel):
    id: str = Field(default_factory=create_new_id)
    role: Any

    def to_openai_format(self) -> dict[str, Any]:
        output = self.model_dump(exclude_none=True)
        output.pop("id", None)
        return output


class ContentChatMessage(BaseChatMessage):
    content: list[MessageContent] = Field(default_factory=list)


class SystemChatMessage(ContentChatMessage):
    role: Literal[ChatRole.system] = ChatRole.system


class AssistantChatMessage(ContentChatMessage):
    role: Literal[ChatRole.assistant] = ChatRole.assistant
    tool_calls: list[ToolCall] | None = None

    def to_openai_format(self) -> dict[str, Any]:
        output = super().to_openai_format()
        tool_calls = output.get("tool_calls")
        if tool_calls:
            for call in tool_calls:
                function = call["function"]
                function["arguments"] = json.dumps(function["arguments"])
        return output


class UserChatMessage(ContentChatMessage):
    role: Literal[ChatRole.user] = ChatRole.user


class ToolChatMessage(BaseChatMessage):
    role: Literal[ChatRole.tool] = ChatRole.tool
    tool_call_id: str
    tool_name: str | None = None
    arguments: JSONValue = Field(default_factory=dict)
    result: JSONValue = None
    content: list[
        TextContent | ImageContent | EmbeddedResource | ToolReferenceContent
    ] = Field(default_factory=list)
    is_error: bool = False
    started_at: datetime = Field(default_factory=get_now_timestamp)
    completed_at: datetime | None = None
