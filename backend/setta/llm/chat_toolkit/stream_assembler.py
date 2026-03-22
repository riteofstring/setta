from setta.types.chat import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
    ToolCall,
)
from setta.types.id import create_new_id

from .tool_calls import ToolCallAccumulator


def _normalize_index(index: int | None, current_length: int) -> int:
    if index is None:
        return max(current_length - 1, 0)
    if index < 0:
        return 0
    return index


def _ensure_text_block(
    content: list[MessageTextContent | MessageThinkingContent],
    index: int,
) -> MessageTextContent:
    while len(content) <= index:
        content.append(MessageTextContent(text=""))
    block = content[index]
    if isinstance(block, MessageTextContent):
        return block
    block = MessageTextContent(text="")
    content[index] = block
    return block


def _ensure_thinking_block(
    content: list[MessageTextContent | MessageThinkingContent],
    index: int,
) -> MessageThinkingContent:
    while len(content) <= index:
        content.append(MessageThinkingContent())
    block = content[index]
    if isinstance(block, MessageThinkingContent):
        return block
    block = MessageThinkingContent()
    content[index] = block
    return block


class AssistantMessageBuilder:
    def __init__(self, message_id: str | None = None) -> None:
        self._message = AssistantChatMessage(
            id=message_id or create_new_id(),
            content=[],
            tool_calls=None,
        )
        self._tool_calls = ToolCallAccumulator()

    @property
    def id(self) -> str:
        return self._message.id

    def preview(self) -> AssistantChatMessage:
        return self._message.model_copy(deep=True)

    def append_text(self, text: str, *, index: int | None = None) -> None:
        if not text:
            return
        resolved = _normalize_index(index, len(self._message.content))
        block = _ensure_text_block(self._message.content, resolved)
        block.text += text

    def append_thinking(
        self,
        thinking: str,
        *,
        index: int | None = None,
        summary: str | None = None,
        signature: str | None = None,
    ) -> None:
        resolved = _normalize_index(index, len(self._message.content))
        block = _ensure_thinking_block(self._message.content, resolved)
        if thinking:
            block.thinking += thinking
        if summary is not None:
            block.summary = summary
        if signature is not None:
            block.signature = signature

    def append_tool_call(self, tool_call: ToolCall) -> None:
        self._tool_calls.add_tool_call(tool_call)
        self._message.tool_calls = self._tool_calls.tool_calls()

    def apply_tool_call_delta(
        self,
        *,
        tool_call_id: str,
        arguments_delta: str,
        tool_name: str | None = None,
    ) -> ToolCall:
        call = self._tool_calls.apply_delta(
            tool_call_id=tool_call_id,
            arguments_delta=arguments_delta,
            tool_name=tool_name,
        )
        self._message.tool_calls = self._tool_calls.tool_calls()
        return call

    def finalize(self) -> AssistantChatMessage:
        tool_calls = self._tool_calls.finalize()
        if tool_calls:
            self._message.tool_calls = tool_calls
        return self._message.model_copy(deep=True)


class ChatStreamAssembler:
    def start_assistant_message(
        self, message_id: str | None = None
    ) -> AssistantMessageBuilder:
        return AssistantMessageBuilder(message_id=message_id)
