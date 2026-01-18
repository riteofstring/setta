import tempfile
import unittest
from pathlib import Path
from typing import TYPE_CHECKING, cast

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.chats.load import load_all_chat_metadata, load_chat
from setta.project_state.chats.save import (
    create_new_chat,
    delete_chat,
    save_messages,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    ChatRole,
    MessageTextContent,
    SystemChatMessage,
    ToolChatMessage,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig

if TYPE_CHECKING:
    from setta.types.chat import Chat

DEFAULT_CONFIG_ID = "provider-one"
DEFAULT_PROJECT_CONFIG_ID = ID("chat-tests-project")


def create_llm_config(
    model: str = "test-model", config_id: str = DEFAULT_CONFIG_ID
) -> LLMConfig:
    return LLMConfig(id=config_id, model=model)


def create_message(text: str, role: ChatRole = ChatRole.user):
    content_block = MessageTextContent(type="text", text=text)
    if role == ChatRole.user:
        return UserChatMessage(id=create_new_id(), content=[content_block])
    if role == ChatRole.assistant:
        return AssistantChatMessage(id=create_new_id(), content=[content_block])
    if role == ChatRole.system:
        return SystemChatMessage(id=create_new_id(), content=[content_block])
    if role == ChatRole.tool:
        return ToolChatMessage(
            id=create_new_id(),
            tool_call_id=create_new_id(),
            content=[],
        )
    raise ValueError(f"Unsupported chat role: {role}")


class ChatStorageTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.dbe = DBE(Path(self.temp_dir.name))

    def test_create_and_load_chat(self):
        first_message = create_message("Hello there")
        chat = create_new_chat(
            self.dbe,
            first_message,
            create_llm_config(),
            project_config_id=DEFAULT_PROJECT_CONFIG_ID,
        )
        loaded = load_chat(self.dbe, chat.id)

        self.assertIsNotNone(loaded)
        loaded_chat = cast("Chat", loaded)
        self.assertEqual(chat.id, loaded_chat.id)
        self.assertEqual(chat.name, loaded_chat.name)
        self.assertEqual(1, len(loaded_chat.messages))
        text_block = loaded_chat.messages[0].content[0]
        self.assertIsInstance(text_block, MessageTextContent)
        text_block = cast("MessageTextContent", text_block)
        self.assertEqual("Hello there", text_block.text)

    def test_save_messages_appends_and_updates_timestamp(self):
        first_message = create_message("Hi")
        chat = create_new_chat(
            self.dbe,
            first_message,
            create_llm_config(),
            project_config_id=DEFAULT_PROJECT_CONFIG_ID,
        )
        initial_last_updated = chat.lastUpdated

        follow_up = create_message("Hey!", ChatRole.assistant)
        updated = save_messages(self.dbe, chat.id, [follow_up])

        self.assertIsNotNone(updated)
        updated_chat = cast("Chat", updated)
        self.assertGreaterEqual(updated_chat.lastUpdated, initial_last_updated)
        self.assertEqual(2, len(updated_chat.messages))

        # Saving the same message again should not duplicate it
        again = save_messages(self.dbe, chat.id, [follow_up])
        self.assertIsNotNone(again)
        again_chat = cast("Chat", again)
        self.assertEqual(2, len(again_chat.messages))

    def test_load_metadata_and_delete_chat(self):
        chat_one = create_new_chat(
            self.dbe,
            create_message("First"),
            create_llm_config("first-model"),
            project_config_id=DEFAULT_PROJECT_CONFIG_ID,
        )
        chat_two = create_new_chat(
            self.dbe,
            create_message("Second"),
            create_llm_config("second-model", config_id="provider-two"),
            project_config_id=ID("chat-tests-project-two"),
        )

        metadata = load_all_chat_metadata(self.dbe)
        self.assertEqual([chat_one.id, chat_two.id], [m.id for m in metadata])

        delete_chat(self.dbe, chat_one.id)
        self.assertIsNone(load_chat(self.dbe, chat_one.id))

        metadata_after_delete = load_all_chat_metadata(self.dbe)
        self.assertEqual([chat_two.id], [m.id for m in metadata_after_delete])


if __name__ == "__main__":
    unittest.main()
