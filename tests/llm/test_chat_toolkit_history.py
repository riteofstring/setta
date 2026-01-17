import unittest

from setta.llm.chat_store import MemoryChatStore
from setta.llm.chat_toolkit import (
    ChatHistory,
    assistant_message,
    message_text,
    user_message,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig


class ChatHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.store = MemoryChatStore()
        self.history = ChatHistory(self.store)
        self.llm_config = LLMConfig(
            id="test-llm",
            model="gpt-test",
            provider="test",
        )
        self.project_config_id = ID("project-123")

    def test_create_append_and_delete_chat(self) -> None:
        first_message = user_message([message_text("Hello toolkit")])
        chat = self.history.create(
            first_message=first_message,
            llm_config=self.llm_config,
            project_config_id=self.project_config_id,
        )

        loaded = self.history.require(chat.id)
        self.assertEqual(loaded.messages[0].content[0].text, "Hello toolkit")

        reply = assistant_message([message_text("Welcome")])
        updated = self.history.append(chat.id, [reply])
        self.assertEqual(len(updated.messages), 2)

        with_prompt = self.history.set_system_prompt(chat.id, "System prompt")
        self.assertEqual(with_prompt.systemPrompt, "System prompt")

        self.history.delete(chat.id)
        self.assertIsNone(self.history.get(chat.id))
