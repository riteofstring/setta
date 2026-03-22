from typing import Literal

from pydantic import BaseModel
from setta.mcp.tool_metadata import (
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewKind,
)
from setta.types.chat_messages import (
    BaseChatMessageUnionWithDiscriminator,
    ToolChatMessage,
)
from setta.types.generated.go_shared_types import StreamingEventType
from setta.types.id import ID


class MessageTextDelta(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    index: int
    text: str


class MessageThinkingDelta(BaseModel):
    type: Literal["thinking_delta"] = "thinking_delta"
    index: int
    thinking: str
    summary: str | None = None
    signature: str | None = None


MessageContentDelta = MessageTextDelta | MessageThinkingDelta


class MessageStartEvent(BaseModel):
    type: Literal[StreamingEventType.message_start] = StreamingEventType.message_start
    message: BaseChatMessageUnionWithDiscriminator


class MessageDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.delta] = StreamingEventType.delta
    message_id: str
    content: list[MessageContentDelta] | None = None


class ToolCallDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.tool_call_delta] = (
        StreamingEventType.tool_call_delta
    )
    message_id: str
    tool_call_id: str
    arguments_delta: str
    tool_name: str | None = None


class ToolResultEvent(BaseModel):
    type: Literal[StreamingEventType.tool_result] = StreamingEventType.tool_result
    result: ToolChatMessage


class ToolArgumentPreviewDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.tool_argument_preview_delta] = (
        StreamingEventType.tool_argument_preview_delta
    )
    message_id: str
    tool_call_id: str
    tool_name: str
    arguments_delta: str
    preview_kind: ToolArgumentPreviewKind
    target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]]
    preview_value_delta: str


class MessageStopEvent(BaseModel):
    type: Literal[StreamingEventType.message_stop] = StreamingEventType.message_stop
    message_id: str


class MessageFinalizedEvent(BaseModel):
    type: Literal[StreamingEventType.message_finalized] = (
        StreamingEventType.message_finalized
    )
    message: BaseChatMessageUnionWithDiscriminator


LLMStreamingResponseChunk = (
    MessageStartEvent
    | MessageDeltaEvent
    | ToolCallDeltaEvent
    | ToolResultEvent
    | ToolArgumentPreviewDeltaEvent
    | MessageStopEvent
    | MessageFinalizedEvent
)


class LLMStreamingResponse(BaseModel):
    chatId: ID
    chunk: LLMStreamingResponseChunk
    sectionId: ID | None = None
    projectConfigId: ID | None = None
