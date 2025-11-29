import json
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal

from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, ConfigDict, Field, field_validator

from setta.database.utils import create_new_id
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ChatRole(str, Enum):
    system = "system"
    user = "user"
    assistant = "assistant"
    tool = "tool"


class MessageTextContent(BaseModel):
    type: Literal["text"]
    text: str


class MessageImageUrl(BaseModel):
    url: str
    detail: Literal["auto", "low", "high"] | None = None


class MessageImageUrlContent(BaseModel):
    type: Literal["image_url"]
    image_url: MessageImageUrl


MessageContent = MessageTextContent | MessageImageUrlContent


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
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(default_factory=create_new_id)
    role: ChatRole

    def to_openai_format(self) -> dict[str, Any]:
        return self.model_dump(exclude={"id"}, exclude_none=True, by_alias=True)


class ContentChatMessage(BaseChatMessage):
    content: list[MessageContent] = Field(default_factory=list)


class SystemChatMessage(ContentChatMessage):
    role: Literal[ChatRole.system] = ChatRole.system


class UserChatMessage(ContentChatMessage):
    role: Literal[ChatRole.user] = ChatRole.user


class AssistantChatMessage(ContentChatMessage):
    role: Literal[ChatRole.assistant] = ChatRole.assistant
    tool_calls: list[ToolCall] | None = None

    def to_openai_format(self) -> dict[str, Any]:
        output = super().to_openai_format()
        tool_calls = output.get("tool_calls")
        if tool_calls:
            for call in tool_calls:
                function = call.get("function")
                if not isinstance(function, dict):
                    continue
                arguments = function.get("arguments") or {}
                if not isinstance(arguments, str):
                    function["arguments"] = json.dumps(arguments)
        return output


class ToolChatMessage(BaseChatMessage):
    role: Literal[ChatRole.tool] = ChatRole.tool
    tool_call_id: str
    result_content: list[TextContent | ImageContent | EmbeddedResource] = Field(  # noqa: RUF012
        default_factory=list
    )
    is_error: bool = False

    def to_openai_format(self) -> dict[str, Any]:
        output = super().to_openai_format()
        output.pop("result_content", None)
        output.pop("is_error", None)
        output["content"] = self._result_content_to_openai_content()
        return output

    def _result_content_to_openai_content(self) -> list[dict[str, Any]]:
        entries: list[dict[str, Any]] = []
        for item in self.result_content:
            if isinstance(item, TextContent):
                entries.append({"type": "text", "text": item.text or ""})
                continue
            try:
                payload = item.model_dump(mode="json")
            except Exception:
                payload = str(item)
            entries.append({"type": "text", "text": json.dumps(payload)})
        if not entries:
            entries.append({"type": "text", "text": ""})
        return entries


ChatMessage = Annotated[
    SystemChatMessage | UserChatMessage | AssistantChatMessage | ToolChatMessage,
    Field(discriminator="role"),
]


class ChatMetadata(BaseModel):
    id: str = Field(default_factory=create_new_id)
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
