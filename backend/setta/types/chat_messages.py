import json
from datetime import datetime
from typing import Annotated, Any, Literal

from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import Field, field_validator
from setta.types.generated.go_shared_types import (
    AssistantChatMessage as GoAssistantChatMessage,
    ChatFileAttachment as GoChatFileAttachment,
    ChatRole,
    MessageImageURL as GoMessageImageURL,
    MessageImageURLContent as GoMessageImageURLContent,
    MessageTextContent as GoMessageTextContent,
    MessageThinkingContent as GoMessageThinkingContent,
    SystemChatMessage as GoSystemChatMessage,
    ToolCall as GoToolCall,
    ToolCallFunction as GoToolCallFunction,
    ToolChatMessage as GoToolChatMessage,
    ToolReferenceContent as GoToolReferenceContent,
    UserChatMessage as GoUserChatMessage,
)
from setta.types.id import create_new_id
from setta.utils.timestamps import get_now_timestamp

JSONValue = dict[str, Any] | list[Any] | str | int | float | bool | None


class ChatFileAttachment(GoChatFileAttachment):
    pass


class MessageTextContent(GoMessageTextContent):
    type: Literal["text"] = "text"


class MessageImageUrl(GoMessageImageURL):
    detail: Literal["auto", "low", "high"] | None = None


class MessageImageUrlContent(GoMessageImageURLContent):
    type: Literal["image_url"] = "image_url"
    image_url: MessageImageUrl


class MessageThinkingContent(GoMessageThinkingContent):
    type: Literal["thinking"] = "thinking"
    thinking: str = ""
    summary: str | None = ""
    signature: str | None = ""


MessageContent = MessageTextContent | MessageImageUrlContent | MessageThinkingContent


class ToolReferenceContent(GoToolReferenceContent):
    type: Literal["tool_reference"] = "tool_reference"


class ToolCallFunction(GoToolCallFunction):
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


class ToolCall(GoToolCall):
    id: str = Field(default_factory=create_new_id)
    type: Literal["function"] = "function"
    function: ToolCallFunction


class _OpenAIMessageMixin:
    def to_openai_format(self) -> dict[str, Any]:
        output = self.model_dump(exclude_none=True)
        output.pop("id", None)
        output.pop("createdAt", None)
        output.pop("attachments", None)
        return output


class SystemChatMessage(GoSystemChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.system] = ChatRole.system
    createdAt: int = 0
    content: list[MessageContent] = Field(default_factory=list)
    attachments: list[ChatFileAttachment] = Field(default_factory=list)


class AssistantChatMessage(GoAssistantChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.assistant] = ChatRole.assistant
    createdAt: int = 0
    content: list[MessageContent] = Field(default_factory=list)
    attachments: list[ChatFileAttachment] = Field(default_factory=list)
    tool_calls: list[ToolCall] | None = None

    def to_openai_format(self) -> dict[str, Any]:
        output = _OpenAIMessageMixin.to_openai_format(self)
        tool_calls = output.get("tool_calls")
        if tool_calls:
            for call in tool_calls:
                function = call["function"]
                function["arguments"] = json.dumps(function["arguments"])
        return output


class UserChatMessage(GoUserChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.user] = ChatRole.user
    createdAt: int = 0
    content: list[MessageContent] = Field(default_factory=list)
    attachments: list[ChatFileAttachment] = Field(default_factory=list)


class ToolChatMessage(GoToolChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.tool] = ChatRole.tool
    createdAt: int = 0
    tool_name: str | None = None
    arguments: JSONValue = Field(default_factory=dict)
    result: JSONValue = None
    content: list[
        TextContent | ImageContent | EmbeddedResource | ToolReferenceContent
    ] = Field(default_factory=list)
    is_error: bool = False
    started_at: datetime = Field(default_factory=get_now_timestamp)
    completed_at: datetime | None = None

    def to_openai_format(self) -> dict[str, Any]:
        output = _OpenAIMessageMixin.to_openai_format(self)
        output.pop("arguments", None)
        output.pop("result", None)
        output.pop("is_error", None)
        output.pop("started_at", None)
        output.pop("completed_at", None)
        output.pop("tool_name", None)
        return output


BaseChatMessageUnion = (
    SystemChatMessage | AssistantChatMessage | UserChatMessage | ToolChatMessage
)

BaseChatMessageUnionWithDiscriminator = Annotated[
    BaseChatMessageUnion, Field(discriminator="role")
]
