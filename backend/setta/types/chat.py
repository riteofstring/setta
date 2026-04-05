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

BaseChatMessageUnionWithDiscriminator = BaseChatMessageUnion
