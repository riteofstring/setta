import json
from dataclasses import dataclass, field
from typing import Any

from litellm.types.utils import ChatCompletionDeltaToolCall

from setta.types.chat_messages import AssistantChatMessage, ToolCall, ToolCallFunction
from setta.types.chat_stream_events import ToolCallDeltaEvent


@dataclass
class ManagedToolCallState:
    argument_buffers: dict[int, str] = field(default_factory=dict)


class ManagedToolCallAccumulator:
    def __init__(
        self,
        assistant_message: AssistantChatMessage,
        state: ManagedToolCallState | None = None,
    ) -> None:
        self._assistant_message = assistant_message
        self._state = state or ManagedToolCallState()

    @property
    def state(self) -> ManagedToolCallState:
        return self._state

    def apply_delta(
        self,
        entry: ChatCompletionDeltaToolCall,
    ) -> ToolCallDeltaEvent | None:
        index = entry.index
        if index < 0:
            raise IndexError

        tool_call = self._ensure_tool_call_entry(index)
        if entry.id:
            tool_call.id = entry.id
        if entry.function.name:
            tool_call.function.name = entry.function.name

        buffer = self._state.argument_buffers.get(index, "")
        buffer += entry.function.arguments
        self._state.argument_buffers[index] = buffer

        tool_name = tool_call.function.name.strip() or None
        return ToolCallDeltaEvent(
            message_id=self._assistant_message.id,
            tool_call_id=tool_call.id,
            arguments_delta=entry.function.arguments,
            tool_name=tool_name,
        )

    def finalize(self) -> tuple[list[ToolCall], dict[str, Exception]]:
        if not self._assistant_message.tool_calls:
            return [], {}
        parsed_tool_calls: list[ToolCall] = []
        failures: dict[str, Exception] = {}
        for index, tool_call in enumerate(self._assistant_message.tool_calls):
            raw_arguments = self._state.argument_buffers.get(index)
            if not raw_arguments:
                continue
            parsed, error = parse_tool_call_arguments(raw_arguments)
            if error is not None:
                failures[tool_call.id] = error
            tool_call.function.arguments = parsed
            parsed_tool_calls.append(tool_call)
        return parsed_tool_calls, failures

    def _ensure_tool_call_entry(self, index: int) -> ToolCall:
        if self._assistant_message.tool_calls is None:
            self._assistant_message.tool_calls = []
        while len(self._assistant_message.tool_calls) <= index:
            self._assistant_message.tool_calls.append(
                ToolCall(
                    function=ToolCallFunction(
                        name="",
                        arguments={},
                    )
                )
            )
        return self._assistant_message.tool_calls[index]


def parse_tool_call_arguments(
    arguments: str,
) -> tuple[dict[str, Any], Exception | None]:
    data = arguments.strip()
    if not data:
        return {}, None
    try:
        return json.loads(data), None
    except json.JSONDecodeError as exc:
        return {}, exc
