import unittest

from setta.llm.chat_toolkit.tool_calls import ToolCallAccumulator, ToolCallBuilder


class ToolCallAccumulatorTests(unittest.TestCase):
    def test_accumulates_and_orders_calls(self) -> None:
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value":',
            tool_name="setta__one",
        )
        accumulator.apply_delta(
            tool_call_id="call-2",
            arguments_delta='{"flag": true}',
            tool_name="setta__two",
        )
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='"ok"}',
        )

        calls = accumulator.finalize()

        self.assertEqual([call.id for call in calls], ["call-1", "call-2"])
        self.assertEqual(calls[0].function.arguments, {"value": "ok"})
        self.assertEqual(calls[1].function.arguments, {"flag": True})

    def test_finalize_handles_invalid_json(self) -> None:
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value":',
            tool_name="setta__one",
        )

        calls = accumulator.finalize()

        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0].function.arguments, {})

    def test_builder_parses_dict_and_json_string(self) -> None:
        built = ToolCallBuilder.from_name_and_args(
            name="setta__alpha",
            arguments={"value": "ok"},
            tool_call_id="call-1",
        )
        self.assertEqual(built.function.arguments, {"value": "ok"})
        self.assertEqual(built.function.name, "setta__alpha")

        built = ToolCallBuilder.from_name_and_args(
            name="setta__beta",
            arguments='{"flag": true}',
            tool_call_id="call-2",
        )
        self.assertEqual(built.function.arguments, {"flag": True})
        self.assertEqual(built.function.name, "setta__beta")


if __name__ == "__main__":
    unittest.main()
