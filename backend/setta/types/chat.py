import json
from typing import Annotated, Any

from pydantic import Discriminator, Field, Tag
from setta.types.generated.go_shared_types import (
    AssistantChatMessage as GoAssistantChatMessage,
)
from setta.types.generated.go_shared_types import (
    Chat as GoChat,
)
from setta.types.generated.go_shared_types import (
    ChatRole,
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
    MessageStartEvent as GoMessageStartEvent,
)
from setta.types.generated.go_shared_types import (
    MessageStopEvent as GoMessageStopEvent,
)
from setta.types.generated.go_shared_types import (
    SystemChatMessage as GoSystemChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolArgumentPreviewDeltaEvent as GoToolArgumentPreviewDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolCallDeltaEvent as GoToolCallDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolChatMessage as GoToolChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolResultEvent as GoToolResultEvent,
)
from setta.types.generated.go_shared_types import (
    UserChatMessage as GoUserChatMessage,
)
from setta.types.id import ID


class _OpenAIMessageMixin:
    def to_openai_format(self) -> dict[str, Any]:
        output = self.model_dump(exclude_none=True)
        output.pop("id", None)
        output.pop("createdAt", None)
        output.pop("attachments", None)
        return output


class SystemChatMessage(GoSystemChatMessage, _OpenAIMessageMixin):
    pass


class AssistantChatMessage(GoAssistantChatMessage, _OpenAIMessageMixin):
    def to_openai_format(self) -> dict[str, Any]:
        output = _OpenAIMessageMixin.to_openai_format(self)
        tool_calls = output.get("tool_calls")
        if tool_calls:
            for call in tool_calls:
                function = call["function"]
                function["arguments"] = json.dumps(function["arguments"])
        return output


class UserChatMessage(GoUserChatMessage, _OpenAIMessageMixin):
    pass


class ToolChatMessage(GoToolChatMessage, _OpenAIMessageMixin):
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


def _chat_role(value: Any) -> str | None:
    raw_role = (
        value.get("role") if isinstance(value, dict) else getattr(value, "role", None)
    )
    if isinstance(raw_role, ChatRole):
        return raw_role.value
    if isinstance(raw_role, str):
        return raw_role
    return None


BaseChatMessageUnionWithDiscriminator = Annotated[
    Annotated[SystemChatMessage, Tag(ChatRole.system.value)]
    | Annotated[AssistantChatMessage, Tag(ChatRole.assistant.value)]
    | Annotated[UserChatMessage, Tag(ChatRole.user.value)]
    | Annotated[ToolChatMessage, Tag(ChatRole.tool.value)],
    Discriminator(_chat_role),
]


class Chat(GoChat):
    messages: list[BaseChatMessageUnion]


class ChatSectionBranch(GoChatSectionBranch):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)


class ChatSectionState(GoChatSectionState):
    messages: list[BaseChatMessageUnion] = Field(default_factory=list)
    branches: dict[ID, ChatSectionBranch] = Field(default_factory=dict)


LLMStreamingResponseChunk = (
    GoMessageStartEvent
    | GoMessageDeltaEvent
    | GoToolCallDeltaEvent
    | GoToolResultEvent
    | GoToolArgumentPreviewDeltaEvent
    | GoMessageStopEvent
    | GoMessageFinalizedEvent
)
