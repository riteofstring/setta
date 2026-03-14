import base64
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
import pytest

import setta.routers.ai as ai_module
from setta.agentic.context_usage import ResolvedChatContextUsage
from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    SCRIPTABLE_CHAT_RUN_TYPE,
)
from setta.agentic.external_agent_preflight import ExternalAgentPreflightStatus
from setta.agentic.external_agent_runner import ExternalAgentRunner
from setta.agentic.transcription_profile_resolver import (
    TranscriptionProfileNotFoundError,
)
from setta.agentic.store import (
    create_agent_run,
    load_agent_run,
    save_agent_run,
    save_engine_configs,
    save_external_agent_configs,
    save_transcription_profiles,
)
from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.llm.transcription_sessions import (
    TranscriptionAudioLimitExceededError,
    TranscriptionSessionError,
    TranscriptionSessionManager,
    TranscriptionSessionNotFoundError,
)
from setta.mcp.client import MultiMCPClient
from setta.routers.ai import (
    AppendTranscriptionAudioRequest,
    CancelTranscriptionSessionRequest,
    GetExternalAgentChatRequest,
    GetLLMResponseRequest,
    GetLLMChatRequest,
    StartTranscriptionSessionRequest,
    StopLLMChatRequest,
    StopTranscriptionSessionRequest,
    _build_branch_messages,
    _ensure_external_chat_id_compatible,
    _get_prior_messages_for_engine,
    route_append_transcription_audio,
    route_cancel_transcription_session,
    route_get_external_agent_chat,
    route_get_llm_chat,
    route_get_llm_response,
    route_start_transcription_session,
    route_stop_transcription_session,
    route_stop_llm_chat,
)
from setta.server_state import SettaFastAPIState
from setta.types.agentic import (
    AgentRun,
    AgentRunStatus,
    EngineConfig,
    EngineType,
    RunEvent,
    TranscriptionProfile,
    TranscriptionTransportMode,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.chat_messages import (
    AssistantChatMessage,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectChatWindowingState, ProjectStateBackend
from setta.types.section_impls import ChatPermissionMode
from setta.types.share_deployment import DeploymentManifest, SharePolicy, DeploymentType
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


def _seed_transcription_profile(
    dbe: DBE,
    transcription_profile_id: ID,
    llm_config_id: str,
) -> None:
    profile = TranscriptionProfile(
        id=transcription_profile_id,
        name="Default Transcription Profile",
        transcriptionLlmConfigId=llm_config_id,
        transportMode=TranscriptionTransportMode.file,
        chunkMs=1200,
        language=None,
    )
    save_transcription_profiles(dbe, [profile])


def _assert_transcription_http_error(
    exc: HTTPException,
    *,
    message: str,
    error_code: str,
) -> None:
    assert isinstance(exc.detail, dict)
    assert exc.detail.get("message") == message
    assert exc.detail.get("errorCode") == error_code


def _assert_chat_hydration_http_error(
    exc: HTTPException,
    *,
    message: str,
    error_code: str,
) -> None:
    assert isinstance(exc.detail, dict)
    assert exc.detail.get("message") == message
    assert exc.detail.get("errorCode") == error_code


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = Path(tmpdir) / "deployments" / project_config_name / deployment_version
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
        projectChatWindowingByProjectConfigId={
            project_config.id: ProjectChatWindowingState()
        },
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, *, allow_llm: bool) -> None:
    dbe = DBE(root)
    policy = SharePolicy(allowLLM=allow_llm)
    dbe.write_json(root / "policy.json", policy.model_dump())


def _build_run(
    *,
    chat_id: ID,
    project_config_id: ID,
    engine_config_id: ID,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
    usage: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
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
            "messages": [message.model_dump(mode="json") for message in output_messages]
        }
        if usage is not None:
            outputs["usage"] = usage
        if metadata is not None:
            outputs["metadata"] = metadata
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
    engine_config_id: ID | None = None,
    started_at: datetime,
    status: AgentRunStatus,
    input_messages: list[UserChatMessage | AssistantChatMessage],
    output_messages: list[UserChatMessage | AssistantChatMessage] | None = None,
    usage: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
    stream_events: list[RunEvent] | None = None,
) -> AgentRun:
    inputs = {
        "runType": EXTERNAL_AGENT_RUN_TYPE,
        "chatId": str(chat_id),
        "projectConfigId": str(project_config_id),
        "messages": [message.model_dump(mode="json") for message in input_messages],
    }
    if engine_config_id is not None:
        inputs["engineConfigId"] = str(engine_config_id)
    outputs = None
    if output_messages is not None:
        outputs = {
            "messages": [message.model_dump(mode="json") for message in output_messages]
        }
        if usage is not None:
            outputs["usage"] = usage
        if metadata is not None:
            outputs["metadata"] = metadata
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
class _TestState:
    dbe: DBE
    agent_runner: AgentRunner
    wmh_frontend_sender: WMHFrontendSender
    transcription_session_manager: TranscriptionSessionManager = field(
        default_factory=TranscriptionSessionManager
    )
    external_agent_runner: object = field(
        default_factory=lambda: _DisabledExternalAgentRunner()
    )
    share_mode: bool = False
    deployment_mode: bool = False
    share_runtime_state: None = None
    chat_manager: None = None


class _DisabledExternalAgentRunner:
    disabled = True

    def get_live_chat_state(self, _run_id: ID):
        return None

    def get_ai_follow_snapshot(self, _project_config_id: ID) -> list:
        return []


def test_get_llm_response_request_requires_execution_policy_fields() -> None:
    with pytest.raises(ValidationError) as exc:
        GetLLMResponseRequest(
            chatId=None,
            message=UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            ),
            engineConfigId=ID("engine-1"),
            agentProfileId=None,
            thinking=False,
            projectConfigId=ID("project-1"),
        )
    error_fields = {
        error["loc"][-1]
        for error in exc.value.errors()
        if error.get("type") == "missing"
    }
    assert "permissionMode" in error_fields
    assert "searchEnabled" in error_fields


class TestAgentRunChatRoutes:
    pytestmark = pytest.mark.asyncio

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

            with pytest.raises(HTTPException) as ctx:
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
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        runtime_ctx,
                    )

            assert ctx.value.status_code == 403
            assert ctx.value.detail == "Deployment LLM support is not enabled."

    async def test_get_llm_chat_from_agent_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
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

            assert len(response.messages) == 2
            assert not response.waitingForResponse
            assert response.llmConfig.id == "primary"

    async def test_get_llm_chat_uses_latest_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
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

            assert len(response.messages) == 1
            message = response.messages[0]
            assert message.content[0].text == "Second chat message"
            assert not response.waitingForResponse
            assert response.llmConfig.id == "primary"

    async def test_get_llm_chat_includes_context_usage(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-context-usage")
            project_config_id = ID("project-context-usage")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello usage")],
            )
            assistant_message = AssistantChatMessage(
                content=[MessageTextContent(text="Done usage")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                usage={"promptTokens": 42, "completionTokens": 7, "totalTokens": 49},
                metadata={"model": "gpt-4o-mini", "provider": "openai"},
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

            assert response.contextUsage is not None
            assert response.contextUsage.contextUsedTokens == 42
            assert response.contextUsage.estimated is True
            assert response.contextUsage.contextWindowTokens is None

    async def test_get_llm_chat_ignores_non_finite_usage_values(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-context-usage-non-finite")
            project_config_id = ID("project-context-usage-non-finite")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello usage")],
            )
            assistant_message = AssistantChatMessage(
                content=[MessageTextContent(text="Done usage")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                usage={
                    "promptTokens": float("nan"),
                    "inputTokens": 31,
                    "contextWindowTokens": float("inf"),
                },
                metadata={"model": "gpt-4o-mini", "provider": "openai"},
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

            assert response.contextUsage is not None
            assert response.contextUsage.contextUsedTokens == 31
            assert response.contextUsage.contextWindowTokens is None
            assert response.contextUsage.estimated is True

    async def test_get_llm_chat_context_uses_run_metadata_not_live_config(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def _capture_internal_context_usage(_run: AgentRun) -> ResolvedChatContextUsage:
            return ResolvedChatContextUsage(
                context_window_tokens=123,
                context_used_tokens=42,
                estimated=False,
            )

        monkeypatch.setattr(
            ai_module,
            "resolve_internal_run_context_usage",
            _capture_internal_context_usage,
        )
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-context-source-metadata")
            project_config_id = ID("project-context-source-metadata")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello usage")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 3, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
                metadata={"model": "gpt-4o-mini", "provider": "openai"},
            )
            save_agent_run(dbe, run)
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "primary": LLMConfig(
                            id="primary",
                            model="claude-3-7-sonnet",
                            provider="anthropic",
                            api_key_env="ANTHROPIC_API_KEY",
                            mcpServerIds=[],
                        )
                    },
                    mcpServers={},
                )
            )

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            assert response.contextUsage is not None
            assert response.contextUsage.contextWindowTokens == 123

    async def test_get_llm_chat_allows_missing_engine_metadata_and_returns_null_llm_config(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            chat_id = ID("chat-missing-engine-metadata")
            project_config_id = ID("project-missing-engine-metadata")
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=ID("engine-legacy"),
                started_at=datetime(2024, 1, 6, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[
                    UserChatMessage(content=[MessageTextContent(text="Hello")])
                ],
                output_messages=[
                    AssistantChatMessage(content=[MessageTextContent(text="Done")])
                ],
            )
            assert run.inputs is not None
            run.inputs.pop("engineConfigId", None)
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                response = await route_get_llm_chat(
                    GetLLMChatRequest(
                        chatId=chat_id,
                        projectConfigId=project_config_id,
                    ),
                    ctx,
                )

            assert response.waitingForResponse is False
            assert response.llmConfig is None
            assert len(response.messages) >= 1
            assert response.messages[-1].role == "assistant"

    async def test_get_llm_chat_missing_run_returns_typed_not_found_error(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_chat(
                        GetLLMChatRequest(
                            chatId=ID("missing-llm-chat"),
                            projectConfigId=ID("project-missing-llm-chat"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            _assert_chat_hydration_http_error(
                exc.value,
                message="Chat not found.",
                error_code="chat_not_found",
            )

    async def test_get_llm_chat_allows_engine_type_mismatch_and_returns_null_llm_config(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_engine_id = ID("engine-external")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=ID("external-config-unused"),
                    )
                ],
            )
            chat_id = ID("chat-engine-type-mismatch")
            project_config_id = ID("project-engine-type-mismatch")
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=external_engine_id,
                started_at=datetime(2024, 1, 7, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[
                    UserChatMessage(content=[MessageTextContent(text="Hello")])
                ],
                output_messages=[
                    AssistantChatMessage(content=[MessageTextContent(text="Done")])
                ],
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

            assert response.waitingForResponse is False
            assert response.llmConfig is None
            assert len(response.messages) >= 1
            assert response.messages[-1].role == "assistant"

    async def test_get_llm_chat_allows_missing_llm_config_and_returns_null_llm_config(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-missing-llm-config")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="Broken LLM Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="missing-llm-config",
                    )
                ],
            )
            chat_id = ID("chat-missing-llm-config")
            project_config_id = ID("project-missing-llm-config")
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 8, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[
                    UserChatMessage(content=[MessageTextContent(text="Hello")])
                ],
                output_messages=[
                    AssistantChatMessage(content=[MessageTextContent(text="Done")])
                ],
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

            assert response.waitingForResponse is False
            assert response.llmConfig is None
            assert len(response.messages) >= 1
            assert response.messages[-1].role == "assistant"

    async def test_get_llm_chat_allows_missing_llm_binding_and_returns_null_llm_config(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-without-llm-binding")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="Unbound LLM Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId=None,
                    )
                ],
            )
            chat_id = ID("chat-unbound-llm-config")
            project_config_id = ID("project-unbound-llm-config")
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 8, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[
                    UserChatMessage(content=[MessageTextContent(text="Hello")])
                ],
                output_messages=[
                    AssistantChatMessage(content=[MessageTextContent(text="Done")])
                ],
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

            assert response.waitingForResponse is False
            assert response.llmConfig is None
            assert len(response.messages) >= 1
            assert response.messages[-1].role == "assistant"

    async def test_external_engine_rejects_llm_chat_id(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            internal_engine_config_id = ID("engine-primary")
            external_engine_config_id = ID("engine-external")
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            internal_engine_config = EngineConfig(
                id=internal_engine_config_id,
                name="Default Engine",
                engineType=EngineType.setta_llm,
                settaLlmConfigId="primary",
            )
            external_engine_config = EngineConfig(
                id=external_engine_config_id,
                name="External Engine",
                engineType=EngineType.external_agent,
                externalAgentConfigId=external_config.id,
            )
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(dbe, [internal_engine_config, external_engine_config])
            chat_id = ID("chat-external-mismatch")
            project_config_id = ID("project-llm-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=internal_engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)
            prior_message_loader_called = False

            def _capture_prior_messages(*_args, **_kwargs):
                nonlocal prior_message_loader_called
                prior_message_loader_called = True
                return []

            monkeypatch.setattr(
                "setta.routers.ai._get_prior_messages_for_engine",
                _capture_prior_messages,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Next")],
                            ),
                            engineConfigId=external_engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."
            assert prior_message_loader_called is False

    async def test_managed_engine_rejects_external_history_on_reused_chat_id(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-mixed-history")
            project_config_id = ID("project-llm-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external first")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=ID("engine-external"),
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Next")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_managed_engine_rejects_scriptable_history_on_reused_chat_id(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-scriptable-history")
            project_config_id = ID("project-llm-1")
            run = AgentRun(
                status=AgentRunStatus.completed,
                startedAt=datetime(2024, 1, 1, tzinfo=timezone.utc),
                finishedAt=datetime(2024, 1, 1, 0, 0, 5, tzinfo=timezone.utc),
                inputs={
                    "runType": SCRIPTABLE_CHAT_RUN_TYPE,
                    "chatId": str(chat_id),
                    "projectConfigId": str(project_config_id),
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
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Next")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_managed_engine_rejects_project_mismatch_on_reused_chat_id(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            chat_id = ID("chat-project-mismatch")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello")],
            )
            run = _build_run(
                chat_id=chat_id,
                project_config_id=ID("project-llm-other"),
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Next")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=ID("project-llm-1"),
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat project config mismatch; start a new chat."

    async def test_branch_edit_missing_message_returns_404(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-branch-1")
            parent_chat_id = ID("chat-parent")
            user_message = UserChatMessage(
                id="msg-1",
                content=[MessageTextContent(text="Original")],
            )
            run = _build_run(
                chat_id=parent_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message],
            )
            save_agent_run(dbe, run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                id="edited",
                                content=[MessageTextContent(text="Edited")],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            branchParentChatId=parent_chat_id,
                            branchFromMessageId=ID("missing"),
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            assert exc.value.detail == "Message missing not found in chat history"

    async def test_branch_edit_persists_per_message_app_generation_provenance(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-branch-app-generation")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-branch-app-generation")
            parent_chat_id = ID("chat-parent-app-generation")
            json_user_message = UserChatMessage(
                id="msg-json",
                content=[MessageTextContent(text="Build the JSON app.")],
            )
            json_assistant_message = AssistantChatMessage(
                id="assistant-json",
                content=[MessageTextContent(text="JSON app draft")],
            )
            mcp_user_message = UserChatMessage(
                id="msg-mcp",
                content=[MessageTextContent(text="Bring this into MCP tools.")],
            )
            seed_run = _build_run(
                chat_id=parent_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 4, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[
                    json_user_message,
                    json_assistant_message,
                    mcp_user_message,
                ],
                output_messages=[
                    json_user_message,
                    json_assistant_message,
                    mcp_user_message,
                ],
            )
            save_agent_run(dbe, seed_run)
            captured_inputs: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured_inputs.update(inputs)
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                created_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            id="msg-mcp",
                            content=[
                                MessageTextContent(text="Edited MCP branch prompt")
                            ],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                        branchParentChatId=parent_chat_id,
                        branchFromMessageId=ID("msg-mcp"),
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=True,
                        appGenerationMode="mcp_server",
                        appGenerationByMessageId={
                            "msg-json": "json_render",
                            "msg-mcp": "mcp_server",
                            "missing": "prompt_builder",
                        },
                    ),
                    ctx,
                )

            assert created_chat_id is not None
            assert "appGenerationMode" not in captured_inputs
            assert captured_inputs.get("appGenerationByMessageId") == {
                "msg-json": "json_render",
                "msg-mcp": "mcp_server",
            }

    async def test_get_llm_response_rejects_image_mode_without_image_attachment(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-image-mode")
            project_config_id = ID("project-image-mode")
            _seed_engine_config(dbe, engine_config_id, "primary")
            start_run_call_count = 0

            def _capture_start_run(*_args, **_kwargs):
                nonlocal start_run_call_count
                start_run_call_count += 1
                return create_agent_run(profile_id=ID("profile-unexpected"), inputs={})

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                id="msg-image",
                                content=[
                                    MessageTextContent(
                                        text="Match the missing reference image."
                                    )
                                ],
                                attachments=[],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                            appGenerationMode="json_render_with_image",
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert (
                exc.value.detail
                == "json_render_with_image requires at least one image attachment."
            )
            assert start_run_call_count == 0

    async def test_get_llm_response_allows_image_mode_follow_up_with_retained_image_history(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-image-follow-up")
            project_config_id = ID("project-image-follow-up")
            chat_id = ID("chat-image-follow-up")
            _seed_engine_config(dbe, engine_config_id, "primary")

            first_user_message = UserChatMessage(
                id="msg-image-initial",
                content=[MessageTextContent(text="Match this reference image.")],
                attachments=[
                    {
                        "id": "image-1",
                        "name": "reference.png",
                        "mimeType": "image/png",
                    }
                ],
            )
            first_assistant_message = AssistantChatMessage(
                id="msg-image-assistant",
                content=[MessageTextContent(text="Initial image-guided draft.")],
            )
            seed_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 5, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[first_user_message],
                output_messages=[first_user_message, first_assistant_message],
            )
            save_agent_run(dbe, seed_run)

            captured_inputs: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured_inputs.update(inputs)
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                returned_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=chat_id,
                        message=UserChatMessage(
                            id="msg-image-follow-up",
                            content=[
                                MessageTextContent(text="Make the header taller.")
                            ],
                            attachments=[],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=True,
                        appGenerationMode="json_render_with_image",
                        appGenerationByMessageId={
                            "msg-image-initial": "json_render_with_image",
                        },
                    ),
                    ctx,
                )

            assert returned_chat_id == chat_id
            assert captured_inputs.get("appGenerationByMessageId") == {
                "msg-image-initial": "json_render_with_image",
                "msg-image-follow-up": "json_render_with_image",
            }
            raw_messages = captured_inputs.get("messages")
            assert isinstance(raw_messages, list)
            # The follow-up run should preserve the retained image message and
            # append the new text-only user turn.
            assert [raw.get("id") for raw in raw_messages] == [
                "msg-image-initial",
                "msg-image-assistant",
                "msg-image-follow-up",
            ]

    async def test_get_llm_response_rejects_plain_chat_image_history_for_image_mode_follow_up(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-image-plain-history")
            project_config_id = ID("project-image-plain-history")
            chat_id = ID("chat-image-plain-history")
            _seed_engine_config(dbe, engine_config_id, "primary")

            first_user_message = UserChatMessage(
                id="msg-plain-image",
                content=[MessageTextContent(text="Look at this screenshot.")],
                attachments=[
                    {
                        "id": "image-plain",
                        "name": "reference.png",
                        "mimeType": "image/png",
                    }
                ],
            )
            first_assistant_message = AssistantChatMessage(
                id="msg-plain-image-assistant",
                content=[MessageTextContent(text="General discussion only.")],
            )
            seed_run = _build_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 5, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[first_user_message],
                output_messages=[first_user_message, first_assistant_message],
            )
            save_agent_run(dbe, seed_run)
            start_run_call_count = 0

            def _capture_start_run(*_args, **_kwargs):
                nonlocal start_run_call_count
                start_run_call_count += 1
                return create_agent_run(profile_id=ID("profile-unexpected"), inputs={})

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=chat_id,
                            message=UserChatMessage(
                                id="msg-image-follow-up",
                                content=[
                                    MessageTextContent(
                                        text="Match that screenshot more closely."
                                    )
                                ],
                                attachments=[],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                            appGenerationMode="json_render_with_image",
                            appGenerationByMessageId={},
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert (
                exc.value.detail
                == "json_render_with_image requires at least one image attachment."
            )
            assert start_run_call_count == 0

    async def test_get_llm_response_continue_from_chat_seeds_prior_messages(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            source_engine_config_id = ID("engine-source")
            target_engine_config_id = ID("engine-target")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=source_engine_config_id,
                        name="Source Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="primary",
                    ),
                    EngineConfig(
                        id=target_engine_config_id,
                        name="Target Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="primary",
                    ),
                ],
            )
            project_config_id = ID("project-continue-seed")
            source_chat_id = ID("chat-source-seed")
            source_user_message = UserChatMessage(
                id="source-user",
                content=[MessageTextContent(text="Source prompt")],
            )
            source_assistant_message = AssistantChatMessage(
                id="source-assistant",
                content=[MessageTextContent(text="Source reply")],
            )
            seed_run = _build_run(
                chat_id=source_chat_id,
                project_config_id=project_config_id,
                engine_config_id=source_engine_config_id,
                started_at=datetime(2024, 1, 5, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[source_user_message],
                output_messages=[source_user_message, source_assistant_message],
            )
            save_agent_run(dbe, seed_run)
            captured_inputs: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured_inputs.update(inputs)
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                created_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        continueFromChatId=source_chat_id,
                        message=UserChatMessage(
                            id="new-message",
                            content=[MessageTextContent(text="Continue on new engine")],
                        ),
                        engineConfigId=target_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=True,
                    ),
                    ctx,
                )

            assert created_chat_id is not None
            assert created_chat_id != source_chat_id
            raw_messages = captured_inputs.get("messages")
            assert isinstance(raw_messages, list)
            assert [raw.get("id") for raw in raw_messages] == [
                "source-user",
                "source-assistant",
                "new-message",
            ]

    async def test_get_llm_response_continue_from_chat_supports_external_sources(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            target_engine_config_id = ID("engine-target-managed")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=target_engine_config_id,
                        name="Target Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="primary",
                    ),
                ],
            )
            project_config_id = ID("project-continue-external-seed")
            source_chat_id = ID("chat-source-external-seed")
            source_user_message = UserChatMessage(
                id="source-external-user",
                content=[MessageTextContent(text="External source prompt")],
            )
            source_assistant_message = AssistantChatMessage(
                id="source-external-assistant",
                content=[MessageTextContent(text="External source reply")],
            )
            seed_run = _build_external_run(
                chat_id=source_chat_id,
                project_config_id=project_config_id,
                engine_config_id=ID("engine-external-source"),
                started_at=datetime(2024, 1, 6, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[source_user_message],
                output_messages=[source_user_message, source_assistant_message],
            )
            save_agent_run(dbe, seed_run)
            captured_inputs: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured_inputs.update(inputs)
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                created_chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        continueFromChatId=source_chat_id,
                        message=UserChatMessage(
                            id="new-managed-message",
                            content=[
                                MessageTextContent(
                                    text="Continue externally seeded chat"
                                )
                            ],
                        ),
                        engineConfigId=target_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config_id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=True,
                    ),
                    ctx,
                )

            assert created_chat_id is not None
            raw_messages = captured_inputs.get("messages")
            assert isinstance(raw_messages, list)
            assert [raw.get("id") for raw in raw_messages] == [
                "source-external-user",
                "source-external-assistant",
                "new-managed-message",
            ]

    async def test_get_llm_response_continue_from_chat_requires_existing_source(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            target_engine_config_id = ID("engine-target-missing-source")
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=target_engine_config_id,
                        name="Target Engine",
                        engineType=EngineType.setta_llm,
                        settaLlmConfigId="primary",
                    ),
                ],
            )
            project_config_id = ID("project-continue-missing-source")
            start_run_call_count = 0

            def _capture_start_run(*_args, **_kwargs):
                nonlocal start_run_call_count
                start_run_call_count += 1
                return create_agent_run(
                    profile_id=ID("profile-unexpected"),
                    inputs={},
                )

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            continueFromChatId=ID("chat-source-missing"),
                            message=UserChatMessage(
                                id="new-message",
                                content=[
                                    MessageTextContent(
                                        text="Should fail before run creation",
                                    )
                                ],
                            ),
                            engineConfigId=target_engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=project_config_id,
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            assert isinstance(exc.value.detail, dict)
            if not isinstance(exc.value.detail, dict):
                raise AssertionError("Expected typed continuation-source detail.")
            assert exc.value.detail.get("errorCode") == "source_chat_not_found"
            assert (
                exc.value.detail.get("message")
                == "Continuation source chat chat-source-missing not found."
            )
            assert start_run_call_count == 0

    async def test_get_llm_response_rejects_continue_from_with_chat_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=ID("chat-target"),
                            continueFromChatId=ID("chat-source"),
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Hello")],
                            ),
                            engineConfigId=ID("engine-id"),
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=ID("project-id"),
                            allowUnscoped=True,
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert (
                exc.value.detail == "continueFromChatId requires chatId to be omitted."
            )

    async def test_get_llm_response_requires_section_or_allow_unscoped(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[MessageTextContent(text="Hello")],
                            ),
                            engineConfigId=ID("engine-1"),
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=ID("project-1"),
                            permissionMode=ChatPermissionMode.minimal,
                            searchEnabled=True,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            assert (
                exc.value.detail
                == "sectionId is required unless allowUnscoped is true."
            )

    async def test_get_llm_response_includes_execution_policy_for_managed_runner(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            captured: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new project.")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=ID("project-policy"),
                        allowUnscoped=True,
                        frontendAffinityToken="  frontend-managed  ",
                        permissionMode=ChatPermissionMode.yolo,
                        searchEnabled=False,
                        appGenerationMode="json_render",
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_profile = captured.get("profile")
            assert captured_profile is not None
            system_prompt = captured_profile.systemPrompt
            assert "## Runtime execution settings" in system_prompt
            assert "- permissionMode: yolo" in system_prompt
            assert "- searchEnabled: false" in system_prompt
            assert (
                "## Required completion gate for create/scaffold work" in system_prompt
            )
            assert "setta__set_app_definition" in system_prompt
            assert "setta__stream_app_definition" not in system_prompt

            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("permissionMode") == "yolo"
            assert captured_inputs.get("searchEnabled") is False
            assert captured_inputs.get("frontendAffinityToken") == "frontend-managed"
            assert "appGenerationMode" not in captured_inputs
            assert "skillsEnabled" not in captured_inputs

    async def test_get_llm_response_share_scope_preserves_frontend_affinity_token_for_managed_runner(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            captured: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state, share_session_id="share-session-1") as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new project.")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=ID("project-policy"),
                        allowUnscoped=True,
                        frontendAffinityToken="frontend-managed",
                        permissionMode=ChatPermissionMode.yolo,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("frontendAffinityToken") == "frontend-managed"

    async def test_get_llm_response_rejects_whitespace_only_frontend_affinity_token(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")

            with runtime_context(state) as ctx:
                # Ingress should fail fast on malformed affinity values.
                with pytest.raises(HTTPException) as exc_info:
                    await route_get_llm_response(
                        GetLLMResponseRequest(
                            chatId=None,
                            message=UserChatMessage(
                                content=[
                                    MessageTextContent(text="Create a new project.")
                                ],
                            ),
                            engineConfigId=engine_config_id,
                            agentProfileId=None,
                            thinking=False,
                            projectConfigId=ID("project-policy"),
                            allowUnscoped=True,
                            frontendAffinityToken="   ",
                            permissionMode=ChatPermissionMode.yolo,
                            searchEnabled=False,
                        ),
                        ctx,
                    )
            assert exc_info.value.status_code == 400
            assert "frontendAffinityToken" in str(exc_info.value.detail)

    async def test_get_llm_response_includes_execution_policy_for_external_runner(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            external_engine_config_id = ID("engine-external")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            def _preflight_status_stub(_dbe, _config, **_kwargs):
                return ExternalAgentPreflightStatus(
                    configId=external_config.id,
                    name=external_config.name,
                    toolType=external_config.toolType,
                    runMode=external_config.runMode,
                    supported=True,
                    available=True,
                )

            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                _preflight_status_stub,
            )

            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )
            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new section.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        frontendAffinityToken="  frontend-external  ",
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("permissionMode") == "minimal"
            assert captured_inputs.get("searchEnabled") is False
            assert captured_inputs.get("frontendAffinityToken") == "frontend-external"
            assert "skillsEnabled" not in captured_inputs
            assert captured_inputs.get("approvalPolicy") == "on-request"
            assert captured_inputs.get("sandboxPolicy") == "workspace-write"
            assert captured_inputs.get("effort") == "low"
            assert captured_inputs.get("summary") == "none"
            system_prompt = captured_inputs.get("systemPrompt")
            assert isinstance(system_prompt, str)
            assert "## Runtime execution settings" in system_prompt
            assert "- permissionMode: minimal" in system_prompt
            assert (
                "## Required completion gate for create/scaffold work" in system_prompt
            )

    async def test_get_llm_response_external_runner_maps_codex_yolo_sandbox_policy(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            external_engine_config_id = ID("engine-external")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )
            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )
            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new section.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.yolo,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("permissionMode") == "yolo"
            assert captured_inputs.get("approvalPolicy") == "never"
            assert captured_inputs.get("sandboxPolicy") == "danger-full-access"
            assert captured_inputs.get("effort") == "low"
            assert captured_inputs.get("summary") == "none"

    async def test_get_llm_response_share_scope_preserves_frontend_affinity_token_for_external_runner(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            external_engine_config_id = ID("engine-external")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )
            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )

            with runtime_context(state, share_session_id="share-session-1") as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new section.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        frontendAffinityToken="frontend-external",
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("frontendAffinityToken") == "frontend-external"

    async def test_get_llm_response_external_runner_enables_codex_reasoning_when_thinking(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-config",
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
            )
            external_engine_config_id = ID("engine-external")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )
            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Think through this.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=True,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        frontendAffinityToken="frontend-external",
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("thinking") is True
            assert captured_inputs.get("effort") == "high"
            assert captured_inputs.get("summary") == "auto"
            assert captured_inputs.get("frontendAffinityToken") == "frontend-external"

    async def test_get_llm_response_external_runner_preserves_config_policy_when_custom_mode(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-config",
                name="Claude Code",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.app_server,
                approvalPolicy="plan",
            )
            external_engine_config_id = ID("engine-external")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )
            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new section.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.config_toml_custom,
                        searchEnabled=False,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("permissionMode") == "config_toml_custom"
            assert "approvalPolicy" not in captured_inputs
            assert "sandboxPolicy" not in captured_inputs

    async def test_get_llm_response_does_not_infer_app_mode_from_streaming_flag(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            captured: dict[str, object] = {}

            def _capture_start_run(profile, inputs, **_kwargs):
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(profile_id=profile.id, inputs=inputs)

            monkeypatch.setattr(runner, "start_run", _capture_start_run)

            with runtime_context(state) as ctx:
                await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new project.")],
                        ),
                        engineConfigId=engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=ID("project-policy"),
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.minimal,
                        searchEnabled=True,
                        appGenerationMode=None,
                    ),
                    ctx,
                )

            captured_profile = captured.get("profile")
            assert captured_profile is not None
            system_prompt = captured_profile.systemPrompt
            assert "App generation mode" not in system_prompt

    async def test_transcription_session_file_flow_uses_litellm_transcription(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            _seed_transcription_profile(
                dbe,
                transcription_profile_id,
                "openai-transcribe",
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="whisper-1",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({"OPENAI_API_KEY": "test-key"})
            captured: dict[str, object] = {}

            async def _capture_transcription(*args, **kwargs):
                captured["args"] = args
                captured["kwargs"] = kwargs
                return SimpleNamespace(text="hello from provider")

            with runtime_context(state) as ctx:
                with pytest.MonkeyPatch.context() as monkeypatch:
                    monkeypatch.setattr(
                        "setta.llm.transcription.litellm.atranscription",
                        _capture_transcription,
                    )
                    start_response = await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=transcription_profile_id,
                            language=None,
                        ),
                        ctx,
                    )
                    append_response = await route_append_transcription_audio(
                        AppendTranscriptionAudioRequest(
                            sessionId=start_response.sessionId,
                            audioPcm16Base64=base64.b64encode(
                                b"\xe8\x03" * 28_800
                            ).decode("ascii"),
                            sampleRateHz=24_000,
                            channels=1,
                        ),
                        ctx,
                    )
                    stop_response = await route_stop_transcription_session(
                        StopTranscriptionSessionRequest(
                            sessionId=start_response.sessionId
                        ),
                        ctx,
                    )

            assert start_response.resolvedTransportMode == "file"
            assert append_response.appendText == ""
            assert append_response.fullText == ""
            assert append_response.isFinal is False
            assert stop_response.appendText == "hello from provider"
            assert stop_response.fullText == "hello from provider"
            assert stop_response.isFinal is True
            assert start_response.chunkMs == 0
            kwargs = captured.get("kwargs")
            assert isinstance(kwargs, dict)
            assert kwargs.get("model") == "whisper-1"
            assert kwargs.get("custom_llm_provider") == "openai"
            assert kwargs.get("api_key") == "test-key"
            file_payload = kwargs.get("file")
            assert isinstance(file_payload, tuple)
            assert file_payload[0] == "dictation-window.wav"
            assert file_payload[2] == "audio/wav"

    async def test_append_transcription_audio_maps_session_size_cap_to_413(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            _seed_transcription_profile(
                dbe,
                ID("transcription-primary"),
                "primary",
            )

            async def _raise_size_limit(**_kwargs):
                raise TranscriptionAudioLimitExceededError(max_bytes=1024)

            monkeypatch.setattr(
                state.transcription_session_manager,
                "append_audio",
                _raise_size_limit,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_append_transcription_audio(
                        AppendTranscriptionAudioRequest(
                            sessionId=ID("session-1"),
                            audioPcm16Base64=base64.b64encode(b"\x00\x00").decode(
                                "ascii"
                            ),
                            sampleRateHz=24_000,
                            channels=1,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 413
            _assert_transcription_http_error(
                exc.value,
                message="Audio payload is too large. Maximum size is 1024 bytes.",
                error_code="audio_payload_too_large",
            )

    async def test_append_transcription_audio_maps_session_not_found_by_exception_type(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            async def _raise_session_not_found(**_kwargs):
                exc = TranscriptionSessionNotFoundError(ID("session-1"))
                exc.args = ("Session lookup failed with custom wording.",)
                raise exc

            monkeypatch.setattr(
                state.transcription_session_manager,
                "append_audio",
                _raise_session_not_found,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_append_transcription_audio(
                        AppendTranscriptionAudioRequest(
                            sessionId=ID("session-1"),
                            audioPcm16Base64=base64.b64encode(b"\x00\x00").decode(
                                "ascii"
                            ),
                            sampleRateHz=24_000,
                            channels=1,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            _assert_transcription_http_error(
                exc.value,
                message="Session lookup failed with custom wording.",
                error_code="session_not_found",
            )

    async def test_start_transcription_session_auto_falls_back_to_file(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            save_transcription_profiles(
                dbe,
                [
                    TranscriptionProfile(
                        id=transcription_profile_id,
                        name="Auto Profile",
                        transcriptionLlmConfigId="openai-transcribe",
                        transportMode=TranscriptionTransportMode.auto,
                        chunkMs=1200,
                        language=None,
                    )
                ],
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="gpt-4o-mini-transcribe",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({"OPENAI_API_KEY": "test-key"})

            async def _raise_realtime_unavailable(*_args, **_kwargs):
                raise RuntimeError("realtime transcription is unavailable")

            monkeypatch.setattr(
                "setta.llm.transcription_sessions.OpenAIRealtimeTranscriptionEngine.create",
                _raise_realtime_unavailable,
            )

            with runtime_context(state) as ctx:
                response = await route_start_transcription_session(
                    StartTranscriptionSessionRequest(
                        transcriptionProfileId=transcription_profile_id,
                    ),
                    ctx,
                )

            assert response.resolvedTransportMode == "file"
            assert response.chunkMs == 0

    async def test_start_transcription_session_auto_does_not_fallback_on_missing_api_key(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            save_transcription_profiles(
                dbe,
                [
                    TranscriptionProfile(
                        id=transcription_profile_id,
                        name="Auto Profile",
                        transcriptionLlmConfigId="openai-transcribe",
                        transportMode=TranscriptionTransportMode.auto,
                        chunkMs=1200,
                        language=None,
                    )
                ],
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="gpt-4o-mini-transcribe",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({})

            async def _raise_missing_key(*_args, **_kwargs):
                raise KeyError(
                    "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys."
                )

            monkeypatch.setattr(
                "setta.llm.transcription_sessions.OpenAIRealtimeTranscriptionEngine.create",
                _raise_missing_key,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=transcription_profile_id,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            _assert_transcription_http_error(
                exc.value,
                message="Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys.",
                error_code="missing_api_key",
            )

    async def test_start_transcription_session_missing_profile_returns_404(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=ID("missing-profile"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            _assert_transcription_http_error(
                exc.value,
                message="Transcription profile missing-profile not found",
                error_code="profile_not_found",
            )

    async def test_start_transcription_session_maps_profile_not_found_by_exception_type(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            def _raise_profile_not_found(*_args, **_kwargs):
                exc = TranscriptionProfileNotFoundError(ID("missing-profile"))
                exc.args = ("Profile lookup failed with custom wording.",)
                raise exc

            monkeypatch.setattr(
                ai_module,
                "resolve_transcription_profile",
                _raise_profile_not_found,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=ID("missing-profile"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            _assert_transcription_http_error(
                exc.value,
                message="Profile lookup failed with custom wording.",
                error_code="profile_not_found",
            )

    async def test_transcription_session_scope_mismatch_does_not_remove_owner_session(
        self,
    ) -> None:
        manager = TranscriptionSessionManager()
        llm_config = LLMConfig(
            id="openai-transcribe",
            model="whisper-1",
            provider="openai",
            api_key_env="OPENAI_API_KEY",
            mcpServerIds=[],
        )
        profile = TranscriptionProfile(
            id=ID("profile-1"),
            name="File Profile",
            transcriptionLlmConfigId="openai-transcribe",
            transportMode=TranscriptionTransportMode.file,
            chunkMs=1200,
            language=None,
        )
        session_id, resolved_transport_mode, chunk_ms = await manager.start_session(
            scope_id="scope-owner",
            resolved_profile=SimpleNamespace(profile=profile, llm_config=llm_config),
            config=AllLLMConfigs(
                configs={"openai-transcribe": llm_config}, mcpServers={}
            ),
            api_keys={},
            language_override=None,
        )
        assert resolved_transport_mode == "file"
        assert chunk_ms == 0

        with pytest.raises(TranscriptionSessionNotFoundError):
            await manager.stop_session(scope_id="scope-other", session_id=session_id)

        result = await manager.stop_session(
            scope_id="scope-owner", session_id=session_id
        )
        assert result.is_final is True
        assert result.full_text == ""

    async def test_start_transcription_session_rejects_realtime_on_unsupported_provider(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            save_transcription_profiles(
                dbe,
                [
                    TranscriptionProfile(
                        id=transcription_profile_id,
                        name="Realtime Anthropic",
                        transcriptionLlmConfigId="anthropic-transcribe",
                        transportMode=TranscriptionTransportMode.realtime,
                        chunkMs=1200,
                        language=None,
                    )
                ],
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "anthropic-transcribe": LLMConfig(
                            id="anthropic-transcribe",
                            model="claude-3-7-sonnet-latest",
                            provider="anthropic",
                            api_key_env="ANTHROPIC_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({"ANTHROPIC_API_KEY": "test-key"})

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=transcription_profile_id,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            _assert_transcription_http_error(
                exc.value,
                message="Realtime transcription is unavailable for this provider/model.",
                error_code="unsupported_model",
            )

    async def test_start_transcription_session_rejects_realtime_on_openai_file_model(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            save_transcription_profiles(
                dbe,
                [
                    TranscriptionProfile(
                        id=transcription_profile_id,
                        name="Realtime OpenAI Whisper",
                        transcriptionLlmConfigId="openai-transcribe",
                        transportMode=TranscriptionTransportMode.realtime,
                        chunkMs=1200,
                        language=None,
                    )
                ],
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="whisper-1",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({"OPENAI_API_KEY": "test-key"})

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=transcription_profile_id,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            _assert_transcription_http_error(
                exc.value,
                message="Realtime transcription is unavailable for this provider/model.",
                error_code="unsupported_model",
            )

    async def test_start_transcription_session_maps_typed_unsupported_model_code(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            transcription_profile_id = ID("transcription-primary")
            save_transcription_profiles(
                dbe,
                [
                    TranscriptionProfile(
                        id=transcription_profile_id,
                        name="Typed Error Mapping",
                        transcriptionLlmConfigId="openai-transcribe",
                        transportMode=TranscriptionTransportMode.realtime,
                        chunkMs=1200,
                        language=None,
                    )
                ],
            )
            runner.update_config(
                AllLLMConfigs(
                    configs={
                        "openai-transcribe": LLMConfig(
                            id="openai-transcribe",
                            model="gpt-4o-mini-transcribe",
                            provider="openai",
                            api_key_env="OPENAI_API_KEY",
                            mcpServerIds=[],
                        ),
                    },
                    mcpServers={},
                )
            )
            runner.update_api_keys({"OPENAI_API_KEY": "test-key"})

            async def _raise_typed_unsupported_model(*_args, **_kwargs):
                raise TranscriptionSessionError(
                    "Provider rejected realtime session setup.",
                    error_code="unsupported_model",
                )

            monkeypatch.setattr(
                state.transcription_session_manager,
                "start_session",
                _raise_typed_unsupported_model,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_start_transcription_session(
                        StartTranscriptionSessionRequest(
                            transcriptionProfileId=transcription_profile_id,
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 400
            _assert_transcription_http_error(
                exc.value,
                message="Provider rejected realtime session setup.",
                error_code="unsupported_model",
            )

    async def test_transcription_session_cancel_is_idempotent(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            with runtime_context(state) as ctx:
                response = await route_cancel_transcription_session(
                    CancelTranscriptionSessionRequest(sessionId=ID("missing-session")),
                    ctx,
                )
            assert response.ok is True

    async def test_external_runner_maps_permission_mode_per_framework(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            project_config = ProjectConfig()
            project_state = ProjectStateBackend(
                projectConfigs={project_config.id: project_config},
                projectChatWindowingByProjectConfigId={project_config.id: {}},
                defaultProjectConfigId=project_config.id,
            )
            dbe.write_project(project_state)
            runner = _build_runner(dbe)
            external_runner = ExternalAgentRunner(dbe, runner.websocket_msg_handler)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
                external_agent_runner=external_runner,
            )
            external_config = ExternalAgentConfig(
                id="external-claude-config",
                name="Claude SDK",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
            )
            external_engine_config_id = ID("engine-external-claude")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=external_engine_config_id,
                        name="External Claude Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )

            captured: dict[str, object] = {}

            def _capture_external_start_run(
                engine_config_id,
                config,
                profile,
                inputs,
            ):
                captured["engine_config_id"] = engine_config_id
                captured["config"] = config
                captured["profile"] = profile
                captured["inputs"] = inputs
                return create_agent_run(
                    profile_id=profile.id if profile else None, inputs=inputs
                )

            monkeypatch.setattr(
                external_runner, "start_run", _capture_external_start_run
            )
            monkeypatch.setattr(
                "setta.routers.ai.build_external_agent_preflight_status",
                lambda *_args, **_kwargs: SimpleNamespace(
                    available=True,
                    issues=[],
                ),
            )

            with runtime_context(state) as ctx:
                chat_id = await route_get_llm_response(
                    GetLLMResponseRequest(
                        chatId=None,
                        message=UserChatMessage(
                            content=[MessageTextContent(text="Create a new section.")],
                        ),
                        engineConfigId=external_engine_config_id,
                        agentProfileId=None,
                        thinking=False,
                        projectConfigId=project_config.id,
                        allowUnscoped=True,
                        permissionMode=ChatPermissionMode.yolo,
                        searchEnabled=True,
                    ),
                    ctx,
                )

            assert chat_id is not None
            captured_inputs = captured.get("inputs")
            assert isinstance(captured_inputs, dict)
            assert captured_inputs.get("approvalPolicy") == "bypassPermissions"

    async def test_external_chat_id_rejects_missing_engine_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("chat-external-legacy")
            project_config_id = ID("project-external-legacy")
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=None,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[],
                output_messages=[],
            )
            save_agent_run(dbe, run)

            with pytest.raises(HTTPException) as exc:
                _ensure_external_chat_id_compatible(
                    dbe=dbe,
                    chat_id=chat_id,
                    engine_config_id=ID("engine-external"),
                    project_config_id=project_config_id,
                )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_external_chat_id_allows_matching_engine_metadata(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("chat-external-metadata-ok")
            project_config_id = ID("project-external-metadata-ok")
            engine_config_id = ID("engine-external")
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[],
                output_messages=[],
            )
            save_agent_run(dbe, run)

            compatible_runs = _ensure_external_chat_id_compatible(
                dbe=dbe,
                chat_id=chat_id,
                engine_config_id=engine_config_id,
                project_config_id=project_config_id,
            )
            assert len(compatible_runs) == 1
            assert compatible_runs[0].id == run.id

    async def test_get_external_agent_chat_from_outputs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
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

            assert len(response.messages) == 2
            assert response.waitingForResponse
            assert response.toolCallArguments == {}

    async def test_get_external_agent_chat_context_usage_missing_prompt_tokens(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            engine_config_id = ID("engine-external-context-1")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )
            chat_id = ID("external-context-chat-1")
            project_config_id = ID("external-context-project-1")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external context")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-context-1",
                content=[MessageTextContent(text="Hi context")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 7, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                metadata={"toolType": "codex", "model": "gpt-5-codex"},
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

            assert response.contextUsage is None

    async def test_get_external_agent_chat_context_uses_run_metadata_not_live_config(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def _capture_external_context_usage(_run: AgentRun) -> ResolvedChatContextUsage:
            return ResolvedChatContextUsage(
                context_window_tokens=456,
                context_used_tokens=99,
                estimated=False,
            )

        monkeypatch.setattr(
            ai_module,
            "resolve_external_run_context_usage",
            _capture_external_context_usage,
        )
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-live-config",
            )
            engine_config_id = ID("engine-external-context-source")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )
            chat_id = ID("external-context-chat-source")
            project_config_id = ID("external-context-project-source")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external usage")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-context-source",
                content=[MessageTextContent(text="Hi usage")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 8, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                metadata={"toolType": "codex", "model": "gpt-5-runtime-snapshot"},
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

            assert response.contextUsage is not None
            assert response.contextUsage.contextWindowTokens == 456

    async def test_get_external_agent_chat_context_usage_from_usage_payload(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            engine_config_id = ID("engine-external-context-2")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )
            chat_id = ID("external-context-chat-2")
            project_config_id = ID("external-context-project-2")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external usage")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-context-2",
                content=[MessageTextContent(text="Hi usage")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 8, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                usage={"promptTokens": 99, "completionTokens": 1, "totalTokens": 100},
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

            assert response.contextUsage is not None
            assert response.contextUsage.estimated is True
            assert response.contextUsage.contextUsedTokens == 99
            assert response.contextUsage.contextWindowTokens is None

    async def test_get_external_agent_chat_context_usage_prefers_context_used_tokens(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            engine_config_id = ID("engine-external-context-explicit-used")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )
            chat_id = ID("external-context-chat-explicit-used")
            project_config_id = ID("external-context-project-explicit-used")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external usage")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-context-explicit-used",
                content=[MessageTextContent(text="Hi usage")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 9, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                usage={
                    "promptTokens": 69941,
                    "contextUsedTokens": 24766,
                    "contextWindowTokens": 258400,
                },
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

            assert response.contextUsage is not None
            assert response.contextUsage.estimated is False
            assert response.contextUsage.contextUsedTokens == 24766
            assert response.contextUsage.contextWindowTokens == 258400

    async def test_get_external_agent_chat_ignores_non_finite_usage_values(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            external_config = ExternalAgentConfig(
                name="Codex app-server",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                defaultModel="gpt-5-codex",
            )
            engine_config_id = ID("engine-external-context-3")
            save_external_agent_configs(dbe, [external_config])
            save_engine_configs(
                dbe,
                [
                    EngineConfig(
                        id=engine_config_id,
                        name="External Engine",
                        engineType=EngineType.external_agent,
                        externalAgentConfigId=external_config.id,
                    )
                ],
            )
            chat_id = ID("external-context-chat-3")
            project_config_id = ID("external-context-project-3")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external usage")],
            )
            assistant_message = AssistantChatMessage(
                id="assistant-context-3",
                content=[MessageTextContent(text="Hi usage")],
            )
            run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 9, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, assistant_message],
                usage={
                    "promptTokens": float("inf"),
                    "inputTokens": 21,
                    "contextWindowTokens": float("nan"),
                },
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

            assert response.contextUsage is not None
            assert response.contextUsage.estimated is True
            assert response.contextUsage.contextUsedTokens == 21
            assert response.contextUsage.contextWindowTokens is None

    async def test_get_external_agent_chat_missing_run(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                with pytest.raises(HTTPException) as exc:
                    await route_get_external_agent_chat(
                        GetExternalAgentChatRequest(
                            chatId=ID("missing-external"),
                            projectConfigId=ID("project-ext-missing"),
                        ),
                        ctx,
                    )

            assert exc.value.status_code == 404
            _assert_chat_hydration_http_error(
                exc.value,
                message="Chat not found.",
                error_code="chat_not_found",
            )

    async def test_external_agent_prior_messages_use_external_runs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("external-chat-2")
            project_config_id = ID("project-ext-2")
            external_engine_config_id = ID("engine-external-2")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            external_reply = AssistantChatMessage(
                id="assistant-external",
                content=[MessageTextContent(text="External reply")],
            )
            external_run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=external_engine_config_id,
                started_at=datetime(2024, 1, 6, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, external_reply],
            )
            save_agent_run(dbe, external_run)

            prior_messages = _get_prior_messages_for_engine(
                dbe=dbe,
                engine_type=EngineType.external_agent,
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=external_engine_config_id,
            )

            assert len(prior_messages) == 2
            assert prior_messages[1].content[0].text == "External reply"

    async def test_external_agent_prior_messages_do_not_fallback_to_llm_runs(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("external-chat-no-fallback")
            project_config_id = ID("project-ext-no-fallback")
            external_engine_config_id = ID("engine-external-no-fallback")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            llm_reply = AssistantChatMessage(
                id="assistant-llm-only",
                content=[MessageTextContent(text="LLM-only reply")],
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
            save_agent_run(dbe, llm_run)

            with pytest.raises(HTTPException) as exc:
                _get_prior_messages_for_engine(
                    dbe=dbe,
                    engine_type=EngineType.external_agent,
                    chat_id=chat_id,
                    project_config_id=project_config_id,
                    engine_config_id=external_engine_config_id,
                )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_external_agent_prior_messages_require_matching_engine_config(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            chat_id = ID("chat-prefetched")
            project_config_id = ID("project-prefetched")
            external_engine_config_id = ID("engine-prefetched")
            other_engine_config_id = ID("engine-other")
            user_message = UserChatMessage(
                content=[MessageTextContent(text="Hello external")],
            )
            external_reply = AssistantChatMessage(
                id="assistant-prefetched",
                content=[MessageTextContent(text="External prefetched reply")],
            )
            external_run = _build_external_run(
                chat_id=chat_id,
                project_config_id=project_config_id,
                engine_config_id=external_engine_config_id,
                started_at=datetime(2024, 1, 8, tzinfo=timezone.utc),
                status=AgentRunStatus.completed,
                input_messages=[user_message],
                output_messages=[user_message, external_reply],
            )
            save_agent_run(dbe, external_run)

            with pytest.raises(HTTPException) as exc:
                _get_prior_messages_for_engine(
                    dbe=dbe,
                    engine_type=EngineType.external_agent,
                    chat_id=chat_id,
                    project_config_id=project_config_id,
                    engine_config_id=other_engine_config_id,
                )

            assert exc.value.status_code == 409
            assert exc.value.detail == "Chat engine mismatch; start a new chat."

    async def test_stop_llm_chat(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
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
                response = await route_stop_llm_chat(
                    StopLLMChatRequest(chatId=running_chat_id),
                    ctx,
                )

            assert response.alreadyStopped is False
            assert response.stoppedRunId == running_run.id
            assert response.stoppedMessageId is None
            stopped = load_agent_run(dbe, running_run.id)
            assert stopped is not None
            if stopped is None:
                return
            assert stopped.status == AgentRunStatus.cancelled
            assert stopped.finishedAt is not None

    async def test_stop_llm_chat_reports_already_stopped_when_no_running_run(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )

            with runtime_context(state) as ctx:
                response = await route_stop_llm_chat(
                    StopLLMChatRequest(chatId=ID("missing-chat")),
                    ctx,
                )

            assert response.alreadyStopped is True
            assert response.stoppedRunId is None
            assert response.stoppedMessageId is None

    async def test_stop_llm_chat_does_not_mark_historical_assistant_from_inputs(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            state = _TestState(
                dbe=dbe,
                agent_runner=runner,
                wmh_frontend_sender=runner.websocket_msg_handler,
            )
            engine_config_id = ID("engine-primary")
            _seed_engine_config(dbe, engine_config_id, "primary")
            project_config_id = ID("project-stop-historical")
            running_chat_id = ID("chat-stop-historical")
            prior_assistant = AssistantChatMessage(
                id="assistant-old",
                content=[MessageTextContent(text="Completed historical reply")],
            )
            running_run = _build_run(
                chat_id=running_chat_id,
                project_config_id=project_config_id,
                engine_config_id=engine_config_id,
                started_at=datetime(2024, 1, 10, tzinfo=timezone.utc),
                status=AgentRunStatus.running,
                input_messages=[prior_assistant],
                output_messages=None,
            )
            save_agent_run(dbe, running_run)

            with runtime_context(state) as ctx:
                response = await route_stop_llm_chat(
                    StopLLMChatRequest(chatId=running_chat_id),
                    ctx,
                )

            assert response.alreadyStopped is False
            assert response.stoppedRunId == running_run.id
            assert response.stoppedMessageId is None


def test_branch_messages_replace_and_truncate() -> None:
    first = UserChatMessage(
        id="msg-1",
        content=[MessageTextContent(text="Original")],
    )
    second = AssistantChatMessage(
        id="msg-2",
        content=[MessageTextContent(text="Reply")],
    )
    third = UserChatMessage(
        id="msg-3",
        content=[MessageTextContent(text="Later")],
    )
    edited = UserChatMessage(
        id="edited",
        content=[MessageTextContent(text="Edited")],
    )

    result = _build_branch_messages(
        prior_messages=[first, second, third],
        edited_message=edited,
        branch_from_message_id=ID("msg-1"),
    )

    assert [message.id for message in result] == ["msg-1"]
    assert result[0].content[0].text == "Edited"


def test_branch_messages_missing_target_raises() -> None:
    first = UserChatMessage(
        id="msg-1",
        content=[MessageTextContent(text="Original")],
    )
    edited = UserChatMessage(
        id="edited",
        content=[MessageTextContent(text="Edited")],
    )

    with pytest.raises(KeyError):
        _build_branch_messages(
            prior_messages=[first],
            edited_message=edited,
            branch_from_message_id=ID("missing"),
        )
