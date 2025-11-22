import tempfile
import unittest
from pathlib import Path

from setta.database.db_objs import DBE
from setta.llm import LLMConfig, LLMProviderConfig
from setta.llm.portkey_adapter import (
    build_portkey_payload,
    events_from_chunk,
)
from setta.llm.models import (
    LLMHistory,
    LLMMessage,
    LLMRole,
    ResponseCompletedEvent,
    TextDeltaEvent,
    ToolCallDeltaEvent,
)
from setta.mcp.chat_manager import ChatManager


class ChatManagerSimplificationTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.dbe = DBE(Path(self._tmpdir.name))
        self.llm_config = LLMConfig(
            providers=[
                LLMProviderConfig(
                    provider_id="openai",
                    display_name="OpenAI",
                )
            ]
        )
        self.manager = ChatManager(
            self.dbe,
            mcp_client=None,  # Not used by the payload builder.
            wmh_frontend_sender=None,  # Not used by the payload builder.
            llm_config=self.llm_config,
        )

    def test_build_portkey_payload_minimal_fields(self) -> None:
        history = LLMHistory(
            messages=[LLMMessage(message_id="m1", role=LLMRole.USER, content=[])]
        )
        payload = build_portkey_payload(
            history=history,
            model="gpt-4o",
            tools=None,
            request_params=None,
            extra_headers=None,
            provider_id="openai",
        )
        self.assertEqual(
            payload,
            {
                "model": "gpt-4o",
                "messages": [{"role": "user", "content": []}],
                "stream": True,
                "provider": "openai",
            },
        )

    def test_chunk_adapter_handles_openai_text_and_finish_reason(self) -> None:
        chunk = {
            "choices": [
                {
                    "delta": {"content": [{"text": "hello"}]},
                    "finish_reason": "stop",
                }
            ]
        }
        events = events_from_chunk(chunk, response_message_id="resp-1")
        self.assertEqual(len(events), 2)
        self.assertIsInstance(events[0], TextDeltaEvent)
        self.assertEqual(events[0].delta, "hello")
        self.assertIsNone(events[0].stream_target)
        self.assertIsInstance(events[1], ResponseCompletedEvent)
        self.assertEqual(events[1].finish_reason, "stop")

    def test_chunk_adapter_handles_string_content(self) -> None:
        chunk = {
            "choices": [
                {
                    "delta": {
                        "content": {
                            "text": "streamed",
                            "stream_target": "analysis",
                        }
                    }
                }
            ]
        }
        events = events_from_chunk(chunk, response_message_id="resp-2")
        self.assertEqual(len(events), 1)
        text_event = events[0]
        self.assertIsInstance(text_event, TextDeltaEvent)
        self.assertEqual(text_event.delta, "streamed")
        self.assertEqual(text_event.stream_target, "analysis")

    def test_chunk_adapter_emits_response_completed_event(self) -> None:
        chunk = {"type": "response.completed", "finish_reason": "length"}
        events = events_from_chunk(chunk, response_message_id="resp-3")
        self.assertEqual(len(events), 1)
        completed = events[0]
        self.assertIsInstance(completed, ResponseCompletedEvent)
        self.assertEqual(completed.finish_reason, "length")

    def test_chunk_adapter_maps_tool_call_deltas(self) -> None:
        chunk = {
            "choices": [
                {
                    "delta": {
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "function": {
                                    "name": "my_tool",
                                    "arguments": '{"foo": 1}',
                                },
                            }
                        ]
                    }
                }
            ]
        }
        events = events_from_chunk(chunk, response_message_id="resp-4")
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertIsInstance(event, ToolCallDeltaEvent)
        self.assertEqual(event.tool_call_id, "call_1")
        self.assertEqual(event.arguments_delta, '{"foo": 1}')
        self.assertEqual(event.name, "my_tool")


if __name__ == "__main__":
    unittest.main()
