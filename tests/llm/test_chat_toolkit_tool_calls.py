from setta.llm.chat_toolkit.tool_calls import ToolCallAccumulator, ToolCallBuilder


class TestToolCallAccumulator:
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

        assert [call.id for call in calls] == ["call-1", "call-2"]
        assert calls[0].function.arguments == {"value": "ok"}
        assert calls[1].function.arguments == {"flag": True}

    def test_finalize_handles_invalid_json(self) -> None:
        accumulator = ToolCallAccumulator()
        accumulator.apply_delta(
            tool_call_id="call-1",
            arguments_delta='{"value":',
            tool_name="setta__one",
        )

        calls = accumulator.finalize()

        assert len(calls) == 1
        assert calls[0].function.arguments == {}

    def test_builder_parses_dict_and_json_string(self) -> None:
        built = ToolCallBuilder.from_name_and_args(
            name="setta__alpha",
            arguments={"value": "ok"},
            tool_call_id="call-1",
        )
        assert built.function.arguments == {"value": "ok"}
        assert built.function.name == "setta__alpha"

        built = ToolCallBuilder.from_name_and_args(
            name="setta__beta",
            arguments='{"flag": true}',
            tool_call_id="call-2",
        )
        assert built.function.arguments == {"flag": True}
        assert built.function.name == "setta__beta"
