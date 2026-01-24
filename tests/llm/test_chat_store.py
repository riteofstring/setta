import time
import unittest

from setta.llm.chat_store import MemoryChatStore
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.llm_config import LLMConfig


def _build_message(text: str) -> UserChatMessage:
    return UserChatMessage(content=[MessageTextContent(text=text)])


def _build_config(config_id: str) -> LLMConfig:
    return LLMConfig(id=config_id, model="test-model")


class MemoryChatStoreTests(unittest.TestCase):
    def test_get_chat_returns_copies(self) -> None:
        store = MemoryChatStore()
        config = _build_config("primary")
        chat = store.create_new_chat(
            _build_message("hello"),
            config,
        )

        fetched = store.get_chat(chat.id)
        if fetched is None:
            raise AssertionError("expected chat to be returned")
        content = fetched.messages[0].content[0]
        self.assertIsInstance(content, MessageTextContent)
        content.text = "changed"

        fetched_again = store.get_chat(chat.id)
        if fetched_again is None:
            raise AssertionError("expected chat to be returned")
        updated_content = fetched_again.messages[0].content[0]
        self.assertIsInstance(updated_content, MessageTextContent)
        self.assertEqual("hello", updated_content.text)

    def test_save_messages_deduplicates(self) -> None:
        store = MemoryChatStore()
        config = _build_config("primary")
        first_message = _build_message("first")
        chat = store.create_new_chat(
            first_message,
            config,
        )

        updated = store.save_messages(chat.id, [first_message])
        if updated is None:
            raise AssertionError("expected chat to be returned")
        self.assertEqual(1, len(updated.messages))

        new_message = _build_message("second")
        updated = store.save_messages(chat.id, [new_message])
        if updated is None:
            raise AssertionError("expected chat to be returned")
        self.assertEqual(2, len(updated.messages))

    def test_metadata_sorts_by_last_updated(self) -> None:
        store = MemoryChatStore()
        config = _build_config("primary")
        chat_one = store.create_new_chat(
            _build_message("first"),
            config,
        )
        chat_two = store.create_new_chat(
            _build_message("second"),
            config,
        )

        time.sleep(0.01)
        store.save_messages(chat_one.id, [_build_message("follow-up")])

        metadata = store.get_all_chat_metadata()
        self.assertEqual([chat_two.id, chat_one.id], [m.id for m in metadata])

    def test_metadata_returns_copies(self) -> None:
        store = MemoryChatStore()
        config = _build_config("primary")
        chat = store.create_new_chat(
            _build_message("hello"),
            config,
        )

        metadata = store.get_all_chat_metadata()
        self.assertEqual(1, len(metadata))
        metadata[0].llmConfig.model = "mutated-model"

        fetched = store.get_chat(chat.id)
        if fetched is None:
            raise AssertionError("expected chat to be returned")
        self.assertEqual("test-model", fetched.llmConfig.model)

    def test_set_system_prompt_updates_chat(self) -> None:
        store = MemoryChatStore()
        config = _build_config("primary")
        chat = store.create_new_chat(
            _build_message("hello"),
            config,
        )

        updated = store.set_system_prompt(chat.id, "system prompt")
        if updated is None:
            raise AssertionError("expected chat to be returned")
        self.assertEqual("system prompt", updated.systemPrompt)

        fetched = store.get_chat(chat.id)
        if fetched is None:
            raise AssertionError("expected chat to be returned")
        self.assertEqual("system prompt", fetched.systemPrompt)


if __name__ == "__main__":
    unittest.main()
