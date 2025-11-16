"""Neutral chat persistence models that wrap the core LLM abstractions."""

from datetime import datetime
from typing import Any, ClassVar, Literal

from pydantic import BaseModel, Field, field_serializer, field_validator

from setta.database.utils import create_new_id
from setta.llm.models import (
    JSONValue,
    LLMContentBlock,
    LLMHistory,
    LLMMessage,
    LLMReasoningBlock,
    LLMRole,
    LLMStreamEvent,
    LLMStreamEventType,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    MessageStartedEvent,
    ResponseCompletedEvent,
    TextDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
    content_block_from_dict,
    stream_event_to_dict,
)
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str

CONTENT_BLOCK_TYPES: ClassVar[tuple[type, ...]] = (
    LLMTextBlock,
    LLMReasoningBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
)


class LLMModelSelection(BaseModel):
    """Frontend-provided selection of a provider/model pair."""

    providerId: str
    modelId: str


class ChatMessage(BaseModel):
    """A single persisted chat message backed by normalized LLM content blocks."""

    id: str = Field(default_factory=create_new_id)
    role: LLMRole = LLMRole.USER
    content: list[LLMContentBlock] = Field(default_factory=list)
    name: str | None = None
    metadata: dict[str, JSONValue] | None = None

    @field_validator("content", mode="before")
    @classmethod
    def _coerce_content(cls, value: Any) -> list[LLMContentBlock]:
        if value is None:
            return []
        if isinstance(value, list):
            output: list[LLMContentBlock] = []
            for block in value:
                if isinstance(block, CONTENT_BLOCK_TYPES):
                    output.append(block)
                    continue
                if isinstance(block, dict):
                    output.append(content_block_from_dict(block))
                    continue
                raise TypeError(f"Unsupported content block payload: {block!r}")
            return output
        raise TypeError("ChatMessage.content must be a list")

    @field_serializer("content")
    def _serialize_content(
        self, content: list[LLMContentBlock]
    ) -> list[dict[str, Any]]:
        return [block.to_dict() for block in content]

    @field_serializer("role")
    def _serialize_role(self, role: LLMRole) -> str:
        return role.value

    def to_llm_message(self) -> LLMMessage:
        """Convert this persisted message back into the runtime dataclass."""

        return LLMMessage(
            message_id=self.id,
            role=self.role,
            content=list(self.content),
            name=self.name,
            metadata=self.metadata,
        )

    @classmethod
    def from_llm_message(cls, message: LLMMessage) -> "ChatMessage":
        return cls(
            id=message.message_id,
            role=message.role,
            content=list(message.content),
            name=message.name,
            metadata=message.metadata,
        )


class Chat(BaseModel):
    """Persisted transcript of a chat session."""

    id: str = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    messages: list[ChatMessage] = Field(default_factory=list)
    modelSelection: LLMModelSelection | None = None

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def _parse_last_updated(cls, value: datetime | str | None) -> datetime:
        if value is None:
            return get_now_timestamp()
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return parse_timestamp_str(value)
        raise TypeError("Chat.lastUpdated must be datetime or ISO string")

    @field_serializer("lastUpdated")
    def _serialize_last_updated(self, value: datetime) -> str:
        return value.isoformat()

    def add_message(self, message: ChatMessage | LLMMessage) -> None:
        if isinstance(message, LLMMessage):
            chat_message = ChatMessage.from_llm_message(message)
        else:
            chat_message = message
        self.messages.append(chat_message)
        self.lastUpdated = get_now_timestamp()

    def to_history(self) -> LLMHistory:
        return LLMHistory([message.to_llm_message() for message in self.messages])

    @classmethod
    def from_history(cls, *, history: LLMHistory, name: str) -> "Chat":
        messages = [
            ChatMessage.from_llm_message(message) for message in history.messages
        ]
        return cls(name=name, messages=messages)


class ChatMetadata(BaseModel):
    id: str = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def _parse_last_updated(cls, value: datetime | str | None) -> datetime:
        if value is None:
            return get_now_timestamp()
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            return parse_timestamp_str(value)
        raise TypeError("ChatMetadata.lastUpdated must be datetime or ISO string")

    @field_serializer("lastUpdated")
    def _serialize_last_updated(self, value: datetime) -> str:
        return value.isoformat()

    @classmethod
    def from_chat(cls, chat: Chat) -> "ChatMetadata":
        return cls(id=chat.id, name=chat.name, lastUpdated=chat.lastUpdated)


class ToolResult(BaseModel):
    """Structured tool output keyed by tool_call_id."""

    type: Literal["tool_result"] = "tool_result"
    tool_call_id: str
    name: str | None = None
    output_text: str | None = None
    output_json: JSONValue | None = None
    is_error: bool = False

    def to_block(self) -> LLMToolResultBlock:
        return LLMToolResultBlock(
            tool_call_id=self.tool_call_id,
            name=self.name,
            output_text=self.output_text,
            output_json=self.output_json,
            is_error=self.is_error,
        )

    @classmethod
    def from_block(cls, block: LLMToolResultBlock) -> "ToolResult":
        return cls(
            tool_call_id=block.tool_call_id,
            name=block.name,
            output_text=block.output_text,
            output_json=block.output_json,
            is_error=block.is_error,
        )


LLMStreamingResponseChunk = LLMStreamEvent


class LLMStreamingResponse(BaseModel):
    """Websocket payload carrying normalized streaming events to the frontend."""

    chatId: str
    assistantMessageId: str | None = None
    chunk: LLMStreamEvent

    @field_validator("chunk", mode="before")
    @classmethod
    def _parse_chunk(cls, value: Any) -> LLMStreamEvent:
        if isinstance(value, dict):
            return _stream_event_from_dict(value)
        if isinstance(value, LLMStreamEvent):
            return value
        raise TypeError("LLMStreamingResponse.chunk must be a stream event payload")

    @field_serializer("chunk")
    def _serialize_chunk(self, chunk: LLMStreamEvent) -> dict[str, Any]:
        return stream_event_to_dict(chunk)


def _stream_event_from_dict(payload: dict[str, Any]) -> LLMStreamEvent:
    event_type = LLMStreamEventType(payload["event_type"])

    if event_type is LLMStreamEventType.MESSAGE_STARTED:
        return MessageStartedEvent(
            message_id=payload["message_id"],
            role=LLMRole(payload["role"]),
        )

    if event_type is LLMStreamEventType.TEXT_DELTA:
        return TextDeltaEvent(
            message_id=payload["message_id"],
            delta=payload["delta"],
            stream_target=payload.get("stream_target"),
        )

    if event_type is LLMStreamEventType.TOOL_CALL_DELTA:
        return ToolCallDeltaEvent(
            tool_call_id=payload["tool_call_id"],
            arguments_delta=payload["arguments_delta"],
            name=payload.get("name"),
        )

    if event_type is LLMStreamEventType.TOOL_RESULT:
        return ToolResultEvent(
            tool_call_id=payload["tool_call_id"],
            output=payload.get("output"),
            output_text=payload.get("output_text"),
            is_error=payload.get("is_error", False),
        )

    if event_type is LLMStreamEventType.RESPONSE_COMPLETED:
        return ResponseCompletedEvent(
            message_id=payload["message_id"],
            finish_reason=payload.get("finish_reason"),
        )

    raise ValueError(f"Unsupported stream event type: {payload['event_type']}")


__all__ = [
    "Chat",
    "ChatMessage",
    "ChatMetadata",
    "LLMStreamingResponse",
    "LLMStreamingResponseChunk",
    "ToolResult",
]
