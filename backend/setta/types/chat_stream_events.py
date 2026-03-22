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
from setta.types.generated.go_shared_types import (
    MessageDeltaEvent as GoMessageDeltaEvent,
    MessageFinalizedEvent as GoMessageFinalizedEvent,
    MessageStartEvent as GoMessageStartEvent,
    MessageStopEvent as GoMessageStopEvent,
    MessageTextDelta as GoMessageTextDelta,
    MessageThinkingDelta as GoMessageThinkingDelta,
    StreamingEventType,
    ToolArgumentPreviewDeltaEvent as GoToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent as GoToolCallDeltaEvent,
    ToolResultEvent as GoToolResultEvent,
)
from setta.types.id import ID


class MessageTextDelta(GoMessageTextDelta):
    type: Literal["text_delta"] = "text_delta"


class MessageThinkingDelta(GoMessageThinkingDelta):
    type: Literal["thinking_delta"] = "thinking_delta"
    summary: str | None = None
    signature: str | None = None


MessageContentDelta = MessageTextDelta | MessageThinkingDelta


class MessageStartEvent(GoMessageStartEvent):
    type: Literal[StreamingEventType.message_start] = StreamingEventType.message_start
    message: BaseChatMessageUnionWithDiscriminator


class MessageDeltaEvent(GoMessageDeltaEvent):
    type: Literal[StreamingEventType.delta] = StreamingEventType.delta
    content: list[MessageContentDelta] | None = None


class ToolCallDeltaEvent(GoToolCallDeltaEvent):
    type: Literal[StreamingEventType.tool_call_delta] = (
        StreamingEventType.tool_call_delta
    )
    tool_name: str | None = None


class ToolResultEvent(GoToolResultEvent):
    type: Literal[StreamingEventType.tool_result] = StreamingEventType.tool_result
    result: ToolChatMessage


class ToolArgumentPreviewDeltaEvent(GoToolArgumentPreviewDeltaEvent):
    type: Literal[StreamingEventType.tool_argument_preview_delta] = (
        StreamingEventType.tool_argument_preview_delta
    )
    preview_kind: ToolArgumentPreviewKind
    target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]]


class MessageStopEvent(GoMessageStopEvent):
    type: Literal[StreamingEventType.message_stop] = StreamingEventType.message_stop


class MessageFinalizedEvent(GoMessageFinalizedEvent):
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
