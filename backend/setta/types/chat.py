from typing import Annotated, Any

from pydantic import Discriminator, Tag
from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    BaseChatMessageUnion,
    Chat,
    ChatRole,
    ChatSectionBranch,
    ChatSectionState,
    LLMStreamingResponseChunk,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)

__all__ = [
    "AssistantChatMessage",
    "BaseChatMessageUnion",
    "BaseChatMessageUnionWithDiscriminator",
    "Chat",
    "ChatRole",
    "ChatSectionBranch",
    "ChatSectionState",
    "LLMStreamingResponseChunk",
    "SystemChatMessage",
    "ToolChatMessage",
    "UserChatMessage",
]


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
