from enum import Enum
from typing import Literal

from pydantic import BaseModel

from setta.types.chat_messages import ChatMessage, ToolChatMessage


class StreamingEventType(str, Enum):
    MESSAGE_START = "message_start"
    DELTA = "delta"
    TOOL_CALL_DELTA = "tool_call_delta"
    TOOL_RESULT = "tool_result"
    MESSAGE_STOP = "message_stop"
    MESSAGE_FINALIZED = "message_finalized"


class MessageTextDelta(BaseModel):
    type: Literal["text_delta"] = "text_delta"
    index: int
    text: str


MessageContentDelta = MessageTextDelta


class MessageStartEvent(BaseModel):
    type: Literal[StreamingEventType.MESSAGE_START] = StreamingEventType.MESSAGE_START
    message: ChatMessage


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


class ToolResultEvent(BaseModel):
    type: Literal[StreamingEventType.TOOL_RESULT] = StreamingEventType.TOOL_RESULT
    result: ToolResult


class MessageStopEvent(BaseModel):
    type: Literal[StreamingEventType.MESSAGE_STOP] = StreamingEventType.MESSAGE_STOP
    message_id: str


class MessageFinalizedEvent(BaseModel):
    type: Literal[StreamingEventType.MESSAGE_FINALIZED] = (
        StreamingEventType.MESSAGE_FINALIZED
    )
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
    chunk: LLMStreamingResponseChunk
