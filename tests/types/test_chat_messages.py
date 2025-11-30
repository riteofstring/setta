import json
import unittest

from setta.types.chat_messages import AssistantChatMessage, MessageTextContent, ToolCall, ToolCallFunction


class AssistantChatMessageTests(unittest.TestCase):
    def test_to_openai_format_without_tool_calls(self) -> None:
        message = AssistantChatMessage(
            content=[MessageTextContent(type="text", text="hi")],
            tool_calls=None,
        )

        payload = message.to_openai_format()

        self.assertNotIn("tool_calls", payload)
        self.assertEqual(payload["content"], [{"type": "text", "text": "hi"}])

    def test_to_openai_format_serializes_tool_call_arguments(self) -> None:
        tool_call = ToolCall(function=ToolCallFunction(name="some_tool", arguments={"a": 1}))
        message = AssistantChatMessage(
            content=[MessageTextContent(type="text", text="result")],
            tool_calls=[tool_call],
        )

        payload = message.to_openai_format()

        self.assertIn("tool_calls", payload)
        serialized = payload["tool_calls"][0]["function"]["arguments"]
        self.assertEqual(serialized, json.dumps({"a": 1}))


if __name__ == "__main__":
    unittest.main()
