import time
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.chat_view import SCRIPTABLE_CHAT_RUN_TYPE
from setta.agentic.store import save_agent_run
from setta.database.db_objs import DBE
from setta.llm.chat_store import AgentRunChatStore
from setta.types.agentic import AgentRun, AgentRunStatus
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.utils.timestamps import get_now_timestamp


def _build_message(text: str) -> UserChatMessage:
    return UserChatMessage(content=[MessageTextContent(text=text)])


def _build_config(config_id: str) -> LLMConfig:
    return LLMConfig(id=config_id, model="test-model")


class TestAgentRunChatStore:
    def _build_store(self, temp_dir: str) -> AgentRunChatStore:
        dbe = DBE(Path(temp_dir))
        return AgentRunChatStore(dbe)

    def test_create_and_get_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = self._build_store(temp_dir)
            config = _build_config("primary")
            project_config_id = ID("project-1")

            chat = store.create_new_chat(
                _build_message("hello"),
                config,
                project_config_id=project_config_id,
            )

            fetched = store.get_chat(chat.id)
            if fetched is None:
                raise AssertionError("expected chat to be returned")
            assert fetched.id == chat.id
            assert fetched.projectConfigId == project_config_id
            assert fetched.messages[0].content[0].text == "hello"

    def test_save_messages_deduplicates(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = self._build_store(temp_dir)
            config = _build_config("primary")
            first_message = _build_message("first")
            chat = store.create_new_chat(first_message, config)

            updated = store.save_messages(chat.id, [first_message])
            if updated is None:
                raise AssertionError("expected chat to be returned")
            assert len(updated.messages) == 1

            new_message = _build_message("second")
            updated = store.save_messages(chat.id, [new_message])
            if updated is None:
                raise AssertionError("expected chat to be returned")
            assert len(updated.messages) == 2

    def test_metadata_sorts_by_last_updated(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = self._build_store(temp_dir)
            config = _build_config("primary")
            chat_one = store.create_new_chat(_build_message("first"), config)
            chat_two = store.create_new_chat(_build_message("second"), config)

            time.sleep(0.01)
            store.save_messages(chat_one.id, [_build_message("follow-up")])

            metadata = store.get_all_chat_metadata()
            assert [m.id for m in metadata] == [chat_two.id, chat_one.id]

    def test_set_system_prompt_updates_chat(self) -> None:
        with TemporaryDirectory() as temp_dir:
            store = self._build_store(temp_dir)
            config = _build_config("primary")
            chat = store.create_new_chat(_build_message("hello"), config)

            updated = store.set_system_prompt(chat.id, "system prompt")
            if updated is None:
                raise AssertionError("expected chat to be returned")
            assert updated.systemPrompt == "system prompt"

            fetched = store.get_chat(chat.id)
            if fetched is None:
                raise AssertionError("expected chat to be returned")
            assert fetched.systemPrompt == "system prompt"

    def test_metadata_uses_cached_name_without_parsing_messages(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            store = AgentRunChatStore(dbe)
            config = _build_config("primary")
            now = get_now_timestamp()
            chat_id = ID("chat-cached")
            run = AgentRun(
                id=chat_id,
                status=AgentRunStatus.completed,
                startedAt=now,
                finishedAt=now,
                inputs={
                    "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                    "llmConfig": config.model_dump(mode="json"),
                    "chatId": str(chat_id),
                },
                outputs={
                    "name": "Cached Chat",
                    "lastUpdated": now.isoformat(),
                    "messages": [{"unexpected": "payload"}],
                },
            )
            save_agent_run(dbe, run)

            metadata = store.get_all_chat_metadata()

            assert len(metadata) == 1
            assert metadata[0].name == "Cached Chat"
