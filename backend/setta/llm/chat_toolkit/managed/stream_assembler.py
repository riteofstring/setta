from dataclasses import dataclass
from typing import Literal

from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
)
from setta.types.chat_stream_events import (
    MessageContentDelta,
    MessageTextDelta,
    MessageThinkingDelta,
)


@dataclass
class StreamContentEntry:
    kind: Literal["text", "thinking"]
    text: str
    index: int | None
    signature: str | None = None

    @property
    def has_payload(self) -> bool:
        if self.kind == "text":
            return bool(self.text)
        return bool(self.text) or self.signature is not None


class ManagedStreamAssembler:
    def __init__(self, assistant_message: AssistantChatMessage) -> None:
        self._assistant_message = assistant_message

    def apply_entries(
        self,
        entries: list[StreamContentEntry],
    ) -> list[MessageContentDelta]:
        if not entries:
            return []
        deltas: list[MessageContentDelta] = []
        for entry in entries:
            index = self._resolve_content_index(entry.index, entry.kind)
            if entry.kind == "thinking":
                block = self._ensure_thinking_block(index)
                if entry.text:
                    block.thinking += entry.text
                if entry.signature is not None:
                    block.signature = entry.signature
                if entry.has_payload:
                    deltas.append(
                        MessageThinkingDelta(
                            index=index,
                            thinking=entry.text,
                            signature=entry.signature,
                        )
                    )
                continue

            block = self._ensure_text_block(index)
            block.text += entry.text
            deltas.append(MessageTextDelta(index=index, text=entry.text))
        return deltas

    def _resolve_content_index(
        self,
        provided_index: int | None,
        kind: Literal["text", "thinking"],
    ) -> int:
        if provided_index is not None and provided_index >= 0:
            return provided_index

        content = self._assistant_message.content
        if not content:
            return 0

        last_index = len(content) - 1
        last_block = content[last_index]

        if kind == "thinking" and isinstance(last_block, MessageThinkingContent):
            return last_index
        if kind == "text" and isinstance(last_block, MessageTextContent):
            return last_index

        return len(content)

    def _ensure_text_block(self, index: int) -> MessageTextContent:
        while len(self._assistant_message.content) <= index:
            self._assistant_message.content.append(
                MessageTextContent(type="text", text="")
            )
        block = self._assistant_message.content[index]
        if not isinstance(block, MessageTextContent):
            block = MessageTextContent(type="text", text="")
            self._assistant_message.content[index] = block
        return block

    def _ensure_thinking_block(self, index: int) -> MessageThinkingContent:
        while len(self._assistant_message.content) <= index:
            self._assistant_message.content.append(MessageThinkingContent())
        block = self._assistant_message.content[index]
        if not isinstance(block, MessageThinkingContent):
            block = MessageThinkingContent()
            self._assistant_message.content[index] = block
        return block
