import json
from datetime import datetime
from enum import Enum
from typing import Any, Literal

from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field, field_validator

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


class ToolResult(BaseModel):
    tool_call_id: str
    content: list[TextContent | ImageContent | EmbeddedResource]
    is_error: bool = False


class ChatMessage(BaseModel):
    id: str = Field(default_factory=create_new_id)
    role: ChatRole
    content: list[MessageContent]
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None
    metadata: dict[str, Any] | None = None

    def to_openai_format(self) -> dict[str, Any]:
        output = self.model_dump(exclude_none=True)
        output.pop("id", None)
        output.pop("metadata", None)

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


class MessageStartEvent(BaseModel):
    type: Literal["message_start"] = "message_start"
    message: ChatMessage


class MessageTextDelta(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    index: int
    text: str


MessageContentDelta = MessageTextDelta


class MessageDeltaEvent(BaseModel):
    type: Literal["delta"] = "delta"
    message_id: str
    content: list[MessageContentDelta] | None = None


class ToolCallDeltaEvent(BaseModel):
    type: Literal["tool_call_delta"] = "tool_call_delta"
    message_id: str
    tool_call_id: str
    arguments_delta: str


class ToolResultEvent(BaseModel):
    type: Literal["tool_result"] = "tool_result"
    result: ToolResult


class MessageStopEvent(BaseModel):
    type: Literal["message_stop"] = "message_stop"
    message_id: str


class MessageFinalizedEvent(BaseModel):
    type: Literal["message_finalized"] = "message_finalized"
    message: ChatMessage


LLMStreamingResponseChunk = (
    MessageStartEvent
    | MessageDeltaEvent
    | ToolCallDeltaEvent
    | ToolResultEvent
    | MessageStopEvent
    | MessageFinalizedEvent
)


class LLMStreamingResponse(BaseModel):
    chatId: str
    assistantMessageId: str | None = None
    chunk: LLMStreamingResponseChunk
