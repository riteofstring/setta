from litellm.types.utils import ChatCompletionDeltaToolCall, Function
import pytest

from setta.llm.chat_toolkit.managed.tool_calls import ManagedToolCallAccumulator
from setta.types.chat_messages import AssistantChatMessage


class TestManagedToolCallAccumulator:
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

        assert assistant.tool_calls is not None
        assert len(assistant.tool_calls) == 2
        assert assistant.tool_calls[1].id == "tool-call-2"
        assert assistant.tool_calls[1].function.name == "setta__run_tool"

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

        assert len(parsed) == 1
        assert "tool-call-1" in failures
        assert parsed[0].function.arguments == {}

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

        assert len(parsed) == 1
        assert failures == {}
        assert parsed[0].function.arguments == {"value": "ok"}

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

        assert failures == {}
        assert parsed[0].function.arguments == {"value": "ok"}

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

        with pytest.raises(ValueError):
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
