import unittest
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.agentic.chat_view import EXTERNAL_AGENT_RUN_TYPE, LLM_CHAT_RUN_TYPE
from setta.agentic.store import load_agent_run, save_agent_run, save_engine_configs
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.routers.ai import (
    GetExternalAgentChatRequest,
    GetLLMResponseRequest,
    GetLLMChatRequest,
    StopLLMChatRequest,
    _get_prior_messages_for_engine,
    route_get_external_agent_chat,
    route_get_llm_chat,
    route_get_llm_response,
    route_stop_llm_chat,
)
from setta.server_state import SettaFastAPIState
from setta.types.agentic import (
    AgentRun,
    AgentRunStatus,
    EngineConfig,
    EngineType,
    RunEvent,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy
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


def _seed_engine_config(dbe: DBE, engine_config_id: ID, llm_config_id: str) -> None:
    engine_config = EngineConfig(
        id=engine_config_id,
        name="Default Engine",
        engineType=EngineType.setta_llm,
        settaLlmConfigId=llm_config_id,
    )
    save_engine_configs(dbe, [engine_config])


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = ShareDeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, *, allow_llm: bool) -> None:
    dbe = DBE(root)
    policy = SharePolicy(allowLLM=allow_llm)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


def _build_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    engine_config_id: ID,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
) -> AgentRun:
    inputs = {
        "runType": LLM_CHAT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
        "engineConfigId": str(engine_config_id),
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
                    "engineConfigId": str(engine_config_id),
                },
                timestamp=started_at,
            )
        ],
    )


def _build_external_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
    stream_events: list[RunEvent] | None = None,
) -> AgentRun:
    inputs = {
        "runType": EXTERNAL_AGENT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
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
        events=stream_events or [],
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
    async def test_share_mode_blocks_llm_when_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-llm-config-guard"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, allow_llm=True)
            state = SettaFastAPIState(
                FastAPI(),
                share_mode=True,
                share_deployment_root=root,
            )
            await state.wait_until_ready()
            session = state.share_session_store.create_session()

            with self.assertRaises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Hello")],
                            ),
                            engineConfigId=ID("engine-1"),
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                        ),
                        runtime_ctx,
                    )

            self.assertEqual(ctx.exception.status_code, 403)
            self.assertEqual(ctx.exception.detail, "Share LLM support is not enabled.")

    async def test_get_llm_chat_from_agent_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
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
                engine_config_id=engine_config_id,
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

    async def test_get_llm_chat_uses_latest_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
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
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[first_message],
                output_messages=[first_message],
            )
            second_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 2, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[second_message],
                output_messages=[second_message],
            )
            save_agent_run(dbe, first_run)
            save_agent_run(dbe, second_run)

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            self.assertEqual(len(response.messages), 1)
            message = response.messages[0]
            self.assertEqual(message.content[0].text, "Second chat message")
            self.assertFalse(response.waitingForResponse)
            self.assertEqual(response.llmConfig.id, "primary")

    async def test_get_external_agent_chat_from_outputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            chat_id = ID("external-chat-1")
            project_config_id = ID("project-ext-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-1",
                content=[MessageTextContent(text="Hi")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                started_at=datetime(2024, 1, 5, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                response = await route_get_external_agent_chat(
                    GetExternalAgentChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            self.assertEqual(len(response.messages), 2)
            self.assertTrue(response.waitingForResponse)
            self.assertEqual(response.toolCallArguments, {})

    async def test_get_external_agent_chat_missing_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with self.assertRaises(HTTPException) as exc:
                    await route_get_external_agent_chat(
                        GetExternalAgentChatRequest(
                            chatId=ID("missing-external"),
                            projectConfigId=ID("project-ext-missing"),
                        ),
                        ctx,
                    )

            self.assertEqual(exc.exception.status_code, 404)
            self.assertEqual(exc.exception.detail, "Chat not found")

    async def test_external_agent_prior_messages_use_external_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("external-chat-2")
            project_config_id = ID("project-ext-2")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            external_reply = AssistantChatMessage(
                id="assistant-external",
                content=[MessageTextContent(text="External reply")],
            )
            llm_reply = AssistantChatMessage(
                id="assistant-llm",
                content=[MessageTextContent(text="LLM reply")],
            )
            external_run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                started_at=datetime(2024, 1, 6, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, external_reply],
            )
            llm_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=ID("engine-primary"),
                started_at=datetime(2024, 1, 7, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, llm_reply],
            )
            save_agent_run(dbe, external_run)
            save_agent_run(dbe, llm_run)

            prior_messages = _get_prior_messages_for_engine(
                dbe=dbe,
                engine_type=EngineType.external_agent,
                chat_id=chat_id,
                project_config_id=project_config_id,
            )

            self.assertEqual(2, len(prior_messages))
            self.assertEqual(
                "External reply", prior_messages[1].content[0].text
            )

    async def test_stop_llm_chat(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-3")
            running_chat_id = ID("chat-3")
            running_run = _build_run(
                chat_id=running_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
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
