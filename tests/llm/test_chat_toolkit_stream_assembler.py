import unittest

from setta.llm.chat_toolkit import ChatStreamAssembler


class ChatStreamAssemblerTests(unittest.TestCase):
    def test_text_and_tool_call_deltas(self) -> None:
        assembler = ChatStreamAssembler()
        builder = assembler.start_assistant_message(message_id="assistant-1")

        builder.append_text("Hello")
        builder.apply_tool_call_delta(
            tool_call_id="tool-1",
            arguments_delta='{"query":',
            tool_name="setta__search",
        )
        builder.apply_tool_call_delta(
            tool_call_id="tool-1",
            arguments_delta='"test"}',
        )

        message = builder.finalize()

        self.assertEqual(message.id, "assistant-1")
        self.assertEqual(message.content[0].text, "Hello")
        self.assertIsNotNone(message.tool_calls)
        tool_call = message.tool_calls[0]
        self.assertEqual(tool_call.id, "tool-1")
        self.assertEqual(tool_call.function.name, "setta__search")
        self.assertEqual(tool_call.function.arguments, {"query": "test"})
