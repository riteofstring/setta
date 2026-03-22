from enum import Enum
from typing import Literal

from pydantic import BaseModel

from setta.mcp.tool_metadata import (
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewKind,
)
from setta.types.chat_messages import ToolChatMessage
from setta.types.generated.chat_messages import (
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID


class StreamingEventType(str, Enum):
    MESSAGE_START = "message_start"
    DELTA = "delta"
    TOOL_CALL_DELTA = "tool_call_delta"
    TOOL_ARGUMENT_PREVIEW_DELTA = "tool_argument_preview_delta"
    TOOL_RESULT = "tool_result"
    MESSAGE_STOP = "message_stop"
    MESSAGE_FINALIZED = "message_finalized"


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
    type: Literal[StreamingEventType.MESSAGE_START] = StreamingEventType.MESSAGE_START
    message: BaseChatMessageUnionWithDiscriminator


class MessageDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.DELTA] = StreamingEventType.DELTA
    message_id: str
    content: list[MessageContentDelta] | None = None


class ToolCallDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.TOOL_CALL_DELTA] = (
        StreamingEventType.TOOL_CALL_DELTA
    )
    message_id: str
    tool_call_id: str
    arguments_delta: str
    tool_name: str | None = None


class ToolResultEvent(BaseModel):
    type: Literal[StreamingEventType.TOOL_RESULT] = StreamingEventType.TOOL_RESULT
    result: ToolChatMessage


class ToolArgumentPreviewDeltaEvent(BaseModel):
    type: Literal[StreamingEventType.TOOL_ARGUMENT_PREVIEW_DELTA] = (
        StreamingEventType.TOOL_ARGUMENT_PREVIEW_DELTA
    )
    message_id: str
    tool_call_id: str
    tool_name: str
    arguments_delta: str
    preview_kind: ToolArgumentPreviewKind
    target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]]
    preview_value_delta: str


class MessageStopEvent(BaseModel):
    type: Literal[StreamingEventType.MESSAGE_STOP] = StreamingEventType.MESSAGE_STOP
    message_id: str


class MessageFinalizedEvent(BaseModel):
    type: Literal[StreamingEventType.MESSAGE_FINALIZED] = (
        StreamingEventType.MESSAGE_FINALIZED
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
