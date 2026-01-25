import json
import unittest

from setta.agentic.external_adapters.opencode_sdk import _OpenCodeSdkEventParser
from setta.llm.chat_toolkit.section_sync import (
    apply_stream_delta,
    build_chat_section_state,
)
from setta.types.chat_messages import AssistantChatMessage
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)


class OpenCodeSdkEventParserTests(unittest.TestCase):
    def test_text_part_updates_emit_message_delta(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-1",
                        "role": "assistant",
                        "sessionID": "sess-1",
                        "time": {"created": 1},
                    }
                },
            }
        )
        payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "text",
                    "sessionID": "sess-1",
                    "messageID": "msg-1",
                    "text": "Hello",
                },
                "delta": "Hello",
            },
        }
        events = parser.handle(payload)
        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        start_event = events[0].stream_chunk
        delta_event = events[1].stream_chunk
        if isinstance(start_event, MessageStartEvent) and isinstance(
            delta_event, MessageDeltaEvent
        ):
            start_text = ""
            if start_event.message.content:
                first = start_event.message.content[0]
                if hasattr(first, "text") and isinstance(first.text, str):
                    start_text = first.text
            delta_text = ""
            if delta_event.content:
                delta = delta_event.content[0]
                if hasattr(delta, "text") and isinstance(delta.text, str):
                    delta_text = delta.text
            self.assertEqual(start_text, "")
            self.assertEqual(delta_text, "Hello")

    def test_reasoning_part_updates_emit_thinking_delta(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-2",
                        "role": "assistant",
                        "sessionID": "sess-2",
                        "time": {"created": 1},
                    }
                },
            }
        )
        payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "reasoning",
                    "sessionID": "sess-2",
                    "messageID": "msg-2",
                    "text": "Thinking",
                },
                "delta": "Thinking",
            },
        }
        events = parser.handle(payload)
        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageDeltaEvent)
        chunk = events[1].stream_chunk
        if isinstance(chunk, MessageDeltaEvent):
            self.assertIsNotNone(chunk.content)
            if chunk.content:
                self.assertEqual(chunk.content[0].type, "thinking_delta")

    def test_tool_part_emits_tool_call_and_result(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-3",
                        "role": "assistant",
                        "sessionID": "sess-3",
                        "time": {"created": 1},
                    }
                },
            }
        )
        pending_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "tool",
                    "sessionID": "sess-3",
                    "messageID": "msg-3",
                    "callID": "call-1",
                    "tool": "bash",
                    "state": {
                        "status": "pending",
                        "input": {"command": "echo hi"},
                        "raw": "echo hi",
                    },
                }
            },
        }
        events = parser.handle(pending_payload)
        self.assertTrue(
            any(isinstance(event.stream_chunk, ToolCallDeltaEvent) for event in events)
        )
        completed_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "tool",
                    "sessionID": "sess-3",
                    "messageID": "msg-3",
                    "callID": "call-1",
                    "tool": "bash",
                    "state": {
                        "status": "completed",
                        "input": {"command": "echo hi"},
                        "output": "done",
                        "title": "bash",
                        "metadata": {},
                        "time": {"start": 1, "end": 2},
                    },
                }
            },
        }
        events = parser.handle(completed_payload)
        tool_results = [
            event.stream_chunk
            for event in events
            if isinstance(event.stream_chunk, ToolResultEvent)
        ]
        self.assertEqual(len(tool_results), 1)
        result = tool_results[0].result
        self.assertEqual(result.tool_call_id, "call-1")
        self.assertEqual(result.tool_name, "bash")
        self.assertEqual(result.result, "done")
        self.assertFalse(result.is_error)

    def test_message_updated_emits_finalization(self) -> None:
        parser = _OpenCodeSdkEventParser()
        message_updated = {
            "type": "message.updated",
            "properties": {
                "info": {
                    "id": "msg-4",
                    "role": "assistant",
                    "sessionID": "sess-4",
                    "time": {"completed": 123},
                }
            },
        }
        events = parser.handle(message_updated)
        self.assertEqual(len(events), 3)
        self.assertIsInstance(events[0].stream_chunk, MessageStartEvent)
        self.assertIsInstance(events[1].stream_chunk, MessageStopEvent)
        self.assertIsInstance(events[2].stream_chunk, MessageFinalizedEvent)

    def test_tool_arguments_delta_uses_json(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-5",
                        "role": "assistant",
                        "sessionID": "sess-5",
                        "time": {"created": 1},
                    }
                },
            }
        )
        payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "tool",
                    "sessionID": "sess-5",
                    "messageID": "msg-5",
                    "callID": "call-2",
                    "tool": "bash",
                    "state": {
                        "status": "pending",
                        "input": {"command": "echo hi"},
                        "raw": "echo hi",
                    },
                }
            },
        }
        events = parser.handle(payload)
        tool_calls = [
            event.stream_chunk
            for event in events
            if isinstance(event.stream_chunk, ToolCallDeltaEvent)
        ]
        self.assertEqual(len(tool_calls), 1)
        arguments_delta = tool_calls[0].arguments_delta
        parsed = json.loads(arguments_delta)
        self.assertEqual(parsed.get("command"), "echo hi")

    def test_mixed_text_and_reasoning_do_not_clobber(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-6",
                        "role": "assistant",
                        "sessionID": "sess-6",
                        "time": {"created": 1},
                    }
                },
            }
        )
        text_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "text",
                    "sessionID": "sess-6",
                    "messageID": "msg-6",
                    "text": "Hello",
                },
                "delta": "Hello",
            },
        }
        reasoning_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "type": "reasoning",
                    "sessionID": "sess-6",
                    "messageID": "msg-6",
                    "text": "Thinking",
                },
                "delta": "Thinking",
            },
        }
        events = parser.handle(text_payload) + parser.handle(reasoning_payload)
        state = build_chat_section_state(messages=[])
        for event in events:
            if event.stream_chunk is None:
                continue
            state = apply_stream_delta(state=state, chunk=event.stream_chunk)
        message = next(
            (
                entry
                for entry in state.messages
                if isinstance(entry, AssistantChatMessage)
                and entry.id == "msg-6"
            ),
            None,
        )
        self.assertIsNotNone(message)
        if isinstance(message, AssistantChatMessage):
            content_types = [entry.type for entry in message.content]
            self.assertIn("text", content_types)
            self.assertIn("thinking", content_types)

    def test_text_part_snapshot_does_not_duplicate(self) -> None:
        parser = _OpenCodeSdkEventParser()
        parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-6",
                        "role": "assistant",
                        "sessionID": "sess-6",
                        "time": {"created": 1},
                    }
                },
            }
        )
        delta_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "id": "prt-6",
                    "sessionID": "sess-6",
                    "messageID": "msg-6",
                    "type": "text",
                    "text": "Hello",
                },
                "delta": "Hello",
            },
        }
        parser.handle(delta_payload)
        snapshot_payload = {
            "type": "message.part.updated",
            "properties": {
                "part": {
                    "id": "prt-6",
                    "sessionID": "sess-6",
                    "messageID": "msg-6",
                    "type": "text",
                    "text": "Hello",
                }
            },
        }
        parser.handle(snapshot_payload)
        final_events = parser.handle(
            {
                "type": "message.updated",
                "properties": {
                    "info": {
                        "id": "msg-6",
                        "role": "assistant",
                        "sessionID": "sess-6",
                        "time": {"completed": 2},
                    }
                },
            }
        )
        finalized = [
            event.stream_chunk
            for event in final_events
            if isinstance(event.stream_chunk, MessageFinalizedEvent)
        ]
        self.assertEqual(len(finalized), 1)
        message = finalized[0].message
        text = ""
        if message.content:
            first = message.content[0]
            if hasattr(first, "text") and isinstance(first.text, str):
                text = first.text
        self.assertEqual(text, "Hello")
