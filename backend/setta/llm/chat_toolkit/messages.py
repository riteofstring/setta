from typing import Literal

from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatFileAttachment,
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
    summary: str | None = None,
    signature: str | None = None,
) -> MessageThinkingContent:
    return MessageThinkingContent(
        thinking=thinking,
        summary=summary,
        signature=signature,
    )


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
    *,
    attachments: list[ChatFileAttachment] | None = None,
) -> SystemChatMessage:
    return SystemChatMessage(content=content, attachments=attachments or [])


def user_message(
    content: list[MessageTextContent | MessageImageUrlContent | MessageThinkingContent],
    *,
    attachments: list[ChatFileAttachment] | None = None,
) -> UserChatMessage:
    return UserChatMessage(content=content, attachments=attachments or [])


def assistant_message(
    content: list[MessageTextContent | MessageImageUrlContent | MessageThinkingContent],
    *,
    tool_calls: list[ToolCall] | None = None,
    attachments: list[ChatFileAttachment] | None = None,
) -> AssistantChatMessage:
    return AssistantChatMessage(
        content=content,
        tool_calls=tool_calls,
        attachments=attachments or [],
    )


def message_attachment(
    *,
    id: str,
    name: str,
    mime_type: str | None = None,
    size: int | None = None,
) -> ChatFileAttachment:
    return ChatFileAttachment(id=id, name=name, mimeType=mime_type, size=size)
