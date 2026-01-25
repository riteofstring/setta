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


def _build_llm_config() -> LLMConfig:
    return LLMConfig(
        id="test-llm",
        model="gpt-test",
        provider="test",
    )


class TestChatHistory:
    def test_create_append_and_delete_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            history = ChatHistory(AgentRunChatStore(dbe))
            llm_config = _build_llm_config()

            first_message = user_message([message_text("Hello toolkit")])
            chat = history.create(
                first_message=first_message,
                llm_config=llm_config,
            )

            loaded = history.require(chat.id)
            assert loaded.messages[0].content[0].text == "Hello toolkit"

            reply = assistant_message([message_text("Welcome")])
            updated = history.append(chat.id, [reply])
            assert len(updated.messages) == 2

            with_prompt = history.set_system_prompt(chat.id, "System prompt")
            assert with_prompt.systemPrompt == "System prompt"

            history.delete(chat.id)
            assert history.get(chat.id) is None
