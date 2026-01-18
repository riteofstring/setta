import unittest

from setta.agentic.external_adapters.codex_cli import _CodexCliEventParser
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
)


class CodexCliAdapterParserTests(unittest.TestCase):
    def test_item_start_emits_message_start(self) -> None:
        parser = _CodexCliEventParser()
        events = parser.handle({"type": "item.start", "item": {"id": "msg-1"}})

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageStartEvent)
        if isinstance(chunk, MessageStartEvent):
            self.assertEqual(chunk.message.id, "msg-1")

    def test_item_delta_emits_message_delta(self) -> None:
        parser = _CodexCliEventParser()
        parser.handle({"type": "item.start", "item": {"id": "msg-2"}})
        events = parser.handle(
            {"type": "item.delta", "item": {"id": "msg-2"}, "delta": "Hello"}
        )

        self.assertEqual(len(events), 1)
        chunk = events[0].stream_chunk
        self.assertIsInstance(chunk, MessageDeltaEvent)
        if isinstance(chunk, MessageDeltaEvent):
            self.assertEqual(chunk.message_id, "msg-2")
            self.assertEqual(chunk.content[0].text, "Hello")

    def test_item_complete_emits_stop_and_finalize(self) -> None:
        parser = _CodexCliEventParser()
        parser.handle({"type": "item.start", "item": {"id": "msg-3"}})
        parser.handle(
            {"type": "item.delta", "item": {"id": "msg-3"}, "delta": "Hi"}
        )
        events = parser.handle({"type": "item.complete", "item": {"id": "msg-3"}})

        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageFinalizedEvent)
