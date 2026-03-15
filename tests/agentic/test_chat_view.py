from datetime import datetime, timezone

from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    SCRIPTABLE_CHAT_RUN_TYPE,
    derive_chat_name,
    get_run_last_updated,
    get_run_type,
    is_scriptable_chat_run,
)
from setta.types.agentic import AgentRun, RunEvent
from setta.types.chat_messages import MessageTextContent, UserChatMessage


class TestChatView:
    def test_get_run_last_updated_prefers_latest_updates(self) -> None:
        earlier = datetime(2024, 1, 1, 10, 0, tzinfo=timezone.utc)
        later = datetime(2024, 1, 1, 10, 5, tzinfo=timezone.utc)
        middle = datetime(2024, 1, 1, 10, 3, tzinfo=timezone.utc)
        earlier_finish = datetime(2024, 1, 1, 10, 4, tzinfo=timezone.utc)

        run_a = AgentRun(
            startedAt=earlier,
            finishedAt=later,
            events=[
                RunEvent(
                    type="run_completed",
                    payload={},
                    timestamp=later,
                )
            ],
        )
        run_b = AgentRun(
            startedAt=middle,
            finishedAt=earlier_finish,
            events=[
                RunEvent(
                    type="run_completed",
                    payload={},
                    timestamp=earlier_finish,
                )
            ],
        )

        assert get_run_last_updated(run_a) > get_run_last_updated(run_b)

    def test_run_type_classifies_scriptable_runs(self) -> None:
        run = AgentRun(
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
            },
        )

        assert get_run_type(run) == LLM_CHAT_RUN_TYPE

        scriptable = AgentRun(
            inputs={
                "runType": SCRIPTABLE_CHAT_RUN_TYPE,
            },
        )
        assert get_run_type(scriptable) == SCRIPTABLE_CHAT_RUN_TYPE
        assert is_scriptable_chat_run(scriptable)

    def test_derive_chat_name_from_first_message(self) -> None:
        message_text = "0123456789" * 4
        message = UserChatMessage(content=[MessageTextContent(text=message_text)])

        name = derive_chat_name([message])

        assert name == message_text[:30]
