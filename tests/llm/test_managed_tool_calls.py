import unittest

from litellm.types.utils import ChatCompletionDeltaToolCall, Function

from setta.llm.chat_toolkit.managed.tool_calls import ManagedToolCallAccumulator
from setta.types.chat_messages import AssistantChatMessage


class ManagedToolCallAccumulatorTests(unittest.TestCase):
    def test_accumulates_by_index(self) -> None:
        assistant = AssistantChatMessage(content=[])
        accumulator = ManagedToolCallAccumulator(assistant)

        accumulator.apply_delta(
            ChatCompletionDeltaToolCall(
                index=1,
                id="tool-call-2",
                type="function",
                function=Function(
                    name="setta__run_tool",
                    arguments='{"value": ',
                ),
            )
        )

        self.assertIsNotNone(assistant.tool_calls)
        self.assertEqual(len(assistant.tool_calls), 2)
        self.assertEqual(assistant.tool_calls[1].id, "tool-call-2")
        self.assertEqual(assistant.tool_calls[1].function.name, "setta__run_tool")

    def test_finalize_parses_arguments_leniently(self) -> None:
        assistant = AssistantChatMessage(content=[])
        accumulator = ManagedToolCallAccumulator(assistant)

        accumulator.apply_delta(
            ChatCompletionDeltaToolCall(
                index=0,
                id="tool-call-1",
                type="function",
                function=Function(
                    name="setta__run_tool",
                    arguments='{"value": ',
                ),
            )
        )

        parsed, failures = accumulator.finalize()

        self.assertEqual(len(parsed), 1)
        self.assertIn("tool-call-1", failures)
        self.assertEqual(parsed[0].function.arguments, {})

    def test_finalize_merges_argument_deltas(self) -> None:
        assistant = AssistantChatMessage(content=[])
        accumulator = ManagedToolCallAccumulator(assistant)

        accumulator.apply_delta(
            ChatCompletionDeltaToolCall(
                index=0,
                id="tool-call-1",
                type="function",
                function=Function(
                    name="setta__run_tool",
                    arguments='{"value": ',
                ),
            )
        )
        accumulator.apply_delta(
            ChatCompletionDeltaToolCall(
                index=0,
                id="tool-call-1",
                type="function",
                function=Function(
                    name="setta__run_tool",
                    arguments='"ok"}',
                ),
            )
        )

        parsed, failures = accumulator.finalize()

        self.assertEqual(len(parsed), 1)
        self.assertEqual(failures, {})
        self.assertEqual(parsed[0].function.arguments, {"value": "ok"})

    def test_accepts_non_string_arguments_as_full_payload(self) -> None:
        assistant = AssistantChatMessage(content=[])
        accumulator = ManagedToolCallAccumulator(assistant)

        entry = ChatCompletionDeltaToolCall(
            index=0,
            id="tool-call-1",
            type="function",
            function=Function(
                name="setta__run_tool",
                arguments=None,
            ),
        )
        entry.function.arguments = {"value": "ok"}
        accumulator.apply_delta(entry)

        parsed, failures = accumulator.finalize()

        self.assertEqual(failures, {})
        self.assertEqual(parsed[0].function.arguments, {"value": "ok"})

    def test_rejects_deltas_after_full_payload(self) -> None:
        assistant = AssistantChatMessage(content=[])
        accumulator = ManagedToolCallAccumulator(assistant)

        entry = ChatCompletionDeltaToolCall(
            index=0,
            id="tool-call-1",
            type="function",
            function=Function(
                name="setta__run_tool",
                arguments=None,
            ),
        )
        entry.function.arguments = {"value": "ok"}
        accumulator.apply_delta(entry)

        with self.assertRaises(ValueError):
            accumulator.apply_delta(
                ChatCompletionDeltaToolCall(
                    index=0,
                    id="tool-call-1",
                    type="function",
                    function=Function(
                        name="setta__run_tool",
                        arguments='{"value": "later"}',
                    ),
                )
            )


if __name__ == "__main__":
    unittest.main()
