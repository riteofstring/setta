from typing import Literal

from setta.types.generated.go_shared_types import (
    AssistantChatMessage,
    ChatFileAttachment,
    MessageImageURL,
    MessageImageURLContent,
    MessageTextContent,
    MessageThinkingContent,
    SystemChatMessage,
    ToolCall,
    ToolReferenceContent,
    UserChatMessage,
)

from .section_sync import apply_stream_delta, build_chat_section_state
from .stream_assembler import ChatStreamAssembler
from .tool_calls import ToolCallAccumulator, ToolCallBuilder


def message_text(text: str) -> MessageTextContent:
    return MessageTextContent(type="text", text=text)


def message_thinking(
    thinking: str,
    *,
    summary: str | None = None,
    signature: str | None = None,
) -> MessageThinkingContent:
    return MessageThinkingContent(
        type="thinking",
        thinking=thinking,
        summary=summary,
        signature=signature,
    )


def message_image_url(
    url: str,
    *,
    detail: Literal["auto", "low", "high"] | None = None,
) -> MessageImageURLContent:
    return MessageImageURLContent(
        type="image_url",
        image_url=MessageImageURL(url=url, detail=detail),
    )


def tool_reference(tool_name: str) -> ToolReferenceContent:
    return ToolReferenceContent(type="tool_reference", tool_name=tool_name)


def system_message(
    content: list[MessageTextContent | MessageImageURLContent | MessageThinkingContent],
    *,
    attachments: list[ChatFileAttachment] | None = None,
) -> SystemChatMessage:
    return SystemChatMessage(content=content, attachments=attachments or [])


def user_message(
    content: list[MessageTextContent | MessageImageURLContent | MessageThinkingContent],
    *,
    attachments: list[ChatFileAttachment] | None = None,
) -> UserChatMessage:
    return UserChatMessage(content=content, attachments=attachments or [])


def assistant_message(
    content: list[MessageTextContent | MessageImageURLContent | MessageThinkingContent],
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


__all__ = [
    "ChatStreamAssembler",
    "ToolCallAccumulator",
    "ToolCallBuilder",
    "apply_stream_delta",
    "assistant_message",
    "message_attachment",
    "build_chat_section_state",
    "message_image_url",
    "message_text",
    "message_thinking",
    "system_message",
    "tool_reference",
    "user_message",
]
