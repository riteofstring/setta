from tempfile import TemporaryDirectory

import pytest

from setta.agentic.chat_continuity import get_prior_messages_for_chat_engine
from setta.agentic.chat_view import SCRIPTABLE_CHAT_RUN_TYPE
from setta.agentic.store import save_agent_run
from setta.database.db_objs import DBE
from setta.types.agentic import AgentRun, AgentRunStatus, EngineType
from setta.types.chat_messages import AssistantChatMessage, MessageTextContent
from setta.types.id import ID


def test_get_prior_messages_rejects_scriptable_history_for_managed_chat() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(tmpdir)
        save_agent_run(
            dbe,
            AgentRun(
                id=ID("scriptable-run-1"),
                status=AgentRunStatus.completed,
                inputs={
                    "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                    "chatId": "chat-scriptable",
                    "projectConfigId": "project-1",
                    "engineConfigId": "engine-scriptable",
                    "messages": [],
                },
                outputs={
                    "messages": [
                        AssistantChatMessage(
                            content=[MessageTextContent(text="Scriptable reply")]
                        ).model_dump(mode="json")
                    ]
                },
            ),
        )

        with pytest.raises(ValueError) as exc:
            get_prior_messages_for_chat_engine(
                dbe=dbe,
                engine_type=EngineType.setta_llm,
                chat_id=ID("chat-scriptable"),
                project_config_id=ID("project-1"),
                engine_config_id=ID("engine-primary"),
            )

        assert str(exc.value) == "Chat engine mismatch; start a new chat."
