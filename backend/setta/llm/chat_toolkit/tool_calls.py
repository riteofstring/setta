import json

from setta.types.chat_messages import ToolCall, ToolCallFunction


class ToolCallBuilder:
    @staticmethod
    def from_name_and_args(
        *,
        name: str,
        arguments: dict | str | None = None,
        tool_call_id: str | None = None,
    ) -> ToolCall:
        parsed_arguments: dict = {}
        if isinstance(arguments, dict):
            parsed_arguments = dict(arguments)
        elif isinstance(arguments, str) and arguments.strip():
            parsed_arguments = json.loads(arguments)
        function = ToolCallFunction(name=name, arguments=parsed_arguments)
        if tool_call_id is None:
            return ToolCall(function=function)
        return ToolCall(id=tool_call_id, function=function)


class ToolCallAccumulator:
    def __init__(self) -> None:
        self._argument_buffers: dict[str, str] = {}
        self._tool_calls: dict[str, ToolCall] = {}
        self._order: list[str] = []

    def add_tool_call(self, tool_call: ToolCall) -> ToolCall:
        if tool_call.id not in self._tool_calls:
            self._tool_calls[tool_call.id] = tool_call
            self._order.append(tool_call.id)
            return tool_call
        existing = self._tool_calls[tool_call.id]
        if tool_call.function.name:
            existing.function.name = tool_call.function.name
        if tool_call.function.arguments:
            existing.function.arguments = dict(tool_call.function.arguments)
        return existing

    def apply_delta(
        self,
        *,
        tool_call_id: str,
        arguments_delta: str,
        tool_name: str | None = None,
    ) -> ToolCall:
        if not tool_call_id:
            raise ValueError("tool_call_id must be non-empty")
        if tool_call_id not in self._tool_calls:
            tool_call = ToolCall(
                id=tool_call_id,
                function=ToolCallFunction(
                    name=tool_name or "",
                    arguments={},
                ),
            )
            self._tool_calls[tool_call_id] = tool_call
            self._order.append(tool_call_id)
        tool_call = self._tool_calls[tool_call_id]
        if tool_name:
            tool_call.function.name = tool_name
        buffer = self._argument_buffers.get(tool_call_id, "")
        self._argument_buffers[tool_call_id] = buffer + arguments_delta
        return tool_call

    def tool_calls(self) -> list[ToolCall]:
        return [self._tool_calls[tool_call_id] for tool_call_id in self._order]

    def finalize(self) -> list[ToolCall]:
        calls = self.tool_calls()
        for tool_call in calls:
            buffer = self._argument_buffers.get(tool_call.id, "")
            if buffer:
                tool_call.function.arguments = json.loads(buffer)
        return calls
