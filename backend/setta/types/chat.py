import json
from datetime import datetime
from typing import Annotated, Any, Literal

from mcp.types import EmbeddedResource, ImageContent, TextContent
from pydantic import BaseModel, Field, field_validator
from setta.mcp.tool_metadata import (
    ToolArgumentPreviewIdType,
    ToolArgumentPreviewKind,
)
from setta.types.generated.go_shared_types import (
    AssistantChatMessage as GoAssistantChatMessage,
)
from setta.types.generated.go_shared_types import (
    Chat as GoChat,
)
from setta.types.generated.go_shared_types import (
    ChatFileAttachment as GoChatFileAttachment,
)
from setta.types.generated.go_shared_types import (
    ChatMetadata as GoChatMetadata,
)
from setta.types.generated.go_shared_types import (
    ChatRole,
    StreamingEventType,
)
from setta.types.generated.go_shared_types import (
    ChatSectionBranch as GoChatSectionBranch,
)
from setta.types.generated.go_shared_types import (
    ChatSectionState as GoChatSectionState,
)
from setta.types.generated.go_shared_types import (
    MessageDeltaEvent as GoMessageDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    MessageFinalizedEvent as GoMessageFinalizedEvent,
)
from setta.types.generated.go_shared_types import (
    MessageImageURLContent as GoMessageImageURLContent,
)
from setta.types.generated.go_shared_types import (
    MessageStartEvent as GoMessageStartEvent,
)
from setta.types.generated.go_shared_types import (
    MessageStopEvent as GoMessageStopEvent,
)
from setta.types.generated.go_shared_types import (
    MessageTextContent as GoMessageTextContent,
)
from setta.types.generated.go_shared_types import (
    MessageTextDelta as GoMessageTextDelta,
)
from setta.types.generated.go_shared_types import (
    MessageThinkingContent as GoMessageThinkingContent,
)
from setta.types.generated.go_shared_types import (
    MessageThinkingDelta as GoMessageThinkingDelta,
)
from setta.types.generated.go_shared_types import (
    SystemChatMessage as GoSystemChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolArgumentPreviewDeltaEvent as GoToolArgumentPreviewDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolCall as GoToolCall,
)
from setta.types.generated.go_shared_types import (
    ToolCallDeltaEvent as GoToolCallDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolCallFunction as GoToolCallFunction,
)
from setta.types.generated.go_shared_types import (
    ToolChatMessage as GoToolChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolReferenceContent as GoToolReferenceContent,
)
from setta.types.generated.go_shared_types import (
    ToolResultEvent as GoToolResultEvent,
)
from setta.types.generated.go_shared_types import (
    UserChatMessage as GoUserChatMessage,
)
from setta.types.id import ID, create_new_id
from setta.utils.timestamps import get_now_timestamp

JSONValue = dict[str, Any] | list[Any] | str | int | float | bool | None

MessageContent = (
    GoMessageTextContent | GoMessageImageURLContent | GoMessageThinkingContent
)


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
    attachments: list[GoChatFileAttachment] = Field(default_factory=list)


class AssistantChatMessage(GoAssistantChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.assistant] = ChatRole.assistant
    createdAt: int = 0
    content: list[MessageContent] = Field(default_factory=list)
    attachments: list[GoChatFileAttachment] = Field(default_factory=list)
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
    attachments: list[GoChatFileAttachment] = Field(default_factory=list)


class ToolChatMessage(GoToolChatMessage, _OpenAIMessageMixin):
    id: str = Field(default_factory=create_new_id)
    role: Literal[ChatRole.tool] = ChatRole.tool
    createdAt: int = 0
    arguments: JSONValue = Field(default_factory=dict)
    result: JSONValue = None
    content: list[
        TextContent | ImageContent | EmbeddedResource | GoToolReferenceContent
    ] = Field(default_factory=list)
    is_error: bool = False
    started_at: datetime = Field(default_factory=get_now_timestamp)

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


class ChatMetadata(GoChatMetadata):
    id: ID = Field(default_factory=create_new_id)
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    projectConfigId: ID | None = None


class Chat(GoChat):
    id: ID = Field(default_factory=create_new_id)
    lastUpdated: datetime = Field(default_factory=get_now_timestamp)
    projectConfigId: ID | None = None
    messages: list[BaseChatMessageUnion]


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


MessageContentDelta = GoMessageTextDelta | GoMessageThinkingDelta


class MessageStartEvent(GoMessageStartEvent):
    type: Literal[StreamingEventType.message_start] = StreamingEventType.message_start
    message: BaseChatMessageUnionWithDiscriminator


class MessageDeltaEvent(GoMessageDeltaEvent):
    type: Literal[StreamingEventType.delta] = StreamingEventType.delta
    content: list[MessageContentDelta] | None = None


class ToolResultEvent(GoToolResultEvent):
    type: Literal[StreamingEventType.tool_result] = StreamingEventType.tool_result
    result: ToolChatMessage


class ToolArgumentPreviewDeltaEvent(GoToolArgumentPreviewDeltaEvent):
    type: Literal[StreamingEventType.tool_argument_preview_delta] = (
        StreamingEventType.tool_argument_preview_delta
    )
    preview_kind: ToolArgumentPreviewKind
    target_ids_by_type: dict[ToolArgumentPreviewIdType, list[ID]]


class MessageFinalizedEvent(GoMessageFinalizedEvent):
    type: Literal[StreamingEventType.message_finalized] = (
        StreamingEventType.message_finalized
    )
    message: BaseChatMessageUnionWithDiscriminator


LLMStreamingResponseChunk = (
    MessageStartEvent
    | MessageDeltaEvent
    | GoToolCallDeltaEvent
    | ToolResultEvent
    | ToolArgumentPreviewDeltaEvent
    | GoMessageStopEvent
    | MessageFinalizedEvent
)


class LLMStreamingResponse(BaseModel):
    chatId: ID
    chunk: LLMStreamingResponseChunk
    sectionId: ID | None = None
    projectConfigId: ID | None = None


APIKeys = dict[str, str]
