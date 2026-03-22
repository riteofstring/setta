from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from setta.mcp.tool_metadata import (
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewKind,
)
from setta.types.chat_messages import (
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
    ToolChatMessage,
)
from setta.types.generated.go_shared_types import (
    Chat as GoChat,
    ChatMetadata as GoChatMetadata,
    ChatSectionBranch as GoChatSectionBranch,
    ChatSectionState as GoChatSectionState,
    LLMConfig,
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
from setta.types.id import ID, create_new_id
from setta.utils.timestamps import get_now_timestamp, parse_timestamp_str


class ChatMetadata(GoChatMetadata):
    id: ID = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    llmConfig: LLMConfig
    projectConfigId: ID | None = None

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class Chat(GoChat):
    id: ID = Field(default_factory=create_new_id)
    name: str
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    llmConfig: LLMConfig
    projectConfigId: ID | None = None
    messages: list[BaseChatMessageUnion]
    systemPrompt: str | None = None

    @field_validator("lastUpdated", mode="before")
    @classmethod
    def parse_last_updated(cls, v):
        if isinstance(v, str):
            return parse_timestamp_str(v)
        return v


class ChatSectionBranch(GoChatSectionBranch):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    createdAt: int = 0
    parentBranchId: ID | None = None
    branchFromMessageId: ID | None = None


class ChatSectionState(GoChatSectionState):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    inputText: str = ""
    waitingForResponse: bool = False
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    activeBranchId: ID | None = None
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)


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


APIKeys = dict[str, str]
