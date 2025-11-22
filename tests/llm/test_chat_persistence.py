import tempfile
import unittest
from pathlib import Path

from setta.database.db_objs import DBE
from setta.llm.config_store import LLMConfig
from setta.llm.models import (
    LLMMessage,
    LLMRole,
    LLMTextBlock,
    LLMToolCallBlock,
    LLMToolResultBlock,
    ToolCallDeltaEvent,
)
from setta.mcp.chat_manager import (
    ChatManager,
    _PendingToolCall,
    _StreamingTranscriptRecorder,
)
from setta.types.chat_messages import (
    Chat,
    ChatMessage,
    ChatStreamStatus,
    LLMModelSelection,
)


class ChatPersistenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmpdir.cleanup)
        self.dbe = DBE(Path(self._tmpdir.name))

    def test_llm_message_round_trip_serialization(self) -> None:
        message = LLMMessage(
            message_id="msg-1",
            role=LLMRole.ASSISTANT,
            content=[
                LLMTextBlock(text="hello", stream_target="analysis"),
                LLMToolCallBlock(
                    tool_call_id="call-1",
                    name="my_tool",
                    arguments_text='{"foo": 1}',
                ),
                LLMToolResultBlock(
                    tool_call_id="call-1",
                    name="my_tool",
                    output_text="done",
                    output_json={"foo": 1},
                    is_error=False,
                ),
            ],
            name="assistant-name",
            metadata={"source": "test"},
        )

        serialized = message.to_dict()
        restored = LLMMessage.from_dict(serialized)

        self.assertEqual(restored.message_id, message.message_id)
        self.assertEqual(restored.role, LLMRole.ASSISTANT)
        self.assertEqual(len(restored.content), 3)
        self.assertEqual(restored.content[0].text, "hello")
        self.assertEqual(restored.content[0].stream_target, "analysis")
        tool_result = restored.content[2]
        self.assertIsInstance(tool_result, LLMToolResultBlock)
        self.assertFalse(tool_result.is_error)

    def test_pending_tool_call_validates_arguments_json(self) -> None:
        call = _PendingToolCall(tool_call_id="call-1")
        call.add_delta(
            ToolCallDeltaEvent(
                tool_call_id="call-1",
                arguments_delta='{"foo": ',
                name="my_tool",
            )
        )
        call.add_delta(
            ToolCallDeltaEvent(
                tool_call_id="call-1",
                arguments_delta='"bar"}',
                name=None,
            )
        )

        args = call.to_arguments_dict()

        self.assertEqual(args, {"foo": "bar"})
        self.assertEqual(call.name, "my_tool")

        invalid = _PendingToolCall(tool_call_id="call-2")
        invalid.add_delta(
            ToolCallDeltaEvent(
                tool_call_id="call-2",
                arguments_delta="{not json",
                name="broken",
            )
        )
        with self.assertRaises(ValueError):
            invalid.to_arguments_dict()

        scalar = _PendingToolCall(tool_call_id="call-3")
        scalar.add_delta(
            ToolCallDeltaEvent(
                tool_call_id="call-3",
                arguments_delta='"foo"',
                name="broken",
            )
        )
        with self.assertRaises(TypeError):
            scalar.to_arguments_dict()

    def test_chat_round_trip_preserves_selection_and_status(self) -> None:
        chat = Chat(
            name="Session",
            projectConfigId="proj-1",
            modelSelection=LLMModelSelection(providerId="openai", modelId="gpt-4o"),
            streamStatus=ChatStreamStatus.STREAMING,
        )
        chat.add_message(
            ChatMessage(
                role=LLMRole.USER,
                content=[LLMTextBlock(text="hi")],
            )
        )
        chat.add_message(
            ChatMessage(
                role=LLMRole.ASSISTANT,
                content=[
                    LLMToolResultBlock(
                        tool_call_id="call-1",
                        name="tool",
                        output_text="ok",
                        is_error=False,
                    )
                ],
            )
        )

        payload = chat.model_dump(mode="json")
        restored = Chat.model_validate(payload)

        self.assertEqual(restored.projectConfigId, "proj-1")
        self.assertEqual(restored.modelSelection.providerId, "openai")
        self.assertEqual(restored.modelSelection.modelId, "gpt-4o")
        self.assertEqual(restored.streamStatus, ChatStreamStatus.STREAMING)
        self.assertEqual(restored.messages[1].content[0].type, "tool_result")

    def test_streaming_recorder_persists_assistant_snapshot(self) -> None:
        manager = ChatManager(
            self.dbe,
            mcp_client=None,
            wmh_frontend_sender=None,
            llm_config=LLMConfig(),
        )
        chat = Chat(
            name="Hello",
            modelSelection=LLMModelSelection(providerId="openai", modelId="gpt-4o"),
        )
        chat.add_message(
            ChatMessage(
                role=LLMRole.USER,
                content=[LLMTextBlock(text="ping")],
            )
        )
        recorder = _StreamingTranscriptRecorder(
            chat=chat,
            persist_chat=manager._persist_chat,
        )
        assistant_message = LLMMessage(
            message_id="assistant-1",
            role=LLMRole.ASSISTANT,
            content=[LLMTextBlock(text="partial")],
        )

        recorder.persist_snapshot(assistant_message)

        payload = self.dbe.read_chat(chat.id)
        self.assertIsNotNone(payload)
        persisted = Chat.model_validate(payload)
        self.assertEqual(persisted.messages[-1].role, LLMRole.ASSISTANT)
        self.assertEqual(
            persisted.messages[-1].content[0].text,
            "partial",
        )


if __name__ == "__main__":
    unittest.main()
