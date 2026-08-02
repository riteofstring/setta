from datetime import datetime, timezone

from setta.types.generated.go_shared_types import (
    Chat,
    ChatMetadata,
)


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
