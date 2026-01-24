import unittest

from setta.llm.chat_toolkit.managed.stream_assembler import (
    ManagedStreamAssembler,
    StreamContentEntry,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    MessageThinkingContent,
)
from setta.types.chat_stream_events import MessageThinkingDelta


class ManagedStreamAssemblerTests(unittest.TestCase):
    def test_missing_index_extends_same_kind(self) -> None:
        assistant = AssistantChatMessage(content=[MessageTextContent(text="Hello")])
        assembler = ManagedStreamAssembler(assistant)

        deltas = assembler.apply_entries(
            [StreamContentEntry(kind="text", text=" world", index=None)]
        )

        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0].index, 0)
        self.assertEqual(assistant.content[0].text, "Hello world")

    def test_missing_index_appends_new_kind(self) -> None:
        assistant = AssistantChatMessage(content=[MessageTextContent(text="Hello")])
        assembler = ManagedStreamAssembler(assistant)

        deltas = assembler.apply_entries(
            [StreamContentEntry(kind="thinking", text="hmm", index=None)]
        )

        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0].index, 1)
        self.assertEqual(len(assistant.content), 2)
        self.assertIsInstance(assistant.content[1], MessageThinkingContent)

    def test_explicit_index_creates_blocks(self) -> None:
        assistant = AssistantChatMessage(content=[])
        assembler = ManagedStreamAssembler(assistant)

        deltas = assembler.apply_entries(
            [StreamContentEntry(kind="text", text="A", index=2)]
        )

        self.assertEqual(len(deltas), 1)
        self.assertEqual(deltas[0].index, 2)
        self.assertEqual(len(assistant.content), 3)
        self.assertIsInstance(assistant.content[0], MessageTextContent)
        self.assertIsInstance(assistant.content[1], MessageTextContent)
        self.assertEqual(assistant.content[2].text, "A")

    def test_thinking_summary_emits_delta(self) -> None:
        assistant = AssistantChatMessage(content=[])
        assembler = ManagedStreamAssembler(assistant)

        deltas = assembler.apply_entries(
            [
                StreamContentEntry(
                    kind="thinking",
                    text="",
                    index=None,
                    summary="Summary line",
                )
            ]
        )

        self.assertEqual(len(deltas), 1)
        self.assertIsInstance(deltas[0], MessageThinkingDelta)
        if isinstance(deltas[0], MessageThinkingDelta):
            self.assertEqual(deltas[0].summary, "Summary line")
        self.assertEqual(len(assistant.content), 1)
        self.assertIsInstance(assistant.content[0], MessageThinkingContent)
        if isinstance(assistant.content[0], MessageThinkingContent):
            self.assertEqual(assistant.content[0].summary, "Summary line")


if __name__ == "__main__":
    unittest.main()
