import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.chat_view import LLM_CHAT_RUN_TYPE
from setta.agentic.store import load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.routers.ai import (
    DeleteLLMChatRequest,
    GetLLMChatRequest,
    StopLLMChatRequest,
    route_delete_llm_chat,
    route_get_all_llm_chat_metadata,
    route_get_llm_chat,
    route_stop_llm_chat,
)
from setta.types.agentic import AgentRun, AgentRunStatus, RunEvent
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager
from tests.utils.runtime_context import runtime_context


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _build_runner(dbe: DBE) -> AgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    runner = AgentRunner(dbe, MultiMCPClient({}, disabled=True), frontend_sender)
    runner.update_config(
        AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-4o-mini",
                    provider="openai",
                    api_key_env="OPENAI_API_KEY",
                    mcpServerIds=[],
                )
            },
            mcpServers={},
        )
    )
    return runner


def _build_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    llm_config_id: str,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
) -> AgentRun:
    inputs = {
        "runType": LLM_CHAT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
        "llmConfigId": llm_config_id,
        "messages": [message.model_dump(mode="json") for message in input_messages],
    }
    outputs = None
    if output_messages is not None:
        outputs = {
            "messages": [
                message.model_dump(mode="json") for message in output_messages
            ]
        }
    return AgentRun(
        status=status,
        startedAt=started_at,
        finishedAt=started_at + timedelta(seconds=5)
        if status != AgentRunStatus.running
        else None,
        inputs=inputs,
        outputs=outputs,
        events=[
            RunEvent(
                type="run_started",
                payload={
                    "chatId": str(chat_id),
                    "projectConfigId": str(project_config_id),
                    "llmConfigId": llm_config_id,
                },
                timestamp=started_at,
            )
        ],
    )


@dataclass(slots=True)
class TestState:
    dbe: DBE
    agent_runner: AgentRunner
    wmh_frontend_sender: WMHFrontendSender
    share_mode: bool = False
    share_runtime_state: None = None
    chat_manager: None = None


class AgentRunChatRoutesTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_llm_chat_from_agent_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            chat_id = ID("chat-1")
            project_config_id = ID("project-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            assistant_message = AssistantChatMessage(
                content=[MessageTextContent(text="Done")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                llm_config_id="primary",
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            self.assertEqual(len(response.messages), 2)
            self.assertFalse(response.waitingForResponse)
            self.assertEqual(response.llmConfig.id, "primary")

    async def test_get_all_llm_chat_metadata_uses_latest_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            chat_id = ID("chat-2")
            project_config_id = ID("project-2")
            first_message = UserChatMessage(
                content=[MessageTextContent(text="First chat")],
            )
            second_message = UserChatMessage(
                content=[MessageTextContent(text="Second chat message")],
            )
            first_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                llm_config_id="primary",
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[first_message],
                output_messages=[first_message],
            )
            second_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                llm_config_id="primary",
                started_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[second_message],
                output_messages=[second_message],
            )
            save_agent_run(dbe, first_run)
            save_agent_run(dbe, second_run)

            with runtime_context(state) as ctx:
                metadata = await route_get_all_llm_chat_metadata(ctx)

            self.assertEqual(len(metadata), 1)
            entry = metadata[0]
            self.assertEqual(entry.id, chat_id)
            self.assertEqual(entry.name, "Second chat message"[:30])
            self.assertEqual(entry.lastUpdated, second_run.startedAt)
            self.assertEqual(entry.llmConfig.id, "primary")

    async def test_stop_and_delete_llm_chat(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            project_config_id = ID("project-3")
            running_chat_id = ID("chat-3")
            running_run = _build_run(
                chat_id=running_chat_id,
                project_config_id=project_config_id,
                llm_config_id="primary",
                started_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[],
                output_messages=None,
            )
            save_agent_run(dbe, running_run)

            with runtime_context(state) as ctx:
                await route_stop_llm_chat(
                    StopLLMChatRequest(chatId=running_chat_id),
                    ctx,
                )

            stopped = load_agent_run(dbe, running_run.id)
            self.assertIsNotNone(stopped)
            if stopped is None:
                return
            self.assertEqual(stopped.status, AgentRunStatus.cancelled)
            self.assertIsNotNone(stopped.finishedAt)

            delete_chat_id = ID("chat-4")
            delete_run = _build_run(
                chat_id=delete_chat_id,
                project_config_id=project_config_id,
                llm_config_id="primary",
                started_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[],
                output_messages=None,
            )
            save_agent_run(dbe, delete_run)

            with runtime_context(state) as ctx:
                await route_delete_llm_chat(
                    DeleteLLMChatRequest(chatId=delete_chat_id),
                    ctx,
                )

            self.assertIsNone(load_agent_run(dbe, delete_run.id))
