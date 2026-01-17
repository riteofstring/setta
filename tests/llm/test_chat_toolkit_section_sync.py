import unittest

from setta.llm.chat_toolkit.section_sync import apply_stream_delta, build_chat_section_state
from setta.mcp.tool_metadata import ToolArgumentPreviewKind
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageTextDelta,
    ToolArgumentPreviewDeltaEvent,
    ToolCallDeltaEvent,
    ToolResultEvent,
)


class ChatSectionSyncTests(unittest.TestCase):
    def test_message_start_and_text_delta(self) -> None:
        state = build_chat_section_state(messages=[], input_text="draft")
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(text="")],
        )

        started = apply_stream_delta(
            state=state,
            chunk=MessageStartEvent(message=assistant),
        )

        self.assertTrue(started.waitingForResponse)
        self.assertEqual(started.inputText, "draft")
        self.assertEqual(started.messages[0].id, "assistant-1")

        delta = MessageDeltaEvent(
            message_id="assistant-1",
            content=[MessageTextDelta(index=0, text="Hello")],
        )
        updated = apply_stream_delta(state=started, chunk=delta)

        assistant_message = updated.messages[0]
        self.assertIsInstance(assistant_message, AssistantChatMessage)
        self.assertEqual(assistant_message.content[0].text, "Hello")

    def test_tool_call_and_preview_deltas_update_arguments(self) -> None:
        state = build_chat_section_state(messages=[])
        tool_delta = ToolCallDeltaEvent(
            message_id="assistant-1",
            tool_call_id="tool-1",
            arguments_delta='{"value":',
            tool_name="setta__tool",
        )
        updated = apply_stream_delta(state=state, chunk=tool_delta)

        self.assertIn("tool-1", updated.toolCallArguments)
        self.assertEqual(updated.toolCallArguments["tool-1"], '{"value":')

        preview_delta = ToolArgumentPreviewDeltaEvent(
            message_id="assistant-1",
            tool_call_id="tool-1",
            tool_name="setta__tool",
            arguments_delta='"ok"}',
            preview_kind=ToolArgumentPreviewKind.code,
            target_ids_by_type={"section": []},
            preview_value_delta="ok",
        )
        updated = apply_stream_delta(state=updated, chunk=preview_delta)

        self.assertEqual(updated.toolCallArguments["tool-1"], '{"value":"ok"}')

    def test_tool_result_and_finalized_clear_waiting_state(self) -> None:
        assistant = AssistantChatMessage(
            id="assistant-1",
            content=[MessageTextContent(text="Hello")],
        )
        state = build_chat_section_state(
            messages=[assistant],
            waiting_for_response=True,
            tool_call_arguments={"tool-1": "{}"},
        )
        tool_message = ToolChatMessage(
            id="tool-message-1",
            tool_call_id="tool-1",
            tool_name="setta__tool",
            arguments={},
            content=[],
            is_error=False,
            result={},
        )
        updated = apply_stream_delta(
            state=state,
            chunk=ToolResultEvent(result=tool_message),
        )

        self.assertEqual(len(updated.messages), 2)
        self.assertTrue(updated.waitingForResponse)

        finalized = apply_stream_delta(
            state=updated,
            chunk=MessageFinalizedEvent(message=assistant),
        )

        self.assertFalse(finalized.waitingForResponse)
        self.assertEqual(finalized.toolCallArguments, {})


if __name__ == "__main__":
    unittest.main()
