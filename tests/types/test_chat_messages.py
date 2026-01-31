import json

from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatFileAttachment,
    MessageTextContent,
    ToolCall,
    ToolCallFunction,
    UserChatMessage,
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


def test_to_openai_format_strips_attachments() -> None:
    attachment = ChatFileAttachment(
        id="artifacts/notes.txt",
        name="notes.txt",
        mimeType="text/plain",
        size=11,
    )
    message = UserChatMessage(
        content=[MessageTextContent(type="text", text="Hello")],
        attachments=[attachment],
    )

    payload = message.to_openai_format()

    assert "attachments" not in payload
    assert payload["content"] == [{"type": "text", "text": "Hello"}]
