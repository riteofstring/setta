"""Core LLM message and streaming models used across the backend."""

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Literal

JSONValue = str | int | float | bool | None | dict[str, Any] | list[Any]


class LLMRole(str, Enum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


@dataclass
class LLMTextBlock:
    type: Literal["text"] = "text"
    text: str = ""
    stream_target: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"type": self.type, "text": self.text}
        if self.stream_target is not None:
            data["stream_target"] = self.stream_target
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMTextBlock":
        return cls(
            text=payload["text"],
            stream_target=payload.get("stream_target"),
        )

    def to_openai_block(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass
class LLMReasoningBlock:
    type: Literal["reasoning"] = "reasoning"
    text: str = ""
    token_count: int | None = None
    label: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {"type": self.type, "text": self.text}
        if self.token_count is not None:
            data["token_count"] = self.token_count
        if self.label is not None:
            data["label"] = self.label
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMReasoningBlock":
        return cls(
            text=payload["text"],
            token_count=payload.get("token_count"),
            label=payload.get("label"),
        )

    def to_openai_block(self) -> dict[str, Any]:
        return self.to_dict()


@dataclass
class LLMToolCallBlock:
    type: Literal["tool_call"] = "tool_call"
    tool_call_id: str = ""
    name: str = ""
    arguments_text: str | None = None
    arguments_json: JSONValue | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "type": self.type,
            "tool_call_id": self.tool_call_id,
            "name": self.name,
        }
        if self.arguments_text is not None:
            data["arguments_text"] = self.arguments_text
        if self.arguments_json is not None:
            data["arguments_json"] = self.arguments_json
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMToolCallBlock":
        return cls(
            tool_call_id=payload["tool_call_id"],
            name=payload["name"],
            arguments_text=payload.get("arguments_text"),
            arguments_json=payload.get("arguments_json"),
        )

    def to_openai_block(self) -> dict[str, Any]:
        arguments = self.arguments_text
        if arguments is None and self.arguments_json is not None:
            arguments = json.dumps(self.arguments_json)
        return {
            "type": self.type,
            "id": self.tool_call_id,
            "function": {
                "name": self.name,
                "arguments": arguments or "{}",
            },
        }


@dataclass
class LLMToolResultBlock:
    type: Literal["tool_result"] = "tool_result"
    tool_call_id: str = ""
    name: str | None = None
    output_text: str | None = None
    output_json: JSONValue | None = None
    is_error: bool = False

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "type": self.type,
            "tool_call_id": self.tool_call_id,
            "is_error": self.is_error,
        }
        if self.name is not None:
            data["name"] = self.name
        if self.output_text is not None:
            data["output_text"] = self.output_text
        if self.output_json is not None:
            data["output_json"] = self.output_json
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMToolResultBlock":
        return cls(
            tool_call_id=payload["tool_call_id"],
            name=payload.get("name"),
            output_text=payload.get("output_text"),
            output_json=payload.get("output_json"),
            is_error=payload.get("is_error", False),
        )

    def to_openai_block(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "type": self.type,
            "tool_call_id": self.tool_call_id,
            "is_error": self.is_error,
        }
        if self.output_text is not None:
            data["output_text"] = self.output_text
        if self.output_json is not None:
            data["output_json"] = self.output_json
        if self.name is not None:
            data["name"] = self.name
        return data


LLMContentBlock = (
    LLMTextBlock | LLMReasoningBlock | LLMToolCallBlock | LLMToolResultBlock
)


def content_block_from_dict(payload: dict[str, Any]) -> LLMContentBlock:
    block_type = payload["type"]
    if block_type == "text":
        return LLMTextBlock.from_dict(payload)
    if block_type == "reasoning":
        return LLMReasoningBlock.from_dict(payload)
    if block_type == "tool_call":
        return LLMToolCallBlock.from_dict(payload)
    if block_type == "tool_result":
        return LLMToolResultBlock.from_dict(payload)
    raise ValueError(f"Unsupported content block type: {block_type}")


@dataclass
class LLMMessage:
    message_id: str
    role: LLMRole
    content: list[LLMContentBlock] = field(default_factory=list)
    name: str | None = None
    metadata: dict[str, JSONValue] | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "message_id": self.message_id,
            "role": self.role.value,
            "content": [block.to_dict() for block in self.content],
        }
        if self.name is not None:
            data["name"] = self.name
        if self.metadata is not None:
            data["metadata"] = self.metadata
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "LLMMessage":
        content_payload = payload["content"]
        if not isinstance(content_payload, list):
            raise TypeError("LLMMessage.content must be a list")
        return cls(
            message_id=payload["message_id"],
            role=LLMRole(payload["role"]),
            content=[content_block_from_dict(block) for block in content_payload],
            name=payload.get("name"),
            metadata=payload.get("metadata"),
        )

    def to_openai_dict(self) -> dict[str, Any]:
        content = [block.to_openai_block() for block in self.content]
        data: dict[str, Any] = {"role": self.role.value, "content": content}
        if self.name is not None:
            data["name"] = self.name
        return data

    def add_block(self, block: LLMContentBlock) -> None:
        self.content.append(block)


@dataclass
class LLMHistory:
    messages: list[LLMMessage] = field(default_factory=list)

    def add(self, message: LLMMessage) -> None:
        self.messages.append(message)

    def to_openai_messages(self) -> list[dict[str, Any]]:
        return [message.to_openai_dict() for message in self.messages]

    def to_dicts(self) -> list[dict[str, Any]]:
        return [message.to_dict() for message in self.messages]

    @classmethod
    def from_dicts(cls, payload: list[dict[str, Any]]) -> "LLMHistory":
        return cls([LLMMessage.from_dict(item) for item in payload])


class LLMStreamEventType(str, Enum):
    MESSAGE_STARTED = "message_started"
    TEXT_DELTA = "text_delta"
    TOOL_CALL_DELTA = "tool_call_delta"
    TOOL_RESULT = "tool_result"
    RESPONSE_COMPLETED = "response_completed"


@dataclass
class MessageStartedEvent:
    message_id: str
    role: LLMRole
    event_type: LLMStreamEventType = LLMStreamEventType.MESSAGE_STARTED

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_type": self.event_type.value,
            "message_id": self.message_id,
            "role": self.role.value,
        }


@dataclass
class TextDeltaEvent:
    message_id: str
    delta: str
    stream_target: str | None = None
    event_type: LLMStreamEventType = LLMStreamEventType.TEXT_DELTA

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "event_type": self.event_type.value,
            "message_id": self.message_id,
            "delta": self.delta,
        }
        if self.stream_target is not None:
            data["stream_target"] = self.stream_target
        return data


@dataclass
class ToolCallDeltaEvent:
    tool_call_id: str
    arguments_delta: str
    name: str | None = None
    event_type: LLMStreamEventType = LLMStreamEventType.TOOL_CALL_DELTA

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "event_type": self.event_type.value,
            "tool_call_id": self.tool_call_id,
            "arguments_delta": self.arguments_delta,
        }
        if self.name is not None:
            data["name"] = self.name
        return data


@dataclass
class ToolResultEvent:
    tool_call_id: str
    output: JSONValue | None = None
    output_text: str | None = None
    is_error: bool = False
    event_type: LLMStreamEventType = LLMStreamEventType.TOOL_RESULT

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "event_type": self.event_type.value,
            "tool_call_id": self.tool_call_id,
            "is_error": self.is_error,
        }
        if self.output is not None:
            data["output"] = self.output
        if self.output_text is not None:
            data["output_text"] = self.output_text
        return data


@dataclass
class ResponseCompletedEvent:
    message_id: str
    finish_reason: str | None = None
    event_type: LLMStreamEventType = LLMStreamEventType.RESPONSE_COMPLETED

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "event_type": self.event_type.value,
            "message_id": self.message_id,
        }
        if self.finish_reason is not None:
            data["finish_reason"] = self.finish_reason
        return data


LLMStreamEvent = (
    MessageStartedEvent
    | TextDeltaEvent
    | ToolCallDeltaEvent
    | ToolResultEvent
    | ResponseCompletedEvent
)


def stream_event_to_dict(event: LLMStreamEvent) -> dict[str, Any]:
    return event.to_dict()
