from datetime import datetime, timezone

from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    SCRIPTABLE_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    derive_chat_name,
    get_run_chat_id,
    get_run_engine_config_id,
    get_run_project_config_id,
    get_run_sort_key,
    get_run_type,
    is_chat_run,
    is_llm_chat_run,
    is_scriptable_chat_run,
)
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageTextDelta,
)
from setta.types.id import ID


class TestChatView:
    def test_sort_key_prefers_latest_updates(self) -> None:
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

        assert get_run_sort_key(run_a) > get_run_sort_key(run_b)

    def test_run_type_and_ids(self) -> None:
        run = AgentRun(
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
            },
        )

        assert get_run_type(run) == LLM_CHAT_RUN_TYPE
        assert is_llm_chat_run(run)
        assert is_chat_run(run)
        assert get_run_chat_id(run) == ID("chat-1")
        assert get_run_project_config_id(run) == ID("project-1")

        run_with_event = AgentRun(
            inputs={"runType": LLM_CHAT_RUN_TYPE},
            events=[
                RunEvent(
                    type="run_started",
                    payload={"chatId": "chat-2", "projectConfigId": "project-2"},
                )
            ],
        )
        assert get_run_chat_id(run_with_event) is None
        assert get_run_project_config_id(run_with_event) is None

        scriptable = AgentRun(
            inputs={
                "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                "chatId": "chat-3",
                "projectConfigId": "project-3",
            },
        )
        assert get_run_type(scriptable) == SCRIPTABLE_CHAT_RUN_TYPE
        assert is_scriptable_chat_run(scriptable)
        assert is_chat_run(scriptable)

    def test_build_chat_state_ignores_stream_events(self) -> None:
        user_message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
        )
        run = AgentRun(
            status=AgentRunStatus.running,
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
                "engineConfigId": "engine-1",
                "messages": [user_message.model_dump(mode="json")],
            },
            events=[
                RunEvent(
                    type="stream_chunk",
                    payload={
                        "chunk": MessageDeltaEvent(
                            message_id="assistant-1",
                            content=[MessageTextDelta(index=0, text="Hi")],
                        ).model_dump(mode="json")
                    },
                ),
            ],
        )

        state = build_chat_state_from_run(run)

        assert len(state.messages) == 1
        assert state.waitingForResponse
        assert isinstance(state.messages[0], UserChatMessage)

    def test_get_engine_config_id_from_inputs(self) -> None:
        run = AgentRun(
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
                "engineConfigId": "engine-1",
            },
            events=[
                RunEvent(
                    type="run_started",
                    payload={"engineConfigId": "engine-1"},
                )
            ],
        )

        assert get_run_engine_config_id(run) == ID("engine-1")

        missing = AgentRun(inputs={"runType": LLM_CHAT_RUN_TYPE})
        assert get_run_engine_config_id(missing) is None

    def test_outputs_override_stream(self) -> None:
        output_message = AssistantChatMessage(
            content=[MessageTextContent(text="Final")],
        )
        run = AgentRun(
            status=AgentRunStatus.completed,
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
                "engineConfigId": "engine-1",
                "messages": [],
            },
            outputs={
                "messages": [output_message.model_dump(mode="json")],
            },
            events=[
                RunEvent(
                    type="stream_chunk",
                    payload={
                        "chunk": MessageDeltaEvent(
                            message_id="assistant-1",
                            content=[MessageTextDelta(index=0, text="Ignored")],
                        ).model_dump(mode="json")
                    },
                )
            ],
        )

        state = build_chat_state_from_run(run)

        assert len(state.messages) == 1
        assistant_message = state.messages[0]
        assert isinstance(assistant_message, AssistantChatMessage)
        assert assistant_message.content[0].text == "Final"
        assert not state.waitingForResponse

    def test_build_chat_state_filters_response_placeholders(self) -> None:
        user_message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
        )
        response_placeholder = AssistantChatMessage(
            id="rs_123",
            content=[],
            tool_calls=None,
        )
        assistant_message = AssistantChatMessage(
            id="msg_123",
            content=[MessageTextContent(text="Hi!")],
        )
        run = AgentRun(
            status=AgentRunStatus.completed,
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
                "engineConfigId": "engine-1",
                "messages": [user_message.model_dump(mode="json")],
            },
            outputs={
                "messages": [
                    user_message.model_dump(mode="json"),
                    response_placeholder.model_dump(mode="json"),
                    assistant_message.model_dump(mode="json"),
                ],
            },
        )

        state = build_chat_state_from_run(run)

        assert len(state.messages) == 2
        assert state.messages[0].id == user_message.id
        assert state.messages[1].id == assistant_message.id

    def test_derive_chat_name_from_first_message(self) -> None:
        message_text = "0123456789" * 4
        message = UserChatMessage(content=[MessageTextContent(text=message_text)])

        name = derive_chat_name([message])

        assert name == message_text[:30]
