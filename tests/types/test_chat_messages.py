import json
from datetime import datetime, timezone

from setta.types.chat import (
    AssistantChatMessage,
    Chat,
    ChatMetadata,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.generated.go_shared_types import (
    ChatFileAttachment,
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
        id="tool-call-1",
        type="function",
        function=ToolCallFunction(name="some_tool", arguments={"a": 1}),
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


def test_tool_to_openai_format_strips_ui_only_fields() -> None:
    message = ToolChatMessage(tool_call_id="tool-call-1", createdAt=123)

    payload = message.to_openai_format()

    assert "createdAt" not in payload
    assert payload == {
        "role": "tool",
        "tool_call_id": "tool-call-1",
        "content": [],
    }


def test_chat_metadata_parses_iso_last_updated_without_custom_validator() -> None:
    metadata = ChatMetadata.model_validate(
        {
            "id": "chat-1",
            "name": "Chat One",
            "lastUpdated": "2024-01-02T03:04:05Z",
            "llmConfig": {"id": "llm-1", "model": "gpt-test"},
        }
    )

    assert metadata.lastUpdated == datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)


def test_chat_parses_iso_last_updated_and_typed_messages_without_custom_validator() -> None:
    chat = Chat.model_validate(
        {
            "id": "chat-1",
            "name": "Chat One",
            "lastUpdated": "2024-01-02T03:04:05Z",
            "llmConfig": {"id": "llm-1", "model": "gpt-test"},
            "messages": [
                {
                    "id": "message-1",
                    "role": "user",
                    "createdAt": 0,
                    "content": [{"type": "text", "text": "Hello"}],
                    "attachments": [],
                }
            ],
        }
    )

    assert chat.lastUpdated == datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert chat.messages[0].role == "user"
