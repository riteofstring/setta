from typing import Literal

from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageImageUrl,
    MessageImageUrlContent,
    MessageTextContent,
    MessageThinkingContent,
    SystemChatMessage,
    ToolCall,
    ToolReferenceContent,
    UserChatMessage,
)


def message_text(text: str) -> MessageTextContent:
    return MessageTextContent(text=text)


def message_thinking(
    thinking: str,
    *,
    signature: str | None = None,
) -> MessageThinkingContent:
    return MessageThinkingContent(thinking=thinking, signature=signature)


def message_image_url(
    url: str,
    *,
    detail: Literal["auto", "low", "high"] | None = None,
) -> MessageImageUrlContent:
    return MessageImageUrlContent(image_url=MessageImageUrl(url=url, detail=detail))


def tool_reference(tool_name: str) -> ToolReferenceContent:
    return ToolReferenceContent(tool_name=tool_name)


def system_message(
    content: list[MessageTextContent | MessageImageUrlContent | MessageThinkingContent],
) -> SystemChatMessage:
    return SystemChatMessage(content=content)


def user_message(
    content: list[MessageTextContent | MessageImageUrlContent | MessageThinkingContent],
) -> UserChatMessage:
    return UserChatMessage(content=content)


def assistant_message(
    content: list[MessageTextContent | MessageImageUrlContent | MessageThinkingContent],
    *,
    tool_calls: list[ToolCall] | None = None,
) -> AssistantChatMessage:
    return AssistantChatMessage(content=content, tool_calls=tool_calls)
