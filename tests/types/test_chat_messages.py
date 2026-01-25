import json

from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
)


def test_to_openai_format_without_tool_calls() -> None:
    message = AssistantChatMessage(
        content=[MessageTextContent(type="text", text="hi")],
        tool_calls=None,
    )

    payload = message.to_openai_format()

    assert "tool_calls" not in payload
    assert payload["content"] == [{"type": "text", "text": "hi"}]


def test_to_openai_format_serializes_tool_call_arguments() -> None:
    tool_call = ToolCall(
        function=ToolCallFunction(name="some_tool", arguments={"a": 1})
    )
    message = AssistantChatMessage(
        content=[MessageTextContent(type="text", text="result")],
        tool_calls=[tool_call],
    )

    payload = message.to_openai_format()

    assert "tool_calls" in payload
    serialized = payload["tool_calls"][0]["function"]["arguments"]
    assert serialized == json.dumps({"a": 1})
