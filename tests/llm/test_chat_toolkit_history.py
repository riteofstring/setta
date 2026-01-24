import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.chat_store import AgentRunChatStore
from setta.llm.chat_toolkit import (
    ChatHistory,
    assistant_message,
    message_text,
    user_message,
)
from setta.types.llm_config import LLMConfig


class ChatHistoryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.llm_config = LLMConfig(
            id="test-llm",
            model="gpt-test",
            provider="test",
        )

    def test_create_append_and_delete_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(AgentRunChatStore(dbe))

            first_message = user_message([message_text("Hello toolkit")])
            chat = history.create(
                first_message=first_message,
                llm_config=self.llm_config,
            )

            loaded = history.require(chat.id)
            self.assertEqual(loaded.messages[0].content[0].text, "Hello toolkit")

            reply = assistant_message([message_text("Welcome")])
            updated = history.append(chat.id, [reply])
            self.assertEqual(len(updated.messages), 2)

            with_prompt = history.set_system_prompt(chat.id, "System prompt")
            self.assertEqual(with_prompt.systemPrompt, "System prompt")

            history.delete(chat.id)
            self.assertIsNone(history.get(chat.id))
