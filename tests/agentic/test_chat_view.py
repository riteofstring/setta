import unittest

from setta.agentic.chat_view import (
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    derive_chat_name,
    get_run_chat_id,
    get_run_llm_config_id,
    get_run_project_config_id,
    get_run_type,
    is_llm_chat_run,
)
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageStartEvent,
    MessageTextDelta,
)
from setta.types.id import ID


class ChatViewTests(unittest.TestCase):
    def test_run_type_and_ids(self) -> None:
        run = AgentRun(
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
            },
        )

        self.assertEqual(get_run_type(run), LLM_CHAT_RUN_TYPE)
        self.assertTrue(is_llm_chat_run(run))
        self.assertEqual(get_run_chat_id(run), ID("chat-1"))
        self.assertEqual(get_run_project_config_id(run), ID("project-1"))

        run_with_event = AgentRun(
            inputs={"runType": LLM_CHAT_RUN_TYPE},
            events=[
                RunEvent(
                    type="run_started",
                    payload={"chatId": "chat-2", "projectConfigId": "project-2"},
                )
            ],
        )
        self.assertEqual(get_run_chat_id(run_with_event), ID("chat-2"))
        self.assertEqual(get_run_project_config_id(run_with_event), ID("project-2"))

    def test_build_chat_state_from_stream_events(self) -> None:
        user_message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
        )
        assistant_id = "assistant-1"
        start_event = MessageStartEvent(
            message=AssistantChatMessage(id=assistant_id, content=[]),
        )
        delta_event = MessageDeltaEvent(
            message_id=assistant_id,
            content=[MessageTextDelta(index=0, text="Hi")],
        )
        run = AgentRun(
            status=AgentRunStatus.running,
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
                "llmConfigId": "primary",
                "messages": [user_message.model_dump(mode="json")],
            },
            events=[
                RunEvent(
                    type="stream_chunk",
                    payload={"chunk": start_event.model_dump(mode="json")},
                ),
                RunEvent(
                    type="stream_chunk",
                    payload={"chunk": delta_event.model_dump(mode="json")},
                ),
            ],
        )

        state = build_chat_state_from_run(run)

        self.assertEqual(len(state.messages), 2)
        self.assertTrue(state.waitingForResponse)
        assistant_message = next(
            message
            for message in state.messages
            if isinstance(message, AssistantChatMessage)
        )
        self.assertEqual(assistant_message.content[0].text, "Hi")

    def test_get_llm_config_id_from_run_started_event(self) -> None:
        run = AgentRun(
            inputs={
                "runType": LLM_CHAT_RUN_TYPE,
                "chatId": "chat-1",
                "projectConfigId": "project-1",
            },
            events=[
                RunEvent(
                    type="run_started",
                    payload={"llmConfigId": "primary"},
                )
            ],
        )

        self.assertEqual(get_run_llm_config_id(run), "primary")

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
                "llmConfigId": "primary",
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

        self.assertEqual(len(state.messages), 1)
        assistant_message = state.messages[0]
        self.assertIsInstance(assistant_message, AssistantChatMessage)
        self.assertEqual(assistant_message.content[0].text, "Final")
        self.assertFalse(state.waitingForResponse)

    def test_derive_chat_name_from_first_message(self) -> None:
        message_text = "0123456789" * 4
        message = UserChatMessage(content=[MessageTextContent(text=message_text)])

        name = derive_chat_name([message])

        self.assertEqual(name, message_text[:30])
