from typing import Annotated, Any

from pydantic import Discriminator, Field, Tag
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    ChatRole,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.generated.go_shared_types import (
    Chat as GoChat,
)
from setta.types.generated.go_shared_types import (
    ChatSectionBranch as GoChatSectionBranch,
)
from setta.types.generated.go_shared_types import (
    ChatSectionState as GoChatSectionState,
)
from setta.types.id import ID


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
