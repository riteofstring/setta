from typing import Annotated, Any

from pydantic import Discriminator, Field, Tag
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
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
    SystemChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolArgumentPreviewDeltaEvent as GoToolArgumentPreviewDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolCallDeltaEvent as GoToolCallDeltaEvent,
)
from setta.types.generated.go_shared_types import (
    ToolChatMessage,
)
from setta.types.generated.go_shared_types import (
    ToolResultEvent as GoToolResultEvent,
)
from setta.types.generated.go_shared_types import (
    UserChatMessage,
)
from setta.types.id import ID


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
